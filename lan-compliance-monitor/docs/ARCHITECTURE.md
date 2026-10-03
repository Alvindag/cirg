# Architecture

```
Windows clients (browser/OS proxy → Squid)
        │
        ▼
   Squid (:3128)  ──logs──▶  collector container
        │                        │
        │ (category blocklists)  ├─ ingest_squid_logs.py  → usage_events, compliance_violations
        │◀────update_blocklists──┤
                                  ├─ posture_collector.py  → endpoint_posture      (WinRM)
                                  ├─ ad_collector.py        → ad_security_snapshot  (LDAP)
                                  └─ network_scanner.py     → network_devices       (nmap sweep)
                                             │
                                             ▼
                                        Postgres
                                             │
                                             ▼
                                  dashboard (Flask, :8080, basic auth)
```

## Why this shape

- **Squid as the capture point**, not a network tap/SPAN port: it requires no
  managed-switch configuration, gives domain + user + bytes per request out of
  the box, and doubles as the enforcement point (category blocking) so
  "monitor compliance" and "enforce policy" are the same component.
- **DNS-only capture was considered** (Pi-hole/Unbound) but a forward proxy
  gives per-user attribution via client IP *and* enforcement, where DNS-only
  gives visibility without a blocking lever (a client can still connect to a
  resolved IP directly).
- **User attribution today is IP-based.** `users.username` starts out as
  `unmapped:<ip>` until something authoritative maps it — either the AD
  collector matching computer objects to logged-on users (not implemented;
  requires event-log or NAC integration) or you populate `users` manually /
  via a DHCP lease import. This is the main gap to close for real per-user
  (not per-machine) compliance reporting in an environment with shared
  machines or hot-desking.
- **Posture and AD collectors are optional and degrade gracefully.** If their
  env vars aren't set, `run_collectors.py` skips them and logs why — you can
  stand up usage monitoring first and layer on endpoint/AD visibility later.
- **GPO/WinRM for posture, not a persistent agent.** Keeps client-side
  footprint to "WinRM enabled + a security group membership," rather than
  shipping and maintaining an agent binary.

## Known limitations / next steps

- HTTPS visibility is limited to SNI/CONNECT domain (Squid doesn't MITM by
  default) — sufficient for domain-level compliance reporting, not URL-path
  detail on HTTPS sites. Full TLS inspection requires deploying Squid's
  SSL-bump with an internal CA pushed to clients via GPO; deliberately left
  out of this MVP given the trust and legal-notice implications.
- GPO enumeration (`ad_security_snapshot.gpo_count`) is stubbed — wiring it
  up needs either `Get-GPO`/RSAT on a Windows box the collector can reach, or
  parsing SYSVOL, neither of which is practical from a Linux container
  without extra tooling.
- `network_scanner.py` does an unauthenticated ping sweep; it will miss hosts
  that don't respond to ICMP/ARP probes depending on host firewall config.
- No alerting/notification channel yet (email/Slack/Teams webhook) — the
  dashboard is pull-based. `compliance_violations` and the "at-risk
  endpoints" query in `app.py` are the natural hook points for one.
- Single basic-auth admin account. For multi-user access with roles, put
  this behind an existing IdP (e.g. reverse-proxy with OAuth2-Proxy against
  AD/Entra ID) rather than extending Flask's auth in-repo.
