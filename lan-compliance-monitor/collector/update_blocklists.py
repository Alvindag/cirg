"""
Writes the domain_categories table out to the per-category text files
Squid's dstdomain ACLs read, then asks Squid to reload. Run this after
editing domain_categories (e.g. via the dashboard's admin page) or on
a schedule.
"""
import logging

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("update_blocklists")

BLOCKLIST_DIR = "/etc/squid/blocklists"


def run():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.name, dc.domain
            FROM domain_categories dc
            JOIN categories c ON c.id = dc.category_id
            WHERE c.is_blocked = TRUE
            ORDER BY c.name, dc.domain
            """
        )
        by_category = {}
        for name, domain in cur.fetchall():
            by_category.setdefault(name, []).append(domain)

    for category, domains in by_category.items():
        path = f"{BLOCKLIST_DIR}/{category}.txt"
        with open(path, "w") as f:
            f.write("\n".join(domains) + "\n")
        logger.info("Wrote %d domains to %s", len(domains), path)

    # This container doesn't share a process namespace with the squid
    # container, so it can't signal it directly. After blocklists change,
    # reload Squid from the host with:
    #   docker compose exec squid squid -k reconfigure
    logger.info("Blocklists written. Run 'docker compose exec squid squid -k reconfigure' to apply.")


if __name__ == "__main__":
    run()
