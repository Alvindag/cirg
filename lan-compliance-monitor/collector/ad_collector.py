"""
Polls Active Directory for a security posture snapshot: password policy,
stale/disabled accounts, Domain Admins membership, and GPO count.

Requires a low-privilege bind account (read-only) with permission to read
domain policy and user objects. Run periodically (see run_collectors.py).
"""
import os
import json
import logging
from datetime import datetime, timezone, timedelta

from ldap3 import Server, Connection, ALL, SUBTREE

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ad_collector")

STALE_DAYS = 90
FILETIME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)


def filetime_to_datetime(filetime):
    if not filetime or int(filetime) == 0:
        return None
    return FILETIME_EPOCH + timedelta(microseconds=int(filetime) / 10)


def connect():
    server = Server(os.environ["AD_SERVER"], get_info=ALL)
    conn = Connection(
        server,
        user=os.environ["AD_BIND_DN"],
        password=os.environ["AD_BIND_PASSWORD"],
        auto_bind=True,
    )
    return conn


def get_password_policy(conn, base_dn):
    conn.search(base_dn, "(objectClass=domainDNS)",
                attributes=["minPwdLength", "pwdProperties", "maxPwdAge", "lockoutThreshold"])
    if not conn.entries:
        return {}
    entry = conn.entries[0]
    max_pwd_age_days = None
    try:
        # maxPwdAge is a negative 100-ns interval
        max_pwd_age_days = abs(int(entry.maxPwdAge.value)) // (10_000_000 * 86400)
    except (TypeError, ValueError, AttributeError):
        pass
    return {
        "min_password_length": int(entry.minPwdLength.value) if entry.minPwdLength else None,
        "password_complexity": bool(int(entry.pwdProperties.value) & 1) if entry.pwdProperties else None,
        "max_password_age_days": max_pwd_age_days,
        "lockout_threshold": int(entry.lockoutThreshold.value) if entry.lockoutThreshold else None,
    }


def get_account_stats(conn, base_dn):
    conn.search(
        base_dn,
        "(objectClass=user)",
        SUBTREE,
        attributes=["sAMAccountName", "userAccountControl", "lastLogonTimestamp"],
    )
    stale, disabled = [], 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
    for entry in conn.entries:
        try:
            uac = int(entry.userAccountControl.value)
        except (TypeError, ValueError, AttributeError):
            continue
        is_disabled = bool(uac & 2)
        if is_disabled:
            disabled += 1
            continue
        last_logon = filetime_to_datetime(entry.lastLogonTimestamp.value if entry.lastLogonTimestamp else None)
        if last_logon and last_logon < cutoff:
            stale.append({
                "username": str(entry.sAMAccountName),
                "last_logon": last_logon.isoformat(),
                "enabled": True,
            })
    return stale, disabled


def get_domain_admin_count(conn, base_dn):
    conn.search(base_dn, "(cn=Domain Admins)", SUBTREE, attributes=["member"])
    if not conn.entries:
        return 0
    return len(conn.entries[0].member.values) if conn.entries[0].member else 0


def run():
    base_dn = os.environ["AD_BASE_DN"]
    conn = connect()

    policy = get_password_policy(conn, base_dn)
    stale_accounts, disabled_count = get_account_stats(conn, base_dn)
    domain_admin_count = get_domain_admin_count(conn, base_dn)

    db = get_conn()
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ad_security_snapshot
                (ts, min_password_length, password_complexity, max_password_age_days,
                 lockout_threshold, stale_account_count, disabled_account_count,
                 domain_admin_count, gpo_count, raw_json)
            VALUES (now(), %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                policy.get("min_password_length"),
                policy.get("password_complexity"),
                policy.get("max_password_age_days"),
                policy.get("lockout_threshold"),
                len(stale_accounts),
                disabled_count,
                domain_admin_count,
                None,  # GPO enumeration requires SYSVOL/AD LDAP GPO container parsing; wire up as needed
                json.dumps(policy),
            ),
        )
        snapshot_id = cur.fetchone()[0]

        if stale_accounts:
            cur.executemany(
                """
                INSERT INTO ad_stale_accounts (snapshot_id, username, last_logon, enabled)
                VALUES (%s, %s, %s, %s)
                """,
                [(snapshot_id, a["username"], a["last_logon"], a["enabled"]) for a in stale_accounts],
            )
    db.commit()
    logger.info(
        "AD snapshot %s: %d stale accounts, %d disabled, %d domain admins",
        snapshot_id, len(stale_accounts), disabled_count, domain_admin_count,
    )


if __name__ == "__main__":
    run()
