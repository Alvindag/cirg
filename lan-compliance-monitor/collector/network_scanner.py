"""
Periodic ARP/ping sweep of the LAN CIDR to build a device inventory and
flag MAC addresses never seen before as potentially rogue. Requires the
`nmap` binary in the container (installed in the Dockerfile) and
NET_ADMIN/NET_RAW capability for ARP scanning.
"""
import os
import re
import subprocess
import logging

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("network_scanner")

NETWORK_CIDR = os.environ.get("NETWORK_CIDR", "192.168.1.0/24")

# Matches nmap -oG output lines, e.g.:
# Host: 192.168.1.10 ()   Status: Up
# Host: 192.168.1.10 ()   Ports: ...  MAC Address: AA:BB:CC:DD:EE:FF (Vendor Name)
HOST_RE = re.compile(r"Host: (?P<ip>[\d.]+) \((?P<hostname>[^)]*)\)\s+Status: Up")
MAC_RE = re.compile(r"MAC Address: (?P<mac>[0-9A-F:]{17}) \((?P<vendor>[^)]*)\)")


def run_scan():
    result = subprocess.run(
        ["nmap", "-sn", "-oG", "-", NETWORK_CIDR],
        capture_output=True, text=True, timeout=300, check=True,
    )
    devices = {}
    ip, hostname = None, None
    for line in result.stdout.splitlines():
        host_match = HOST_RE.search(line)
        if host_match:
            ip, hostname = host_match.group("ip"), host_match.group("hostname") or None
        mac_match = MAC_RE.search(line)
        if mac_match and ip:
            devices[mac_match.group("mac")] = {
                "ip": ip,
                "hostname": hostname,
                "vendor": mac_match.group("vendor") or None,
            }
            ip, hostname = None, None
    return devices


def upsert_devices(conn, devices):
    new_count = 0
    with conn.cursor() as cur:
        for mac, info in devices.items():
            cur.execute("SELECT is_known FROM network_devices WHERE mac_address = %s", (mac,))
            row = cur.fetchone()
            is_new = row is None
            if is_new:
                new_count += 1
            cur.execute(
                """
                INSERT INTO network_devices (mac_address, ip_address, vendor, hostname, first_seen, last_seen, is_flagged)
                VALUES (%s, %s, %s, %s, now(), now(), %s)
                ON CONFLICT (mac_address) DO UPDATE
                    SET ip_address = EXCLUDED.ip_address,
                        hostname = EXCLUDED.hostname,
                        last_seen = now()
                """,
                (mac, info["ip"], info["vendor"], info["hostname"], is_new),
            )
    conn.commit()
    return new_count


def run():
    devices = run_scan()
    conn = get_conn()
    new_count = upsert_devices(conn, devices)
    logger.info("Scan found %d devices (%d new/unflagged)", len(devices), new_count)


if __name__ == "__main__":
    run()
