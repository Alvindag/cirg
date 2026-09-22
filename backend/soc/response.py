"""Alert triage and incident case management (NIST SP 800-61 Rev.2 lifecycle:
Preparation -> Detection & Analysis -> Containment/Eradication/Recovery ->
Post-Incident Activity)."""

from flask import Blueprint, g, jsonify, request

from backend.auth import require_user
from backend.db import get_cursor

response_bp = Blueprint("response", __name__, url_prefix="/api/soc")


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------
@response_bp.route("/alerts", methods=["GET"])
@require_user()
def list_alerts():
    status = request.args.get("status")
    severity = request.args.get("severity")
    asset_id = request.args.get("asset_id")

    query = "SELECT * FROM alerts WHERE 1=1"
    params = []
    if status:
        query += " AND status = %s"
        params.append(status)
    if severity:
        query += " AND severity = %s"
        params.append(severity)
    if asset_id:
        query += " AND asset_id = %s"
        params.append(asset_id)
    query += " ORDER BY triggered_at DESC LIMIT 500"

    with get_cursor() as cur:
        cur.execute(query, params)
        alerts = cur.fetchall()
    return jsonify(alerts)


@response_bp.route("/alerts/<int:alert_id>", methods=["GET"])
@require_user()
def get_alert(alert_id):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM alerts WHERE id = %s", (alert_id,))
        alert = cur.fetchone()
        if not alert:
            return jsonify({"error": "not found"}), 404
        if alert["matched_event_ids"]:
            cur.execute("SELECT * FROM events WHERE id = ANY(%s) ORDER BY event_time", (alert["matched_event_ids"],))
            alert["matched_events"] = cur.fetchall()
        else:
            alert["matched_events"] = []
    return jsonify(alert)


@response_bp.route("/alerts/<int:alert_id>", methods=["PATCH"])
@require_user()
def update_alert(alert_id):
    data = request.get_json(silent=True) or {}
    fields, values = [], []
    if "status" in data:
        fields.append("status = %s")
        values.append(data["status"])
        if data["status"] in ("resolved", "false_positive"):
            fields.append("resolved_at = now()")
    if "assignee" in data:
        fields.append("assignee = %s")
        values.append(data["assignee"])
    if "incident_id" in data:
        fields.append("incident_id = %s")
        values.append(data["incident_id"])
    if not fields:
        return jsonify({"error": "no updatable fields provided"}), 400
    fields.append("updated_at = now()")
    values.append(alert_id)

    with get_cursor() as cur:
        cur.execute(f"UPDATE alerts SET {', '.join(fields)} WHERE id = %s RETURNING *", values)
        updated = cur.fetchone()
        if updated:
            cur.execute(
                "INSERT INTO soc_audit_log (actor, action, target_type, target_id, details) VALUES (%s, %s, %s, %s, %s)",
                (g.user["username"], "alert_updated", "alert", str(alert_id), __import__("json").dumps(data)),
            )
    if not updated:
        return jsonify({"error": "not found"}), 404
    return jsonify(updated)


@response_bp.route("/alerts/<int:alert_id>/escalate", methods=["POST"])
@require_user()
def escalate_alert(alert_id):
    """Promote an alert into a new (or existing) incident case."""
    data = request.get_json(silent=True) or {}
    with get_cursor() as cur:
        cur.execute("SELECT * FROM alerts WHERE id = %s", (alert_id,))
        alert = cur.fetchone()
        if not alert:
            return jsonify({"error": "alert not found"}), 404

        incident_id = data.get("incident_id")
        if incident_id:
            cur.execute(
                """
                UPDATE incidents SET related_alert_ids = array_append(related_alert_ids, %s),
                       affected_asset_ids = array_append(
                           CASE WHEN %s = ANY(affected_asset_ids) THEN affected_asset_ids
                                ELSE affected_asset_ids END, NULL)
                WHERE id = %s RETURNING *
                """,
                (alert_id, alert["asset_id"], incident_id),
            )
            incident = cur.fetchone()
            if not incident:
                return jsonify({"error": "incident not found"}), 404
        else:
            cur.execute(
                """
                INSERT INTO incidents (title, category, severity, summary, lead_analyst,
                                        related_alert_ids, affected_asset_ids, mitre_attack_techniques)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    data.get("title", alert["title"]),
                    data.get("category", "uncategorized"),
                    alert["severity"],
                    data.get("summary", alert["description"]),
                    g.user["sub"],
                    [alert_id],
                    [alert["asset_id"]] if alert["asset_id"] else [],
                    alert["mitre_attack_techniques"],
                ),
            )
            incident = cur.fetchone()

        cur.execute(
            "UPDATE alerts SET status = 'investigating', incident_id = %s WHERE id = %s",
            (incident["id"], alert_id),
        )
        cur.execute(
            "INSERT INTO incident_timeline (incident_id, actor, action, notes) VALUES (%s, %s, %s, %s)",
            (incident["id"], g.user["username"], "alert_escalated", f"Alert #{alert_id} escalated: {alert['title']}"),
        )
    return jsonify(incident), 201


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------
@response_bp.route("/incidents", methods=["GET"])
@require_user()
def list_incidents():
    status = request.args.get("status")
    query = "SELECT * FROM incidents"
    params = []
    if status:
        query += " WHERE status = %s"
        params.append(status)
    query += " ORDER BY created_at DESC"
    with get_cursor() as cur:
        cur.execute(query, params)
        incidents = cur.fetchall()
    return jsonify(incidents)


@response_bp.route("/incidents", methods=["POST"])
@require_user()
def create_incident():
    data = request.get_json(silent=True) or {}
    if not data.get("title"):
        return jsonify({"error": "title is required"}), 400
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO incidents (title, category, severity, summary, lead_analyst, affected_asset_ids)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
            """,
            (
                data["title"],
                data.get("category", "uncategorized"),
                data.get("severity", "medium"),
                data.get("summary"),
                g.user["sub"],
                data.get("affected_asset_ids", []),
            ),
        )
        incident = cur.fetchone()
        cur.execute(
            "INSERT INTO incident_timeline (incident_id, actor, action, notes) VALUES (%s, %s, %s, %s)",
            (incident["id"], g.user["username"], "incident_created", incident["title"]),
        )
    return jsonify(incident), 201


