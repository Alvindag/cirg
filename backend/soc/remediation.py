"""Remediation action queue: analysts request actions from the dashboard,
Windows agents poll for and execute them, then report results back.

Supported action_type values (see agent/windows_agent.py for execution):
  isolate_host          - block all network traffic except the collector (Windows Firewall)
  unisolate_host        - remove the isolation firewall rules
  kill_process          - terminate a process by PID or image name
  block_ip               - add an outbound/inbound Windows Firewall block rule for an IP
  quarantine_file         - move a file to a quarantine folder and strip execute permission
  disable_local_user      - disable a local Windows account (net user /active:no)
  collect_triage_package  - gather a forensic triage bundle (event logs, prefetch, autoruns)
  run_av_scan              - trigger a Windows Defender quick/full scan
"""

from flask import Blueprint, g, jsonify, request

from backend.auth import require_agent, require_user
from backend.db import get_cursor

remediation_bp = Blueprint("remediation", __name__, url_prefix="/api/soc")

ACTION_TYPES = (
    "isolate_host", "unisolate_host", "kill_process", "block_ip",
    "quarantine_file", "disable_local_user", "collect_triage_package", "run_av_scan",
)

# Actions serious enough to require an admin or analyst (never a viewer), and
# logged distinctly in the audit trail.
_HIGH_IMPACT = {"isolate_host", "kill_process", "disable_local_user"}


@remediation_bp.route("/remediation", methods=["GET"])
@require_user()
def list_remediation_actions():
    asset_id = request.args.get("asset_id")
    status = request.args.get("status")
    query = "SELECT * FROM remediation_actions WHERE 1=1"
    params = []
    if asset_id:
        query += " AND asset_id = %s"
        params.append(asset_id)
    if status:
        query += " AND status = %s"
        params.append(status)
    query += " ORDER BY requested_at DESC LIMIT 500"
    with get_cursor() as cur:
        cur.execute(query, params)
        actions = cur.fetchall()
    return jsonify(actions)


@remediation_bp.route("/remediation", methods=["POST"])
@require_user(roles=("admin", "analyst"))
def request_remediation():
    data = request.get_json(silent=True) or {}
    action_type = data.get("action_type")
    asset_id = data.get("asset_id")

    if action_type not in ACTION_TYPES:
        return jsonify({"error": f"action_type must be one of {ACTION_TYPES}"}), 400
    if not asset_id:
        return jsonify({"error": "asset_id is required"}), 400
    if action_type in _HIGH_IMPACT and g.user.get("role") not in ("admin", "analyst"):
        return jsonify({"error": "insufficient permissions for this action"}), 403

    with get_cursor() as cur:
        cur.execute("SELECT id, status FROM assets WHERE id = %s", (asset_id,))
        asset = cur.fetchone()
        if not asset:
            return jsonify({"error": "asset not found"}), 404

        cur.execute(
            """
            INSERT INTO remediation_actions (asset_id, incident_id, alert_id, action_type, params, requested_by)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING *
            """,
            (asset_id, data.get("incident_id"), data.get("alert_id"), action_type,
             __import__("json").dumps(data.get("params", {})), g.user["sub"]),
        )
        action = cur.fetchone()

        if data.get("incident_id"):
            cur.execute(
                "INSERT INTO incident_timeline (incident_id, actor, action, notes, details) VALUES (%s, %s, 'remediation_requested', %s, %s)",
                (data["incident_id"], g.user["username"], f"{action_type} requested for asset #{asset_id}",
                 __import__("json").dumps(data.get("params", {}))),
            )

        cur.execute(
            "INSERT INTO audit_log (actor, action, target_type, target_id, details) VALUES (%s, %s, 'asset', %s, %s)",
            (g.user["username"], f"remediation_requested:{action_type}", str(asset_id),
             __import__("json").dumps(data.get("params", {}))),
        )

    return jsonify(action), 201


@remediation_bp.route("/remediation/<int:action_id>/cancel", methods=["POST"])
@require_user(roles=("admin", "analyst"))
def cancel_remediation(action_id):
    with get_cursor() as cur:
        cur.execute(
            "UPDATE remediation_actions SET status = 'cancelled' WHERE id = %s AND status = 'pending' RETURNING *",
            (action_id,),
        )
        updated = cur.fetchone()
    if not updated:
        return jsonify({"error": "not found, or already sent/completed"}), 404
    return jsonify(updated)


# ---------------------------------------------------------------------------
# Agent-facing: poll for and report on remediation actions
# ---------------------------------------------------------------------------
@remediation_bp.route("/remediation/pending", methods=["GET"])
@require_agent
def poll_pending_actions():
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM remediation_actions WHERE asset_id = %s AND status = 'pending' ORDER BY requested_at",
            (g.asset_id,),
        )
        actions = cur.fetchall()
        if actions:
            cur.execute(
                "UPDATE remediation_actions SET status = 'sent', sent_at = now() WHERE id = ANY(%s)",
                ([a["id"] for a in actions],),
            )
    return jsonify(actions)


@remediation_bp.route("/remediation/<int:action_id>/result", methods=["POST"])
@require_agent
def report_action_result(action_id):
    data = request.get_json(silent=True) or {}
    success = bool(data.get("success"))
    status = "completed" if success else "failed"

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE remediation_actions SET status = %s, completed_at = now(), result = %s
            WHERE id = %s AND asset_id = %s RETURNING *
            """,
            (status, __import__("json").dumps(data.get("result", {})), action_id, g.asset_id),
        )
        action = cur.fetchone()
        if not action:
            return jsonify({"error": "not found"}), 404

        if success and action["action_type"] == "isolate_host":
            cur.execute("UPDATE assets SET status = 'isolated', isolated_at = now() WHERE id = %s", (g.asset_id,))
        elif success and action["action_type"] == "unisolate_host":
            cur.execute("UPDATE assets SET status = 'online', isolated_at = NULL WHERE id = %s", (g.asset_id,))

        if action["incident_id"]:
            cur.execute(
                "INSERT INTO incident_timeline (incident_id, actor, action, notes, details) VALUES (%s, 'agent', 'remediation_result', %s, %s)",
                (action["incident_id"], f"{action['action_type']} -> {status}", __import__("json").dumps(data.get("result", {}))),
            )

    return jsonify(action)
