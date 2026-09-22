"""Dashboard KPI stats and report generation (incident PDFs, executive/
compliance summaries)."""

import os
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request, send_file

from backend.auth import require_user
from backend.db import get_cursor
from backend.pdf_builder import build_executive_summary, build_incident_report

reporting_bp = Blueprint("reporting", __name__, url_prefix="/api/soc")


@reporting_bp.route("/dashboard", methods=["GET"])
@require_user()
def dashboard_stats():
    with get_cursor() as cur:
        cur.execute("SELECT count(*) AS c FROM assets")
        total_assets = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM assets WHERE status = 'online'")
        online_assets = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM assets WHERE status = 'isolated'")
        isolated_assets = cur.fetchone()["c"]

        cur.execute("SELECT count(*) AS c FROM alerts WHERE status NOT IN ('resolved', 'false_positive')")
        open_alerts = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM alerts WHERE severity IN ('critical', 'high') AND status NOT IN ('resolved', 'false_positive')")
        critical_high_alerts = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM alerts WHERE triggered_at >= now() - interval '24 hours'")
        alerts_24h = cur.fetchone()["c"]

        cur.execute("SELECT count(*) AS c FROM incidents WHERE status != 'closed'")
        open_incidents = cur.fetchone()["c"]

        cur.execute("SELECT count(*) AS c FROM remediation_actions WHERE status = 'pending'")
        pending_remediation = cur.fetchone()["c"]

        cur.execute("""
            SELECT unnest(mitre_attack_techniques) AS technique, count(*) AS c
            FROM alerts WHERE triggered_at >= now() - interval '30 days'
            GROUP BY technique ORDER BY c DESC LIMIT 10
        """)
        top_techniques = cur.fetchall()

        cur.execute("""
            SELECT severity, count(*) AS c FROM alerts
            WHERE triggered_at >= now() - interval '7 days' GROUP BY severity
        """)
        alerts_by_severity_7d = cur.fetchall()

        cur.execute("SELECT * FROM alerts WHERE status = 'new' ORDER BY triggered_at DESC LIMIT 10")
        recent_alerts = cur.fetchall()

    return jsonify({
        "assets": {"total": total_assets, "online": online_assets, "isolated": isolated_assets},
        "alerts": {
            "open": open_alerts,
            "critical_high": critical_high_alerts,
            "last_24h": alerts_24h,
            "by_severity_7d": alerts_by_severity_7d,
        },
        "incidents": {"open": open_incidents},
        "remediation": {"pending": pending_remediation},
        "top_mitre_techniques_30d": top_techniques,
        "recent_alerts": recent_alerts,
    })


@reporting_bp.route("/reports", methods=["GET"])
@require_user()
def list_reports():
    with get_cursor() as cur:
        cur.execute("SELECT * FROM soc_reports ORDER BY generated_at DESC LIMIT 200")
        reports = cur.fetchall()
    return jsonify(reports)


@reporting_bp.route("/reports/incident/<int:incident_id>", methods=["POST"])
@require_user()
def generate_incident_report(incident_id):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
        incident = cur.fetchone()
        if not incident:
            return jsonify({"error": "incident not found"}), 404

        cur.execute("SELECT * FROM incident_timeline WHERE incident_id = %s ORDER BY occurred_at", (incident_id,))
        timeline = cur.fetchall()

        alerts = []
        if incident["related_alert_ids"]:
            cur.execute("SELECT * FROM alerts WHERE id = ANY(%s)", (incident["related_alert_ids"],))
            alerts = cur.fetchall()

        assets = []
        if incident["affected_asset_ids"]:
            cur.execute("SELECT * FROM assets WHERE id = ANY(%s)", (incident["affected_asset_ids"],))
            assets = cur.fetchall()

        cur.execute("SELECT * FROM remediation_actions WHERE incident_id = %s ORDER BY requested_at", (incident_id,))
        remediation_actions = cur.fetchall()

    file_path = build_incident_report(incident, timeline, alerts, remediation_actions, assets)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO soc_reports (report_type, framework, incident_id, generated_by, file_path)
            VALUES ('incident', 'NIST_800_61', %s, %s, %s) RETURNING *
            """,
            (incident_id, g.user["sub"], file_path),
        )
        report = cur.fetchone()

    return jsonify(report), 201


@reporting_bp.route("/reports/executive-summary", methods=["POST"])
@require_user()
def generate_executive_summary():
    data = request.get_json(silent=True) or {}
    days = int(data.get("days", 30))
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=days)

    with get_cursor() as cur:
        cur.execute("SELECT count(*) AS c FROM assets")
        total_assets = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM assets WHERE status = 'online'")
        online_assets = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM alerts WHERE triggered_at >= %s", (period_start,))
        total_alerts = cur.fetchone()["c"]
        cur.execute(
            "SELECT count(*) AS c FROM alerts WHERE triggered_at >= %s AND severity IN ('critical', 'high')",
            (period_start,),
        )
        critical_high_alerts = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM incidents WHERE created_at >= %s", (period_start,))
        incidents_opened = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM incidents WHERE closed_at >= %s", (period_start,))
        incidents_closed = cur.fetchone()["c"]
        cur.execute("SELECT count(*) AS c FROM remediation_actions WHERE requested_at >= %s", (period_start,))
        remediation_actions = cur.fetchone()["c"]
        cur.execute(
            """
            SELECT AVG(EXTRACT(EPOCH FROM (contained_at - created_at))) AS avg_seconds
            FROM incidents WHERE contained_at IS NOT NULL AND created_at >= %s
            """,
            (period_start,),
        )
        avg_seconds = cur.fetchone()["avg_seconds"]
        mttc = f"{avg_seconds / 3600:.1f} hours" if avg_seconds else "-"

        cur.execute(
            """
            SELECT unnest(mitre_attack_techniques) AS technique, count(*) AS c
            FROM alerts WHERE triggered_at >= %s GROUP BY technique ORDER BY c DESC LIMIT 10
            """,
            (period_start,),
        )
        top_techniques = cur.fetchall()

    stats = {
        "total_assets": total_assets,
        "online_assets": online_assets,
        "total_alerts": total_alerts,
        "critical_high_alerts": critical_high_alerts,
        "incidents_opened": incidents_opened,
        "incidents_closed": incidents_closed,
        "remediation_actions": remediation_actions,
        "mttc": mttc,
        "top_techniques": top_techniques,
    }

    file_path = build_executive_summary(stats, period_start.date(), period_end.date())

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO soc_reports (report_type, framework, period_start, period_end, generated_by, file_path)
            VALUES ('executive_summary', 'NIST_CSF', %s, %s, %s, %s) RETURNING *
            """,
            (period_start, period_end, g.user["sub"], file_path),
        )
        report = cur.fetchone()

    return jsonify(report), 201


@reporting_bp.route("/reports/<int:report_id>/download", methods=["GET"])
@require_user()
def download_report(report_id):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM soc_reports WHERE id = %s", (report_id,))
        report = cur.fetchone()
    if not report or not os.path.isfile(report["file_path"]):
        return jsonify({"error": "report not found"}), 404
    return send_file(report["file_path"], as_attachment=True, download_name=os.path.basename(report["file_path"]))
