"""
Tails the Squid access.log (native format), classifies each request by
domain category, flags policy violations, and writes to Postgres.

Squid native log line:
  <ts>.<ms> <elapsed> <client_ip> <action>/<code> <bytes> <method> <url> <ident> <peer>/<peerhost> <type>
"""
import os
import time
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

import tldextract

from db import get_conn, get_or_create_user, get_category_for_domain, bulk_insert_events

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ingest_squid_logs")

LOG_PATH = os.environ.get("SQUID_LOG_PATH", "/var/log/squid/access.log")
STATE_PATH = "/tmp/squid_ingest.offset"
BATCH_SIZE = 200
POLL_INTERVAL_SECONDS = 5

# Business hours policy used for the "off-hours" compliance rule.
OFF_HOURS_START = 20  # 8pm
OFF_HOURS_END = 6     # 6am


def extract_domain(url):
    try:
        parsed = urlparse(url if "://" in url else f"http://{url}")
        host = parsed.hostname or url
    except ValueError:
        host = url
    ext = tldextract.extract(host)
    return ".".join(p for p in [ext.domain, ext.suffix] if p) or host


def parse_line(line):
    parts = line.split()
    if len(parts) < 10:
        return None
    try:
        ts = datetime.fromtimestamp(float(parts[0]), tz=timezone.utc)
        client_ip = parts[2]
        action = parts[3].split("/")[0]
        status_code = int(parts[3].split("/")[1]) if "/" in parts[3] else None
        byte_count = int(parts[4])
        method = parts[5]
        url = parts[6]
    except (ValueError, IndexError):
        return None
    domain = extract_domain(url)
    return {
        "ts": ts,
        "client_ip": client_ip,
        "action": action,
        "status_code": status_code,
        "bytes": byte_count,
        "method": method,
        "url": url,
        "domain": domain,
    }


def load_offset():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return int(f.read().strip() or 0)
    return 0


def save_offset(offset):
    with open(STATE_PATH, "w") as f:
        f.write(str(offset))


def process_batch(conn, parsed_events):
    rows = []
    violations = []
    for ev in parsed_events:
        user_id = get_or_create_user(conn, ip_address=ev["client_ip"])
        category = get_category_for_domain(conn, ev["domain"])
        category_id = category["id"] if category else None

        rows.append((
            ev["ts"], ev["client_ip"], user_id, ev["method"], ev["url"],
            ev["domain"], ev["status_code"], ev["bytes"], ev["action"], category_id,
        ))

        if category and category["is_blocked"]:
            violations.append((ev["ts"], user_id, "blocked-category",
                                f"{ev['domain']} ({category['name']})", "high"))
        hour = ev["ts"].astimezone().hour
        if hour >= OFF_HOURS_START or hour < OFF_HOURS_END:
            violations.append((ev["ts"], user_id, "off-hours",
                                f"Access to {ev['domain']} at {ev['ts'].isoformat()}", "low"))

    bulk_insert_events(conn, rows)

    if violations:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO compliance_violations (ts, user_id, rule, detail, severity)
                VALUES (%s, %s, %s, %s, %s)
                """,
                violations,
            )
        conn.commit()

    logger.info("Ingested %d events, %d violations", len(rows), len(violations))


def tail_loop():
    conn = get_conn()
    offset = load_offset()

    while True:
        if not os.path.exists(LOG_PATH):
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        with open(LOG_PATH) as f:
            f.seek(offset)
            batch = []
            for line in f:
                parsed = parse_line(line)
                if parsed:
                    batch.append(parsed)
                if len(batch) >= BATCH_SIZE:
                    process_batch(conn, batch)
                    batch = []
            if batch:
                process_batch(conn, batch)
            offset = f.tell()
            save_offset(offset)

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    tail_loop()
