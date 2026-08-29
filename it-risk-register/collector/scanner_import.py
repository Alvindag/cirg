"""
Imports vulnerability-scanner output (OpenVAS/Nessus/Qualys or any tool you
can export to CSV) and links findings to existing assets.

Expected CSV columns (case-insensitive, extra columns ignored):
  asset_identifier   IP address, hostname, or exact asset name — matched
                      against assets.ip_address, assets.name in that order
  cve_id             optional (blank for findings without a CVE, e.g. misconfig)
  title              finding title (required if cve_id is blank)
  description        optional
  cvss_score         optional, 0.0-10.0
  cvss_severity      optional, e.g. HIGH

Usage:
  python scanner_import.py --file /app/imports/scan.csv --source "OpenVAS"
"""
import argparse
import csv
import logging

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("scanner_import")


def find_asset(conn, identifier):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM assets WHERE ip_address = %s", (identifier,))
        row = cur.fetchone()
        if row:
            return row["id"]
        cur.execute("SELECT id FROM assets WHERE name = %s", (identifier,))
        row = cur.fetchone()
        return row["id"] if row else None


def upsert_finding(conn, row, source):
    cve_id = (row.get("cve_id") or "").strip() or None
    title = (row.get("title") or cve_id or "Untitled finding").strip()
    description = (row.get("description") or "").strip()
    cvss_score = row.get("cvss_score")
    cvss_score = float(cvss_score) if cvss_score else None
    cvss_severity = (row.get("cvss_severity") or "").strip() or None

    with conn.cursor() as cur:
        if cve_id:
            cur.execute(
                """
                INSERT INTO vulnerabilities (cve_id, title, description, cvss_score, cvss_severity, source)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (cve_id) DO UPDATE
                    SET cvss_score = COALESCE(EXCLUDED.cvss_score, vulnerabilities.cvss_score),
                        cvss_severity = COALESCE(EXCLUDED.cvss_severity, vulnerabilities.cvss_severity)
                RETURNING id
                """,
                (cve_id, title, description, cvss_score, cvss_severity, source),
            )
            return cur.fetchone()["id"]
        else:
            # No CVE identifier: dedupe on (title, source) instead of the cve_id unique constraint.
            cur.execute(
                "SELECT id FROM vulnerabilities WHERE cve_id IS NULL AND title = %s AND source = %s",
                (title, source),
            )
            existing = cur.fetchone()
            if existing:
                return existing["id"]
            cur.execute(
                """
                INSERT INTO vulnerabilities (cve_id, title, description, cvss_score, cvss_severity, source)
                VALUES (NULL, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (title, description, cvss_score, cvss_severity, source),
            )
            return cur.fetchone()["id"]


def run(file_path, source):
    conn = get_conn()
    matched, unmatched = 0, 0

    with open(file_path, newline="") as f:
        reader = csv.DictReader(f)
        reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
        for row in reader:
            identifier = (row.get("asset_identifier") or "").strip()
            asset_id = find_asset(conn, identifier) if identifier else None
            if not asset_id:
                logger.warning("No asset match for identifier %r — skipping row", identifier)
                unmatched += 1
                continue

            vuln_id = upsert_finding(conn, row, source)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO asset_vulnerabilities (asset_id, vulnerability_id, last_seen)
                    VALUES (%s, %s, now())
                    ON CONFLICT (asset_id, vulnerability_id) DO UPDATE SET last_seen = now()
                    """,
                    (asset_id, vuln_id),
                )
            matched += 1

    conn.commit()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO scanner_imports (source, filename, matched_count, unmatched_count) VALUES (%s, %s, %s, %s)",
            (source, file_path, matched, unmatched),
        )
    conn.commit()
    logger.info("Import complete: %d findings linked, %d rows unmatched", matched, unmatched)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    run(args.file, args.source)
