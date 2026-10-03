# LAN Compliance Monitor

Self-hosted dashboard for a Windows LAN: monitors user internet usage
against an acceptable-use policy, and reports the security posture your
organization already has in place (endpoint AV/firewall/BitLocker/patch
state, AD password policy and stale accounts, and unrecognized devices on
the network).

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit
together and what's deliberately out of scope for this first pass.

> **Before deploying:** monitoring employee internet activity has legal
> and HR implications in most jurisdictions (works council/union
> consultation, an acceptable-use policy notice, data retention limits).
> Confirm with legal/HR before turning this on, and configure retention
> (see "Data retention" below) accordingly.

## What it does

- **Usage compliance** — every request through the Squid proxy is logged
  with client IP, domain, and category; blocked-category and off-hours
  access become `compliance_violations` rows shown on the dashboard.
- **Category enforcement** — gambling/adult/malware/file-sharing/proxy-vpn
  domains are blocked at the proxy, not just logged (edit
  `squid/blocklists/*.txt` or the `domain_categories` table).
- **Endpoint posture** — polls each Windows machine over WinRM for
  Defender status, firewall profiles, BitLocker, and pending updates.
- **AD security posture** — snapshots password policy, stale/disabled
  accounts, and Domain Admins membership via LDAP.
- **Network inventory** — periodic LAN sweep flags MAC addresses seen for
  the first time as potentially rogue devices.

## Quick start

```bash
cp .env.example .env
# edit .env: set DB_PASSWORD, DASHBOARD_SECRET_KEY, ADMIN_PASSWORD at minimum

docker compose up -d --build
```

Dashboard: `http://<host>:8080` (basic auth — `ADMIN_USERNAME`/`ADMIN_PASSWORD`
from `.env`).

This brings up usage-compliance monitoring immediately (once clients are
pointed at the proxy — see below). Posture/AD/network modules turn on
automatically once their env vars are set; until then they're skipped with
a log line, not an error.

### Point clients at the proxy

Push Squid (`<host>:3128`) as the proxy via GPO (Computer Configuration →
Policies → Administrative Templates → relevant browser ADMX, or Internet
Settings for system-wide) so requests get logged. `scripts/setup-windows-clients.ps1`
does this (and enables WinRM) for a single machine — deploy it as a GPO
startup script for fleet rollout, don't run it by hand per machine.

### Enable endpoint posture polling

1. Run `scripts/setup-windows-clients.ps1` (via GPO) on target machines —
   enables WinRM and grants your polling account remote-management rights.
2. Create a low-privilege domain account for polling, add it to the group
   you passed as `-PostureAccountGroup`.
3. Set `WINRM_USERNAME`/`WINRM_PASSWORD` in `.env`.
4. List target hostnames in `collector/hosts.txt`.

### Enable AD security posture

1. Create a read-only bind account (member of a group with read access to
   domain policy and user objects — no elevated rights needed).
2. Set `AD_SERVER`, `AD_BIND_DN`, `AD_BIND_PASSWORD`, `AD_BASE_DN` in `.env`.

### Network device inventory

Runs automatically against `NETWORK_CIDR` (set in `.env`) — no extra setup,
though the collector container needs a network position that can actually
reach the LAN segment (host networking or a routed Docker network, not an
isolated bridge, if the LAN is on a separate physical segment from wherever
Docker runs).

## Data retention

`usage_events` grows fast on a busy LAN. Nothing prunes it automatically —
add a cron/`pg_cron` job or a scheduled `DELETE FROM usage_events WHERE ts <
now() - interval 'N days'` sized to your retention policy before running
this in production long-term.

## Repo layout

```
docker-compose.yml       # postgres, squid, collector, dashboard
squid/                   # squid.conf + category blocklists
collector/                # log ingestion, WinRM/LDAP/nmap collectors, scheduler
dashboard/                # Flask app + templates
database/schema.sql       # Postgres schema, seeded with default categories
scripts/setup-windows-clients.ps1
docs/ARCHITECTURE.md
```
