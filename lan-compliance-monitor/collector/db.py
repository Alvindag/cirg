import os
import psycopg2
from psycopg2.extras import execute_values


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def get_or_create_user(conn, username=None, ip_address=None, hostname=None):
    """Resolve a user row by username (preferred) or by IP as a fallback
    for machines the AD collector hasn't matched yet."""
    with conn.cursor() as cur:
        if username:
            cur.execute(
                """
                INSERT INTO users (username, ip_address, hostname, last_seen)
                VALUES (%s, %s, %s, now())
                ON CONFLICT (username) DO UPDATE
                    SET ip_address = EXCLUDED.ip_address,
                        hostname = COALESCE(EXCLUDED.hostname, users.hostname),
                        last_seen = now()
                RETURNING id
                """,
                (username, ip_address, hostname),
            )
        else:
            # No identity available yet (e.g. Squid saw the request before
            # the AD/DHCP mapping caught up) — key on IP as a placeholder.
            placeholder = f"unmapped:{ip_address}"
            cur.execute(
                """
                INSERT INTO users (username, ip_address, last_seen)
                VALUES (%s, %s, now())
                ON CONFLICT (username) DO UPDATE
                    SET last_seen = now()
                RETURNING id
                """,
                (placeholder, ip_address),
            )
        row = cur.fetchone()
        conn.commit()
        return row[0]


def get_category_for_domain(conn, domain):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.name, c.is_blocked
            FROM domain_categories dc
            JOIN categories c ON c.id = dc.category_id
            WHERE %s LIKE '%%' || dc.domain
            ORDER BY length(dc.domain) DESC
            LIMIT 1
            """,
            (domain,),
        )
        row = cur.fetchone()
        if row:
            return {"id": row[0], "name": row[1], "is_blocked": row[2]}
        return None


def bulk_insert_events(conn, rows):
    """rows: list of tuples matching usage_events insert columns."""
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO usage_events
                (ts, client_ip, user_id, method, url, domain, status_code, bytes, action, category_id)
            VALUES %s
            """,
            rows,
        )
    conn.commit()
