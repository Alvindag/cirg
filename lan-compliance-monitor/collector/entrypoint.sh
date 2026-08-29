#!/bin/sh
set -e

# Seed the shared blocklists volume on first run so Squid's dstdomain ACLs
# have something to read before update_blocklists.py has run.
if [ -z "$(ls -A /etc/squid/blocklists 2>/dev/null)" ]; then
    cp /app/blocklists-seed/*.txt /etc/squid/blocklists/
fi

exec python run_collectors.py