@response_bp.route("/incidents/<int:incident_id>", methods=["GET"])
@require_user()
def get_incident(incident_id):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
        incident = cur.fetchone()
        if not incident:
            return jsonify({"error": "not found"}), 404
        cur.execute(
            "SELECT * FROM incident_timeline WHERE incident_id = %s ORDER BY occurred_at",
            (incident_id,),
        )
        incident["timeline"] = cur.fetchall()
        if incident["related_alert_ids"]:
            cur.execute("SELECT * FROM alerts WHERE id = ANY(%s)", (incident["related_alert_ids"],))
            incident["alerts"] = cur.fetchall()
        else:
            incident["alerts"] = []
        cur.execute("SELECT * FROM remediation_actions WHERE incident_id = %s ORDER BY requested_at", (incident_id,))
        incident["remediation_actions"] = cur.fetchall()
    return jsonify(incident)


# NIST SP 800-61 status transitions: open -> contained -> eradicated -> recovering -> closed
_VALID_TRANSITIONS = {
    "open": {"contained", "closed"},
    "contained": {"eradicated", "open", "closed"},
    "eradicated": {"recovering", "closed"},
    "recovering": {"closed", "eradicated"},
    "closed": set(),
}


@response_bp.route("/incidents/<int:incident_id>", methods=["PATCH"])
@require_user()
def update_incident(incident_id):
    data = request.get_json(silent=True) or {}
    with get_cursor() as cur:
        cur.execute("SELECT status FROM incidents WHERE id = %s", (incident_id,))
        current = cur.fetchone()
        if not current:
            return jsonify({"error": "not found"}), 404

        fields, values = [], []
        if "status" in data:
            new_status = data["status"]
            if new_status != current["status"] and new_status not in _VALID_TRANSITIONS.get(current["status"], set()):
                return jsonify({
                    "error": f"invalid transition {current['status']} -> {new_status}",
                    "valid_next_states": sorted(_VALID_TRANSITIONS.get(current["status"], set())),
                }), 400
            fields.append("status = %s")
            values.append(new_status)
            if new_status == "contained":
                fields.append("contained_at = now()")
            if new_status == "closed":
                fields.append("closed_at = now()")

        for key in ("summary", "severity", "category", "root_cause", "lessons_learned"):
            if key in data:
                fields.append(f"{key} = %s")
                values.append(data[key])

        if not fields:
            return jsonify({"error": "no updatable fields provided"}), 400
        values.append(incident_id)
        cur.execute(f"UPDATE incidents SET {', '.join(fields)} WHERE id = %s RETURNING *", values)
        updated = cur.fetchone()

        cur.execute(
            "INSERT INTO incident_timeline (incident_id, actor, action, notes, details) VALUES (%s, %s, %s, %s, %s)",
            (incident_id, g.user["username"], "status_change" if "status" in data else "updated",
             data.get("status", "field update"), __import__("json").dumps(data)),
        )
    return jsonify(updated)


@response_bp.route("/incidents/<int:incident_id>/notes", methods=["POST"])
@require_user()
def add_incident_note(incident_id):
    data = request.get_json(silent=True) or {}
    if not data.get("notes"):
        return jsonify({"error": "notes is required"}), 400
    with get_cursor() as cur:
        cur.execute("SELECT id FROM incidents WHERE id = %s", (incident_id,))
        if not cur.fetchone():
            return jsonify({"error": "not found"}), 404
        cur.execute(
            "INSERT INTO incident_timeline (incident_id, actor, action, notes) VALUES (%s, %s, 'note', %s) RETURNING *",
            (incident_id, g.user["username"], data["notes"]),
        )
        entry = cur.fetchone()
    return jsonify(entry), 201
