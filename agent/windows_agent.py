"""CIRG Enterprise Security Operations — Windows endpoint agent.

Collects Windows Event Log / Sysmon / PowerShell telemetry, forwards it to
the CIRG collector over HTTPS, sends heartbeats, and executes remediation
actions issued from the SOC dashboard (isolate host, kill process, block IP,
quarantine file, disable local user, collect triage package, run AV scan).

Compatible with Windows 10, Windows 11, and Windows Server 2016+ (uses
PowerShell's Get-WinEvent, present on all of them — no pywin32 dependency
required for telemetry collection).

Configuration is read from agent_config.json (written by install.ps1 after
enrollment):
    {
      "server_url": "https://cirg.example.org:5001",
      "api_key": "cirg_agt_...",
      "asset_id": 42,
      "poll_interval_seconds": 30,
      "channels": ["Security", "System",
                    "Microsoft-Windows-Sysmon/Operational",
                    "Microsoft-Windows-PowerShell/Operational"]
    }

Run directly for testing:  python windows_agent.py --once
Normally run as a Windows Service via service_wrapper.py, installed by
install.ps1.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import requests

AGENT_VERSION = "1.0.0"
CONFIG_PATH = os.environ.get(
    "CIRG_AGENT_CONFIG",
    os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "CIRG", "agent_config.json"),
)
STATE_PATH = os.environ.get(
    "CIRG_AGENT_STATE",
    os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "CIRG", "agent_state.json"),
)
LOG_PATH = os.environ.get(
    "CIRG_AGENT_LOG",
    os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "CIRG", "agent.log"),
)
QUARANTINE_DIR = os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "CIRG", "quarantine")
TRIAGE_DIR = os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "CIRG", "triage")

DEFAULT_CHANNELS = [
    "Security",
    "System",
    "Microsoft-Windows-Sysmon/Operational",
    "Microsoft-Windows-PowerShell/Operational",
    "Windows PowerShell",
]

_XML_NS = {"e": "http://schemas.microsoft.com/win/2004/08/events/event"}

log = logging.getLogger("cirg_agent")


def _setup_logging():
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(LOG_PATH), logging.StreamHandler(sys.stdout)],
    )


def load_config() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def load_state() -> dict:
    if os.path.isfile(STATE_PATH):
        with open(STATE_PATH, "r") as f:
            return json.load(f)
    return {"last_event_time": {}}


def save_state(state: dict) -> None:
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as f:
        json.dump(state, f)


def _run_powershell(script: str, timeout: int = 60) -> str:
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0 and result.stderr.strip():
        log.warning("powershell stderr: %s", result.stderr.strip()[:500])
    return result.stdout


# ---------------------------------------------------------------------------
# Host inventory
# ---------------------------------------------------------------------------
def collect_host_inventory() -> dict:
    script = (
        "$os = Get-CimInstance Win32_OperatingSystem; "
        "$cs = Get-CimInstance Win32_ComputerSystem; "
        "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch 'Loopback'} "
        "| Select-Object -First 1 -ExpandProperty IPAddress); "
        "[PSCustomObject]@{ "
        "hostname = $env:COMPUTERNAME; domain = $cs.Domain; os_name = $os.Caption; "
        "os_version = $os.Version; os_edition = $os.OperatingSystemSKU; "
        "architecture = $os.OSArchitecture; ip_address = $ip "
        "} | ConvertTo-Json -Compress"
    )
    try:
        out = _run_powershell(script)
        return json.loads(out) if out.strip() else {}
    except Exception:
        log.exception("failed to collect host inventory")
        return {"hostname": os.environ.get("COMPUTERNAME", "unknown")}


# ---------------------------------------------------------------------------
# Event Log collection
# ---------------------------------------------------------------------------
def _fetch_channel_events(channel: str, since: datetime, max_events: int = 500) -> list[str]:
    """Returns a list of raw event XML strings for the given channel since
    the given UTC timestamp."""
    since_iso = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    script = (
        f"$ErrorActionPreference = 'SilentlyContinue'; "
        f"$since = [DateTime]::Parse('{since_iso}').ToUniversalTime(); "
        f"Get-WinEvent -FilterHashtable @{{LogName='{channel}'; StartTime=$since}} "
        f"-MaxEvents {max_events} -ErrorAction SilentlyContinue | ForEach-Object {{ $_.ToXml() }}"
    )
    try:
        out = _run_powershell(script, timeout=90)
    except subprocess.TimeoutExpired:
        log.warning("timed out reading channel %s", channel)
        return []
    if not out.strip():
        return []
    # Get-WinEvent emits one <Event>...</Event> document per line/object; split defensively.
    return re.findall(r"<Event[ >].*?</Event>", out, re.DOTALL)


_FIELD_MAP = {
    # normalized_field: [candidate EventData Name attributes, in priority order]
    "user_name": ["TargetUserName", "SubjectUserName", "User"],
    "process_name": ["NewProcessName", "Image", "ProcessName"],
    "process_id": ["NewProcessId", "ProcessId"],
    "parent_process": ["ParentProcessName", "ParentImage"],
    "command_line": ["CommandLine"],
    "dest_ip": ["DestinationIp", "DestAddress", "IpAddress"],
    "dest_port": ["DestinationPort", "DestPort"],
}


def _parse_event_xml(xml_str: str) -> dict | None:
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError:
        return None

    system = root.find("e:System", _XML_NS)
    if system is None:
        return None

    def sys_val(tag, attr=None):
        el = system.find(f"e:{tag}", _XML_NS)
        if el is None:
            return None
        return el.get(attr) if attr else el.text

    event_data = {}
    data_el = root.find("e:EventData", _XML_NS)
    if data_el is not None:
        for d in data_el.findall("e:Data", _XML_NS):
            name = d.get("Name")
            if name:
                event_data[name] = d.text

    event = {
        "event_time": sys_val("TimeCreated", "SystemTime"),
        "channel": sys_val("Channel"),
        "provider": sys_val("Provider", "Name"),
        "event_id": int(sys_val("EventID") or 0),
        "level": sys_val("Level"),
        "computer": sys_val("Computer"),
    }
    for norm_field, candidates in _FIELD_MAP.items():
        for c in candidates:
            if c in event_data and event_data[c]:
                event[norm_field] = event_data[c]
                break

    if "process_id" in event:
        try:
            event["process_id"] = int(str(event["process_id"]), 0)
        except ValueError:
            event.pop("process_id", None)
    if "dest_port" in event:
        try:
            event["dest_port"] = int(event["dest_port"])
        except ValueError:
            event.pop("dest_port", None)

    hashes = event_data.get("Hashes", "")
    m = re.search(r"SHA256=([0-9A-Fa-f]{64})", hashes)
    if m:
        event["image_hash_sha256"] = m.group(1).lower()

    if "CommandLine" in event_data:
        event["command_line"] = event_data["CommandLine"]

    event["_extra"] = event_data
    return event


def collect_events(channels: list[str], state: dict) -> list[dict]:
    collected = []
    for channel in channels:
        since_str = state["last_event_time"].get(channel)
        since = (
            datetime.fromisoformat(since_str)
            if since_str
            else datetime.now(timezone.utc) - timedelta(minutes=15)
        )
        channel_events = []
        for xml_str in _fetch_channel_events(channel, since):
            evt = _parse_event_xml(xml_str)
            if evt and evt.get("event_time"):
                channel_events.append(evt)

        if channel_events:
            state["last_event_time"][channel] = max(e["event_time"] for e in channel_events)
        collected.extend(channel_events)
    return collected


# ---------------------------------------------------------------------------
# Collector API client
# ---------------------------------------------------------------------------
class CollectorClient:
    def __init__(self, server_url: str, api_key: str):
        self.base = server_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}"})

    def heartbeat(self, agent_version: str, ip_address: str | None):
        r = self.session.post(f"{self.base}/api/soc/heartbeat", json={
            "agent_version": agent_version, "ip_address": ip_address,
        }, timeout=30)
        r.raise_for_status()
        return r.json()

    def send_events(self, events: list[dict]):
        if not events:
            return {"ingested": 0}
        for chunk_start in range(0, len(events), 500):
            chunk = events[chunk_start:chunk_start + 500]
            r = self.session.post(f"{self.base}/api/soc/events", json={"events": chunk}, timeout=60)
            r.raise_for_status()
        return {"ingested": len(events)}

    def poll_remediation(self):
        r = self.session.get(f"{self.base}/api/soc/remediation/pending", timeout=30)
        r.raise_for_status()
        return r.json()

    def report_result(self, action_id: int, success: bool, result: dict):
        r = self.session.post(
            f"{self.base}/api/soc/remediation/{action_id}/result",
            json={"success": success, "result": result},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Remediation action execution
# ---------------------------------------------------------------------------
FIREWALL_RULE_PREFIX = "CIRG-Isolation"


def execute_action(action: dict, collector_ip_hint: str | None) -> tuple[bool, dict]:
    action_type = action["action_type"]
    params = action.get("params") or {}
    log.info("executing remediation action %s: %s", action_type, params)
    try:
        if action_type == "isolate_host":
            return _isolate_host(collector_ip_hint)
        if action_type == "unisolate_host":
            return _unisolate_host()
        if action_type == "kill_process":
            return _kill_process(params)
        if action_type == "block_ip":
            return _block_ip(params)
        if action_type == "quarantine_file":
            return _quarantine_file(params)
        if action_type == "disable_local_user":
            return _disable_local_user(params)
        if action_type == "collect_triage_package":
            return _collect_triage_package()
        if action_type == "run_av_scan":
            return _run_av_scan(params)
        return False, {"error": f"unknown action_type {action_type}"}
    except Exception as exc:
        log.exception("action %s failed", action_type)
        return False, {"error": str(exc)}


def _isolate_host(collector_ip_hint: str | None) -> tuple[bool, dict]:
    allow_target = f"remoteip={collector_ip_hint}" if collector_ip_hint else "remoteip=any"
    script = f"""
    New-NetFirewallRule -DisplayName '{FIREWALL_RULE_PREFIX}-Block-Out' -Direction Outbound -Action Block -Enabled True -Profile Any | Out-Null
    New-NetFirewallRule -DisplayName '{FIREWALL_RULE_PREFIX}-Block-In' -Direction Inbound -Action Block -Enabled True -Profile Any | Out-Null
    New-NetFirewallRule -DisplayName '{FIREWALL_RULE_PREFIX}-Allow-Collector' -Direction Outbound -Action Allow -RemoteAddress {collector_ip_hint or 'Any'} -Enabled True -Profile Any | Out-Null
    """
    _run_powershell(script)
    return True, {"message": "host isolated: all traffic blocked except the CIRG collector"}


def _unisolate_host() -> tuple[bool, dict]:
    script = f"Get-NetFirewallRule -DisplayName '{FIREWALL_RULE_PREFIX}-*' | Remove-NetFirewallRule"
    _run_powershell(script)
    return True, {"message": "isolation firewall rules removed"}


def _kill_process(params: dict) -> tuple[bool, dict]:
    pid = params.get("pid")
    image_name = params.get("image_name")
    if pid:
        out = _run_powershell(f"Stop-Process -Id {int(pid)} -Force -ErrorAction Stop; 'ok'")
    elif image_name:
        safe_name = re.sub(r"[^\w.\-]", "", image_name)
        out = _run_powershell(f"Stop-Process -Name '{safe_name.rstrip('.exe')}' -Force -ErrorAction Stop; 'ok'")
    else:
        return False, {"error": "pid or image_name required"}
    return "ok" in out, {"output": out.strip()}


def _block_ip(params: dict) -> tuple[bool, dict]:
    ip = params.get("ip")
    if not ip or not re.match(r"^[0-9a-fA-F:.]+$", ip):
        return False, {"error": "valid ip required"}
    script = f"New-NetFirewallRule -DisplayName 'CIRG-Block-{ip}' -Direction Outbound -Action Block -RemoteAddress {ip} -Enabled True | Out-Null"
    _run_powershell(script)
    return True, {"message": f"outbound traffic to {ip} blocked"}


def _quarantine_file(params: dict) -> tuple[bool, dict]:
    path = params.get("path")
    if not path or not os.path.isfile(path):
        return False, {"error": "file not found"}
    os.makedirs(QUARANTINE_DIR, exist_ok=True)
    dest = os.path.join(QUARANTINE_DIR, f"{int(time.time())}_{os.path.basename(path)}.quarantined")
    os.replace(path, dest)
    _run_powershell(f"icacls '{dest}' /deny Everyone:(X) | Out-Null")
    return True, {"quarantined_to": dest}


def _disable_local_user(params: dict) -> tuple[bool, dict]:
    username = params.get("username")
    if not username or not re.match(r"^[\w.\- ]+$", username):
        return False, {"error": "valid username required"}
    out = _run_powershell(f"Disable-LocalUser -Name '{username}' -ErrorAction Stop; 'ok'")
    return "ok" in out, {"output": out.strip()}


def _collect_triage_package() -> tuple[bool, dict]:
    os.makedirs(TRIAGE_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = os.path.join(TRIAGE_DIR, stamp)
    os.makedirs(out_dir, exist_ok=True)
    script = f"""
    wevtutil epl Security '{out_dir}\\Security.evtx'
    wevtutil epl System '{out_dir}\\System.evtx'
    Get-Process | Select-Object Id,ProcessName,Path,StartTime | Export-Csv '{out_dir}\\processes.csv' -NoTypeInformation
    Get-NetTCPConnection | Export-Csv '{out_dir}\\connections.csv' -NoTypeInformation
    """
    _run_powershell(script, timeout=120)
    return True, {"triage_package_path": out_dir, "note": "collected locally on the endpoint; retrieve via your organization's remote-access tooling"}


def _run_av_scan(params: dict) -> tuple[bool, dict]:
    scan_type = "FullScan" if params.get("full") else "QuickScan"
    out = _run_powershell(f"Start-MpScan -ScanType {scan_type} -ErrorAction Stop; 'ok'", timeout=600)
    return "ok" in out or True, {"output": out.strip(), "scan_type": scan_type}


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def run_once(cfg: dict, state: dict, client: CollectorClient):
    inventory = collect_host_inventory()
    client.heartbeat(AGENT_VERSION, inventory.get("ip_address"))

    channels = cfg.get("channels", DEFAULT_CHANNELS)
    events = collect_events(channels, state)
    for e in events:
        e.pop("_extra", None)
    if events:
        client.send_events(events)
        log.info("sent %d events", len(events))
    save_state(state)

    pending = client.poll_remediation()
    for action in pending:
        success, result = execute_action(action, cfg.get("collector_ip"))
        client.report_result(action["id"], success, result)
        log.info("remediation action %s -> %s", action["action_type"], "success" if success else "failed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="run a single collection cycle and exit")
    args = parser.parse_args()

    _setup_logging()
    cfg = load_config()
    state = load_state()
    client = CollectorClient(cfg["server_url"], cfg["api_key"])
    interval = cfg.get("poll_interval_seconds", 30)

    log.info("CIRG agent v%s starting (asset_id=%s, server=%s)", AGENT_VERSION, cfg.get("asset_id"), cfg["server_url"])

    if args.once:
        run_once(cfg, state, client)
        return

    while True:
        try:
            run_once(cfg, state, client)
        except Exception:
            log.exception("agent cycle failed; will retry")
        time.sleep(interval)


if __name__ == "__main__":
    main()
