import os
import sys
import secrets
import tempfile

import psycopg2
import psycopg2.extras
from flask import Flask, render_template, request, redirect, url_for, Response, flash

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))
import risk_engine  # noqa: E402
import scanner_import  # noqa: E402

app = Flask(__name__)
app.secret_key = os.environ["DASHBOARD_SECRET_KEY"]

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

RISK_BAND_ORDER = ["critical", "high", "medium", "low"]


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def check_auth(username, password):
    return secrets.compare_digest(username, ADMIN_USERNAME) and secrets.compare_digest(password, ADMIN_PASSWORD)


@app.before_request
def require_auth():
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return Response(
            "Authentication required", 401,
            {"WWW-Authenticate": 'Basic realm="IT Risk Register"'},
        )


def latest_assessments(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (asset_id) *
            FROM risk_assessments
            ORDER BY asset_id, ts DESC
        """)
        return {row["asset_id"]: row for row in cur.fetchall()}


@app.route("/")
def index():
    conn = get_conn()
    assessments = latest_assessments(conn)

    band_counts = {b: 0 for b in RISK_BAND_ORDER}
    for a in assessments.values():
        band_counts[a["risk_band"]] = band_counts.get(a["risk_band"], 0) + 1

    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS c FROM recommendations WHERE status = 'open'")
        open_recs = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM assets")
        total_assets = cur.fetchone()["c"]

        cur.execute("""
            SELECT a.id, a.name, a.asset_type, a.category, ra.risk_score, ra.risk_band, ra.open_vuln_count
            FROM risk_assessments ra
            JOIN assets a ON a.id = ra.asset_id
            WHERE ra.id IN (
                SELECT DISTINCT ON (asset_id) id FROM risk_assessments ORDER BY asset_id, ts DESC
            )
            ORDER BY ra.risk_score DESC
            LIMIT 15
        """)
        top_risk = cur.fetchall()

    return render_template(
        "index.html",
        band_counts=band_counts,
        band_order=RISK_BAND_ORDER,
        open_recs=open_recs,
        total_assets=total_assets,
        top_risk=top_risk,
    )


@app.route("/assets")
def assets_list():
    conn = get_conn()
    assessments = latest_assessments(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM assets ORDER BY name")
        assets = cur.fetchall()
    for a in assets:
        a["assessment"] = assessments.get(a["id"])
    return render_template("assets_list.html", assets=assets)


@app.route("/assets/new", methods=["GET", "POST"])
def asset_new():
    if request.method == "POST":
        _save_asset(request.form)
        return redirect(url_for("assets_list"))
    return render_template("asset_form.html", asset=None)


@app.route("/assets/<int:asset_id>/edit", methods=["GET", "POST"])
def asset_edit(asset_id):
    conn = get_conn()
    if request.method == "POST":
        _save_asset(request.form, asset_id=asset_id)
        return redirect(url_for("asset_detail", asset_id=asset_id))
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM assets WHERE id = %s", (asset_id,))
        asset = cur.fetchone()
    return render_template("asset_form.html", asset=asset)


def _save_asset(form, asset_id=None):
    fields = dict(
        name=form.get("name", "").strip(),
        asset_type=form.get("asset_type"),
        category=form.get("category", "").strip(),
        owner=form.get("owner", "").strip() or None,
        department=form.get("department", "").strip() or None,
        criticality=int(form.get("criticality", 3)),
        internet_facing=form.get("internet_facing") == "on",
        location=form.get("location", "").strip() or None,
        ip_address=form.get("ip_address", "").strip() or None,
        serial_number=form.get("serial_number", "").strip() or None,
        vendor=form.get("vendor", "").strip() or None,
        product=form.get("product", "").strip() or None,
        version=form.get("version", "").strip() or None,
        install_date=form.get("install_date") or None,
        end_of_life_date=form.get("end_of_life_date") or None,
        notes=form.get("notes", "").strip() or None,
    )
    conn = get_conn()
    with conn.cursor() as cur:
        if asset_id:
            cur.execute(
                """
                UPDATE assets SET
                    name=%(name)s, asset_type=%(asset_type)s, category=%(category)s, owner=%(owner)s,
                    department=%(department)s, criticality=%(criticality)s, internet_facing=%(internet_facing)s,
                    location=%(location)s, ip_address=%(ip_address)s, serial_number=%(serial_number)s,
                    vendor=%(vendor)s, product=%(product)s, version=%(version)s, install_date=%(install_date)s,
                    end_of_life_date=%(end_of_life_date)s, notes=%(notes)s, updated_at=now()
                WHERE id=%(id)s
                """,
                {**fields, "id": asset_id},
            )
        else:
            cur.execute(
                """
                INSERT INTO assets
                    (name, asset_type, category, owner, department, criticality, internet_facing,
                     location, ip_address, serial_number, vendor, product, version, install_date,
                     end_of_life_date, notes)
                VALUES
                    (%(name)s, %(asset_type)s, %(category)s, %(owner)s, %(department)s, %(criticality)s,
                     %(internet_facing)s, %(location)s, %(ip_address)s, %(serial_number)s, %(vendor)s,
                     %(product)s, %(version)s, %(install_date)s, %(end_of_life_date)s, %(notes)s)
                RETURNING id
                """,
                fields,
            )
            asset_id = cur.fetchone()["id"]
    conn.commit()

    # Score immediately so a newly added asset isn't invisible on the dashboard.
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM assets WHERE id = %s", (asset_id,))
        asset = cur.fetchone()
    risk_engine.score_asset(conn, asset)
    return asset_id


@app.route("/assets/<int:asset_id>")
def asset_detail(asset_id):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM assets WHERE id = %s", (asset_id,))
        asset = cur.fetchone()

        cur.execute("""
            SELECT * FROM risk_assessments WHERE asset_id = %s ORDER BY ts DESC LIMIT 10
        """, (asset_id,))
        history = cur.fetchall()

        cur.execute("""
            SELECT v.cve_id, v.title, v.description, v.cvss_score, v.cvss_severity, v.source, av.status
            FROM asset_vulnerabilities av
            JOIN vulnerabilities v ON v.id = av.vulnerability_id
            WHERE av.asset_id = %s
            ORDER BY v.cvss_score DESC NULLS LAST
        """, (asset_id,))
        vulns = cur.fetchall()

        cur.execute("""
            SELECT * FROM recommendations WHERE asset_id = %s ORDER BY
                CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                ts DESC
        """, (asset_id,))
        recs = cur.fetchall()

    return render_template("asset_detail.html", asset=asset, history=history, vulns=vulns, recs=recs)


@app.route("/vulnerabilities")
def vulnerabilities_list():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT v.*, count(av.asset_id) AS affected_assets
            FROM vulnerabilities v
            LEFT JOIN asset_vulnerabilities av ON av.vulnerability_id = v.id AND av.status = 'open'
            GROUP BY v.id
            ORDER BY v.cvss_score DESC NULLS LAST
            LIMIT 200
        """)
        vulns = cur.fetchall()
    return render_template("vulnerabilities.html", vulns=vulns)


