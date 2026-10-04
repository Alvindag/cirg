"""
Polls each Windows endpoint over WinRM and runs a PowerShell one-liner to
pull Defender/firewall/BitLocker/patch status, then writes a posture row.

Target machines must have WinRM enabled and allow the polling account
(see scripts/setup-windows-clients.ps1). Host list comes from hosts.txt
(one hostname/IP per line) — populate it from AD or DHCP reservations.
"""
import os
import json
import logging

import winrm

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("posture_collector")

HOSTS_FILE = os.environ.get("HOSTS_FILE", "/app/hosts.txt")

POWERSHELL_PROBE = r"""
$ErrorActionPreference = 'SilentlyContinue'
$defender = Get-MpComputerStatus
$fw = Get-NetFirewallProfile
$bl = (Get-BitLockerVolume -MountPoint $env:SystemDrive).ProtectionStatus
$updates = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search("IsInstalled=0").Updates.Count
$os = (Get-CimInstance Win32_OperatingSystem)

$result = [ordered]@{
    os_version           = $os.Caption
    defender_enabled     = [bool]$defender.AntivirusEnabled
    defender_up_to_date  = -not $defender.AntivirusSignatureAge -or ($defender.AntivirusSignatureAge -le 2)
    realtime_protection  = [bool]$defender.RealTimeProtectionEnabled
    firewall_domain_on   = [bool]($fw | Where-Object {$_.Name -eq 'Domain'}).Enabled
    firewall_private_on  = [bool]($fw | Where-Object {$_.Name -eq 'Private'}).Enabled
    firewall_public_on   = [bool]($fw | Where-Object {$_.Name -eq 'Public'}).Enabled
    bitlocker_on         = ($bl -eq 1)
    pending_updates      = [int]$updates
    last_boot            = $os.LastBootUpTime.ToString("o")
}
$result | ConvertTo-Json -Compress
"""


def read_hosts():
    if not os.path.exists(HOSTS_FILE):
        logger.warning("Hosts file %s not found; nothing to poll", HOSTS_FILE)
        return []
    with open(HOSTS_FILE) as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]


def poll_host(hostname):
    session = winrm.Session(
        hostname,
        auth=(os.environ["WINRM_USERNAME"], os.environ["WINRM_PASSWORD"]),
        transport="ntlm",
    )
    result = session.run_ps(POWERSHELL_PROBE)
    if result.status_code != 0:
        logger.error("WinRM probe failed on %s: %s", hostname, result.std_err.decode(errors="replace"))
        return None
    try:
        return json.loads(result.std_out.decode())
    except json.JSONDecodeError:
        logger.error("Could not parse posture JSON from %s", hostname)
        return None


def write_posture(conn, hostname, data, reachable):
    with conn.cursor() as cur:
        if not reachable:
            cur.execute(
                "INSERT INTO endpoint_posture (ts, hostname, reachable) VALUES (now(), %s, FALSE)",
                (hostname,),
            )
        else:
            cur.execute(
                """
                INSERT INTO endpoint_posture
                    (ts, hostname, os_version, defender_enabled, defender_up_to_date,
                     realtime_protection, firewall_domain_on, firewall_private_on,
                     firewall_public_on, bitlocker_on, pending_updates, last_boot, reachable)
                VALUES (now(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                """,
                (
                    hostname, data.get("os_version"), data.get("defender_enabled"),
                    data.get("defender_up_to_date"), data.get("realtime_protection"),
                    data.get("firewall_domain_on"), data.get("firewall_private_on"),
                    data.get("firewall_public_on"), data.get("bitlocker_on"),
                    data.get("pending_updates"), data.get("last_boot"),
                ),
            )
    conn.commit()


def run():
    hosts = read_hosts()
    conn = get_conn()
    for hostname in hosts:
        try:
            data = poll_host(hostname)
            write_posture(conn, hostname, data, reachable=data is not None)
            logger.info("Polled %s: %s", hostname, "ok" if data else "unreachable")
        except Exception:
            logger.exception("Error polling %s", hostname)
            write_posture(conn, hostname, None, reachable=False)


if __name__ == "__main__":
    run()
