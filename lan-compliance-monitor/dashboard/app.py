import os
import secrets
import psycopg2
import psycopg2.extras
from flask import Flask, render_template, request, Response

app = Flask(__name__)
app.secret_key = os.environ["DASHBOARD_SECRET_KEY"]

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


def get_conn():
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    return conn


def check_auth(username, password):
    return secrets.compare_digest(username, ADMIN_USERNAME) and secrets.compare_digest(password, ADMIN_PASSWORD)


@app.before_request
def require_auth():
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return Response(
            "Authentication required", 401,
            {"WWW-Authenticate": 'Basic realm="LAN Compliance Monitor"'},
        )


@app.route("/")
def index():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS c FROM usage_events WHERE ts > now() - interval '24 hours'")
        events_24h = cur.fetchone()["c"]

        cur.execute("""
            SELECT count(*) AS c FROM compliance_violations
            WHERE ts > now() - interval '24 hours'
        """)
        violations_24h = cur.fetchone()["c"]

        cur.execute("""
            SELECT count(*) AS c FROM endpoint_posture
            WHERE ts > now() - interval '2 hours' AND (
                defender_enabled = FALSE OR realtime_protection = FALSE OR
                firewall_domain_on = FALSE OR bitlocker_on = FALSE OR reachable = FALSE
            )
        """)
        at_risk_endpoints = cur.fetchone()["c"]

        cur.execute("SELECT count(*) AS c FROM network_devices WHERE is_flagged = TRUE AND is_known = FALSE")
        rogue_devices = cur.fetchone()["c"]

        cur.execute("""
            SELECT u.username, u.department, v.rule, v.detail, v.severity, v.ts
            FROM compliance_violations v
            JOIN users u ON u.id = v.user_id
            ORDER BY v.ts DESC
            LIMIT 25
        """)
        recent_violations = cur.fetchall()

    return render_template(
        "index.html",
        events_24h=events_24h,
        violations_24h=violations_24h,
        at_risk_endpoints=at_risk_endpoints,
        rogue_devices=rogue_devices,
        recent_violations=recent_violations,
    )


@app.route("/usage")
def usage():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT u.username, u.department, count(*) AS request_count,
                   sum(e.bytes) AS total_bytes
            FROM usage_events e
            JOIN users u ON u.id = e.user_id
            WHERE e.ts > now() - interval '7 days'
            GROUP BY u.username, u.department
            ORDER BY request_count DESC
            LIMIT 50
        """)
        by_user = cur.fetchall()

        cur.execute("""
            SELECT domain, count(*) AS request_count
            FROM usage_events
            WHERE ts > now() - interval '7 days'
            GROUP BY domain
            ORDER BY request_count DESC
            LIMIT 20
        """)
        top_domains = cur.fetchall()

        cur.execute("""
            SELECT c.name AS category, count(*) AS request_count
            FROM usage_events e
            JOIN categories c ON c.id = e.category_id
            WHERE e.ts > now() - interval '7 days'
            GROUP BY c.name
            ORDER BY request_count DESC
        """)
        by_category = cur.fetchall()

    return render_template("usage.html", by_user=by_user, top_domains=top_domains, by_category=by_category)


@app.route("/posture")
def posture():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (hostname) *
            FROM endpoint_posture
            ORDER BY hostname, ts DESC
        """)
        endpoints = cur.fetchall()
    return render_template("posture.html", endpoints=endpoints)


@app.route("/ad-security")
def ad_security():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM ad_security_snapshot ORDER BY ts DESC LIMIT 1")
        latest = cur.fetchone()
        stale_accounts = []
        if latest:
            cur.execute(
                "SELECT username, last_logon FROM ad_stale_accounts WHERE snapshot_id = %s ORDER BY last_logon",
                (latest["id"],),
            )
            stale_accounts = cur.fetchall()
    return render_template("ad_security.html", snapshot=latest, stale_accounts=stale_accounts)


@app.route("/network")
def network():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM network_devices ORDER BY is_flagged DESC, last_seen DESC LIMIT 200")
        devices = cur.fetchall()
    return render_template("network.html", devices=devices)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
