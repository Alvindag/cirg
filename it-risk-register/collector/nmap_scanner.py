"""
Active vulnerability scan of assets with a known IP address, using nmap's
service/version detection plus two NSE script sets:

  - `vulners`  — matches detected service CPEs against vulners.com's CVE
                 database and returns CVE IDs with real CVSS scores.
                 Requires outbound internet access from this container and
                 the vulners.nse script (installed in the Dockerfile).
  - `vuln`     — nmap's bundled "vuln" category: targeted checks for
                 specific known issues (e.g. smb-vuln-ms17-010,
                 ssl-heartbleed, http-vuln-cve*). Works offline, narrower
                 coverage, no CVSS score.

Only scans assets with `ip_address` set — populate that for the hosts you
want scanned. This is an ACTIVE scan: it sends real probe traffic to each
target. Only scan hosts you're authorized to scan (see README).
"""
import os
import re
import subprocess
import logging
import xml.etree.ElementTree as ET

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nmap_scanner")

NMAP_SCRIPTS = os.environ.get("NMAP_SCRIPTS", "vuln,vulners")
NMAP_PORTS = os.environ.get("NMAP_PORTS", "")  # empty = nmap's default top-1000
NMAP_TIMING = os.environ.get("NMAP_TIMING", "-T3")
NMAP_MIN_CVSS = os.environ.get("NMAP_MIN_CVSS", "0")
NMAP_TIMEOUT_SECONDS = int(os.environ.get("NMAP_SCAN_TIMEOUT_SECONDS", 600))

CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}")


def run_nmap(ip_address):
    cmd = ["nmap", "-sV", NMAP_TIMING, "--script", NMAP_SCRIPTS, "-oX", "-"]
    if NMAP_MIN_CVSS and "vulners" in NMAP_SCRIPTS:
        cmd += ["--script-args", f"vulners.mincvss={NMAP_MIN_CVSS}"]
    if NMAP_PORTS:
        cmd += ["-p", NMAP_PORTS]
    cmd.append(str(ip_address))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=NMAP_TIMEOUT_SECONDS)
    if result.returncode != 0:
        logger.error("nmap failed for %s: %s", ip_address, result.stderr.strip()[:500])
        return None
    return result.stdout


def parse_findings(xml_output):
    """Returns a list of dicts: {cve_id, title, cvss_score, script}."""
    findings = []
    if not xml_output:
        return findings

    root = ET.fromstring(xml_output)
    for host in root.findall("host"):
        for port_or_host_script in host.findall(".//script"):
            script_id = port_or_host_script.get("id", "")

            if script_id == "vulners":
                findings.extend(_parse_vulners(port_or_host_script))
            elif script_id.startswith(("vuln", "smb-vuln", "ssl-", "http-vuln", "ftp-vuln", "rdp-vuln")):
                finding = _parse_generic_vuln(port_or_host_script)
                if finding:
                    findings.append(finding)

    return findings


def _parse_vulners(script_elem):
    findings = []
    for cpe_table in script_elem.findall("table"):
        for entry_table in cpe_table.findall("table"):
            elems = {e.get("key"): e.text for e in entry_table.findall("elem")}
            cve_id = elems.get("id")
            if not cve_id or not CVE_RE.match(cve_id):
                continue
            try:
                cvss = float(elems.get("cvss")) if elems.get("cvss") else None
            except ValueError:
                cvss = None
            findings.append({
                "cve_id": cve_id,
                "title": cve_id,
                "cvss_score": cvss,
                "script": "vulners",
            })
    return findings


def _parse_generic_vuln(script_elem):
    output = script_elem.get("output", "") or ""
    if "VULNERABLE" not in output and "State: VULNERABLE" not in output:
        return None
    cve_match = CVE_RE.search(output)
    title_elem = script_elem.find("table")
    title = None
    if title_elem is not None:
        title_kv = {e.get("key"): e.text for e in title_elem.findall("elem")}
        title = title_kv.get("title")
    return {
        "cve_id": cve_match.group(0) if cve_match else None,
        "title": title or script_elem.get("id"),
        "cvss_score": None,
        "script": script_elem.get("id"),
    }


def upsert_finding(conn, finding):
    cve_id = finding["cve_id"]
    title = finding["title"]
    cvss = finding["cvss_score"]
    severity = None
    if cvss is not None:
        severity = "CRITICAL" if cvss >= 9 else "HIGH" if cvss >= 7 else "MEDIUM" if cvss >= 4 else "LOW"

    with conn.cursor() as cur:
        if cve_id:
            cur.execute(
                """
                INSERT INTO vulnerabilities (cve_id, title, description, cvss_score, cvss_severity, source)
                VALUES (%s, %s, %s, %s, %s, 'nmap')
                ON CONFLICT (cve_id) DO UPDATE
                    SET cvss_score = COALESCE(EXCLUDED.cvss_score, vulnerabilities.cvss_score),
                        cvss_severity = COALESCE(EXCLUDED.cvss_severity, vulnerabilities.cvss_severity)
                RETURNING id
                """,
                (cve_id, title, f"Detected by nmap script: {finding['script']}", cvss, severity),
            )
        else:
            cur.execute(
                "SELECT id FROM vulnerabilities WHERE cve_id IS NULL AND title = %s AND source = 'nmap'",
                (title,),
            )
            existing = cur.fetchone()
            if existing:
                return existing["id"]
            cur.execute(
                """
                INSERT INTO vulnerabilities (cve_id, title, description, source)
                VALUES (NULL, %s, %s, 'nmap')
                RETURNING id
                """,
                (title, f"Detected by nmap script: {finding['script']}"),
            )
        return cur.fetchone()["id"]


def link_finding(conn, asset_id, vulnerability_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO asset_vulnerabilities (asset_id, vulnerability_id, last_seen)
            VALUES (%s, %s, now())
            ON CONFLICT (asset_id, vulnerability_id) DO UPDATE SET last_seen = now()
            """,
            (asset_id, vulnerability_id),
        )
    conn.commit()


def run():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id, name, ip_address FROM assets WHERE ip_address IS NOT NULL")
        targets = cur.fetchall()

    if not targets:
        logger.info("No assets with an IP address set — nothing to scan")
        return

    matched, unmatched_hosts = 0, 0
    for asset in targets:
        logger.info("Scanning %s (%s)...", asset["name"], asset["ip_address"])
        try:
            xml_output = run_nmap(asset["ip_address"])
        except subprocess.TimeoutExpired:
            logger.error("nmap timed out scanning %s", asset["ip_address"])
            unmatched_hosts += 1
            continue

        findings = parse_findings(xml_output)
        for finding in findings:
            try:
                vuln_id = upsert_finding(conn, finding)
                link_finding(conn, asset["id"], vuln_id)
                matched += 1
            except Exception:
                logger.exception("Failed to store nmap finding for asset %s", asset["id"])

        logger.info("Asset %s: %d finding(s)", asset["name"], len(findings))

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO scanner_imports (source, filename, matched_count, unmatched_count) VALUES (%s, %s, %s, %s)",
            ("nmap", f"live scan of {len(targets)} host(s)", matched, unmatched_hosts),
        )
    conn.commit()
    logger.info("nmap scan complete: %d findings across %d host(s)", matched, len(targets))


if __name__ == "__main__":
    run()