@app.route("/recommendations", methods=["GET", "POST"])
def recommendations_list():
    conn = get_conn()
    if request.method == "POST":
        rec_id = request.form.get("rec_id")
        new_status = request.form.get("status")
        with conn.cursor() as cur:
            cur.execute("UPDATE recommendations SET status = %s WHERE id = %s", (new_status, rec_id))
        conn.commit()
        return redirect(url_for("recommendations_list"))

    status_filter = request.args.get("status", "open")
    with conn.cursor() as cur:
        if status_filter == "all":
            cur.execute("""
                SELECT r.*, a.name AS asset_name FROM recommendations r
                JOIN assets a ON a.id = r.asset_id
                ORDER BY CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, r.ts DESC
            """)
        else:
            cur.execute("""
                SELECT r.*, a.name AS asset_name FROM recommendations r
                JOIN assets a ON a.id = r.asset_id
                WHERE r.status = %s
                ORDER BY CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, r.ts DESC
            """, (status_filter,))
        recs = cur.fetchall()
    return render_template("recommendations.html", recs=recs, status_filter=status_filter)


@app.route("/import", methods=["GET", "POST"])
def import_scan():
    if request.method == "POST":
        file = request.files.get("file")
        source = request.form.get("source", "").strip() or "manual-import"
        if not file or not file.filename:
            flash("Choose a CSV file to upload.")
            return redirect(url_for("import_scan"))

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        try:
            scanner_import.run(tmp_path, source)
            risk_engine.run()
            flash(f"Import complete from source '{source}'. Risk scores recomputed.")
        except Exception as e:
            flash(f"Import failed: {e}")
        finally:
            os.unlink(tmp_path)

        return redirect(url_for("import_scan"))

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM scanner_imports ORDER BY ts DESC LIMIT 20")
        imports = cur.fetchall()
    return render_template("import.html", imports=imports)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)
