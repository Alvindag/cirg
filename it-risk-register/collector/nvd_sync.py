"""
Matches each software asset's vendor/product/version against the NIST
National Vulnerability Database (CVE API 2.0) via keyword search, and
upserts matched CVEs into `vulnerabilities` / `asset_vulnerabilities`.

Keyword search (rather than exact CPE matching) is used deliberately:
building correct CPE URIs requires a vendor/product/version already
mapped to NVD's CPE dictionary, which most manually-entered asset
registers won't have. Keyword search trades some precision for working
out of the box — review matches on assets with generic product names.
"""
import os
import time
import logging

import requests

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nvd_sync")

NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
NVD_API_KEY = os.environ.get("NVD_API_KEY", "").strip()
RESULTS_PER_ASSET = 10
REQUEST_DELAY_SECONDS = 0.7 if NVD_API_KEY else 6.5  # stay under NVD's rate limits


def best_cvss(metrics):
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key)
        if entries:
            data = entries[0]["cvssData"]
            return float(data["baseScore"]), data.get("baseSeverity", data.get("severity"))
    return None, None


def search_cves(query):
    headers = {"apiKey": NVD_API_KEY} if NVD_API_KEY else {}
    resp = requests.get(
        NVD_API_URL,
        params={"keywordSearch": query, "resultsPerPage": RESULTS_PER_ASSET},
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("vulnerabilities", [])


def upsert_vulnerability(conn, cve_item):
    cve = cve_item["cve"]
    cve_id = cve["id"]
    description = next(
        (d["value"] for d in cve.get("descriptions", []) if d["lang"] == "en"), ""
    )
    score, severity = best_cvss(cve.get("metrics", {}))
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO vulnerabilities (cve_id, title, description, cvss_score, cvss_severity, published_date, source, raw_json)
            VALUES (%s, %s, %s, %s, %s, %s, 'nvd', %s)
            ON CONFLICT (cve_id) DO UPDATE
                SET description = EXCLUDED.description,
                    cvss_score = EXCLUDED.cvss_score,
                    cvss_severity = EXCLUDED.cvss_severity,
                    raw_json = EXCLUDED.raw_json
            RETURNING id
            """,
            (cve_id, cve_id, description, score, severity, cve.get("published"), psycopg2_json(cve_item)),
        )
        return cur.fetchone()["id"]


def psycopg2_json(obj):
    import json
    return json.dumps(obj)


def link_asset_vulnerability(conn, asset_id, vulnerability_id):
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
        cur.execute(
            """
            SELECT id, name, vendor, product, version
            FROM assets
            WHERE asset_type = 'software' AND product IS NOT NULL AND product <> ''
            """
        )
        software_assets = cur.fetchall()

    logger.info("Syncing NVD matches for %d software assets", len(software_assets))
    for asset in software_assets:
        query = " ".join(filter(None, [asset["vendor"], asset["product"], asset["version"]]))
        try:
            results = search_cves(query)
        except requests.RequestException:
            logger.exception("NVD lookup failed for asset %s (%s)", asset["id"], query)
            time.sleep(REQUEST_DELAY_SECONDS)
            continue

        for item in results:
            try:
                vuln_id = upsert_vulnerability(conn, item)
                link_asset_vulnerability(conn, asset["id"], vuln_id)
            except Exception:
                logger.exception("Failed to store CVE for asset %s", asset["id"])

        logger.info("Asset %s (%s): %d CVEs matched", asset["id"], asset["name"], len(results))
        time.sleep(REQUEST_DELAY_SECONDS)


if __name__ == "__main__":
    run()
