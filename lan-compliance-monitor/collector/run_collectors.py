"""
Entrypoint for the collector container. Runs the Squid log tailer
continuously in a background thread, and the slower AD/posture/network/
blocklist jobs on their own intervals in the foreground.

AD, WinRM, and network-scan jobs are skipped (with a log line) if their
required environment variables aren't set, so this works out of the box
in usage-only mode and grows into full posture monitoring once you wire
up credentials.
"""
import os
import time
import logging
import threading

import ingest_squid_logs
import update_blocklists

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("run_collectors")

AD_INTERVAL_SECONDS = 6 * 3600       # 4x/day
POSTURE_INTERVAL_SECONDS = 3600      # hourly
NETWORK_SCAN_INTERVAL_SECONDS = 1800  # every 30 min
BLOCKLIST_INTERVAL_SECONDS = 900     # every 15 min


def run_forever(name, interval_seconds, fn, required_env=None):
    missing = [v for v in (required_env or []) if not os.environ.get(v)]
    if missing:
        logger.info("Skipping %s job: missing env vars %s", name, missing)
        return
    while True:
        try:
            fn()
        except Exception:
            logger.exception("%s job failed", name)
        time.sleep(interval_seconds)


def main():
    threading.Thread(target=ingest_squid_logs.tail_loop, daemon=True, name="squid-tail").start()

    threading.Thread(
        target=run_forever,
        args=("update_blocklists", BLOCKLIST_INTERVAL_SECONDS, update_blocklists.run),
        daemon=True, name="update-blocklists",
    ).start()

    def ad_job():
        import ad_collector
        ad_collector.run()

    def posture_job():
        import posture_collector
        posture_collector.run()

    def network_job():
        import network_scanner
        network_scanner.run()

    threading.Thread(
        target=run_forever,
        args=("ad_collector", AD_INTERVAL_SECONDS, ad_job, ["AD_SERVER", "AD_BIND_DN", "AD_BIND_PASSWORD", "AD_BASE_DN"]),
        daemon=True, name="ad-collector",
    ).start()

    threading.Thread(
        target=run_forever,
        args=("posture_collector", POSTURE_INTERVAL_SECONDS, posture_job, ["WINRM_USERNAME", "WINRM_PASSWORD"]),
        daemon=True, name="posture-collector",
    ).start()

    threading.Thread(
        target=run_forever,
        args=("network_scanner", NETWORK_SCAN_INTERVAL_SECONDS, network_job, ["NETWORK_CIDR"]),
        daemon=True, name="network-scanner",
    ).start()

    logger.info("Collectors started")
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
