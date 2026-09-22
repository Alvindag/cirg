"""Detection rule management and the rule-evaluation engine.

Rules use a small Sigma-inspired structured format stored as JSON:

    {
      "event_id": 4625,                 # optional: exact Windows Event ID match
      "channel": "Security",            # optional: exact channel match
      "field_matches": [                # optional: all must match (AND)
        {"field": "command_line", "op": "icontains", "value": "-enc"}
      ],
      "threshold": {                    # optional: require N matches in a
        "count": 5,                     # time window (e.g. brute force),
        "window_seconds": 300,          # grouped by a field (e.g. per user)
        "group_by": "user_name"
      }
    }

Every ingested event batch is evaluated against all enabled rules; matches
raise an `alerts` row tagged with the rule's MITRE ATT&CK techniques.
"""

import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from backend.auth import require_user
from backend.db import get_cursor

detection_bp = Blueprint("detection", __name__, url_prefix="/api/soc")

ALERT_DEDUP_WINDOW_SECONDS = 600  # don't re-fire the same rule+asset more than once per 10 min

_OPS = {
    "eq": lambda field_val, val: str(field_val) == str(val),
    "neq": lambda field_val, val: str(field_val) != str(val),
    "contains": lambda field_val, val: val in (field_val or ""),
    "icontains": lambda field_val, val: str(val).lower() in str(field_val or "").lower(),
    "regex": lambda field_val, val: bool(re.search(val, field_val or "", re.IGNORECASE)),
    "in": lambda field_val, val: field_val in val,
    "gt": lambda field_val, val: (field_val or 0) > val,
    "gte": lambda field_val, val: (field_val or 0) >= val,
}


def _event_matches_base(event: dict, logic: dict) -> bool:
    if logic.get("event_id") is not None and event.get("event_id") != logic["event_id"]:
        return False
    if logic.get("channel") and event.get("channel") != logic["channel"]:
        return False
    for cond in logic.get("field_matches", []):
        op_fn = _OPS.get(cond.get("op", "icontains"))
        if not op_fn:
            continue
        if not op_fn(event.get(cond["field"]), cond["value"]):
            return False
    return True


def evaluate_events(asset_id: int, event_ids: list[int]) -> int:
    """Evaluate freshly-ingested events against all enabled rules. Returns
    the number of new alerts raised."""
    if not event_ids:
        return 0

    with get_cursor() as cur:
        cur.execute("SELECT * FROM events WHERE id = ANY(%s)", (event_ids,))
        new_events = cur.fetchall()

        cur.execute("SELECT * FROM detection_rules WHERE enabled = TRUE")
        rules = cur.fetchall()

        alerts_raised = 0
        for rule in rules:
            logic = rule["logic"] or {}
            base_matches = [e for e in new_events if _event_matches_base(e, logic)]
            if not base_matches:
                continue

            threshold = logic.get("threshold")
            if not threshold:
                for evt in base_matches:
                    if _raise_alert(cur, rule, asset_id, [evt["id"]]):
                        alerts_raised += 1
                continue

            # Threshold rule: count matching events for this asset within the
            # window, grouped by a field (e.g. failed logons per user).
            window_start = datetime.now(timezone.utc) - timedelta(seconds=threshold["window_seconds"])
            group_field = threshold.get("group_by")
            seen_groups = set()
            for evt in base_matches:
                group_val = evt.get(group_field) if group_field else "_all_"
                if group_val in seen_groups:
                    continue
                seen_groups.add(group_val)

                count_query = "SELECT id FROM events WHERE asset_id = %s AND event_time >= %s"
                params = [asset_id, window_start]
                if logic.get("event_id") is not None:
                    count_query += " AND event_id = %s"
                    params.append(logic["event_id"])
                if group_field:
                    count_query += f" AND {group_field} = %s"
                    params.append(group_val)
                cur.execute(count_query, params)
                matched_ids = [r["id"] for r in cur.fetchall()]

                if len(matched_ids) >= threshold["count"]:
                    if _raise_alert(cur, rule, asset_id, matched_ids):
                        alerts_raised += 1

    return alerts_raised


def _raise_alert(cur, rule: dict, asset_id: int, matched_event_ids: list[int]) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=ALERT_DEDUP_WINDOW_SECONDS)
    cur.execute(
        """
        SELECT id FROM alerts
        WHERE rule_id = %s AND asset_id = %s AND triggered_at >= %s AND status = 'new'
        """,
        (rule["id"], asset_id, cutoff),
    )
    if cur.fetchone():
        return False

    cur.execute(
        """
        INSERT INTO alerts (rule_id, rule_key, asset_id, title, description, severity,
                             matched_event_ids, mitre_attack_techniques)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            rule["id"],
            rule["rule_key"],
            asset_id,
            rule["name"],
            rule["description"],
            rule["severity"],
            matched_event_ids,
            rule["mitre_attack_techniques"],
        ),
    )
    return True


# ---------------------------------------------------------------------------
# Rule management API
# ---------------------------------------------------------------------------
@detection_bp.route("/rules", methods=["GET"])
@require_user()
def list_rules():
    with get_cursor() as cur:
        cur.execute("SELECT * FROM detection_rules ORDER BY severity DESC, name")
        rules = cur.fetchall()
    return jsonify(rules)


@detection_bp.route("/rules", methods=["POST"])
@require_user(roles=("admin", "analyst"))
def create_rule():
    data = request.get_json(silent=True) or {}
    required = ("rule_key", "name", "logic")
    if any(k not in data for k in required):
        return jsonify({"error": f"missing required fields: {required}"}), 400

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO detection_rules (rule_key, name, description, severity, channel, logic,
                                          mitre_attack_techniques, nist_csf_categories, enabled, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                data["rule_key"],
                data["name"],
                data.get("description"),
                data.get("severity", "medium"),
                data.get("channel"),
                __import__("json").dumps(data["logic"]),
                data.get("mitre_attack_techniques", []),
                data.get("nist_csf_categories", []),
                data.get("enabled", True),
                g.user["sub"],
            ),
        )
        rule = cur.fetchone()
    return jsonify(rule), 201


@detection_bp.route("/rules/<int:rule_id>", methods=["PATCH"])
@require_user(roles=("admin", "analyst"))
def update_rule(rule_id):
    data = request.get_json(silent=True) or {}
    fields, values = [], []
    for key in ("name", "description", "severity", "enabled", "mitre_attack_techniques", "nist_csf_categories"):
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data[key])
    if "logic" in data:
        fields.append("logic = %s")
        values.append(__import__("json").dumps(data["logic"]))
    if not fields:
        return jsonify({"error": "no updatable fields provided"}), 400
    fields.append("updated_at = now()")
    values.append(rule_id)
    with get_cursor() as cur:
        cur.execute(f"UPDATE detection_rules SET {', '.join(fields)} WHERE id = %s RETURNING *", values)
        updated = cur.fetchone()
    if not updated:
        return jsonify({"error": "not found"}), 404
    return jsonify(updated)


@detection_bp.route("/rules/<int:rule_id>", methods=["DELETE"])
@require_user(roles=("admin",))
def delete_rule(rule_id):
    with get_cursor() as cur:
        cur.execute("DELETE FROM detection_rules WHERE id = %s AND is_builtin = FALSE RETURNING id", (rule_id,))
        deleted = cur.fetchone()
    if not deleted:
        return jsonify({"error": "not found, or built-in rules cannot be deleted"}), 404
    return jsonify({"deleted": rule_id})
