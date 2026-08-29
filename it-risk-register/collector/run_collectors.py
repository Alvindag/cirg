"""
Entrypoint for the collector container: runs risk scoring on a schedule
and NVD vulnerability sync on a slower schedule (NVD's rate limits make
frequent polling impractical, and CVE data doesn't change that fast).
Run risk_engine again after any manual scanner_import.py run to refresh
scores with the new findings.
"""
import os
import time
import logging
import threading

import risk_engine
import nvd_sync

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("run_collectors")

RISK_RECOMPUTE_INTERVAL_SECONDS = int(os.environ.get("RISK_RECOMPUTE_INTERVAL_SECONDS", 3600))
NVD_SYNC_INTERVAL_SECONDS = int(os.environ.get("NVD_SYNC_INTERVAL_SECONDS", 86400))


def run_forever(name, interval_seconds, fn):
    while True:
        try:
            fn()
        except Exception:
            logger.exception("%s job failed", name)
        time.sleep(interval_seconds)


def nvd_then_score():
    nvd_sync.run()
    risk_engine.run()


def main():
    # Score immediately on startup so a fresh deployment isn't empty for an hour.
    try:
        risk_engine.run()
    except Exception:
        logger.exception("Initial risk scoring failed")

    threading.Thread(
        target=run_forever,
        args=("risk_engine", RISK_RECOMPUTE_INTERVAL_SECONDS, risk_engine.run),
        daemon=True, name="risk-engine",
    ).start()

    threading.Thread(
        target=run_forever,
        args=("nvd_sync", NVD_SYNC_INTERVAL_SECONDS, nvd_then_score),
        daemon=True, name="nvd-sync",
    ).start()

    logger.info("Collectors started")
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
