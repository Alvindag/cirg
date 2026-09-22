"""Asset inventory, agent enrollment, heartbeat, and telemetry ingestion."""

from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from backend.auth import (
    generate_agent_api_key,
    generate_enrollment_token,
    hash_enrollment_token,
    require_agent,
    require_user,
)
from backend.config import config
from backend.db import get_cursor

telemetry_bp = Blueprint("telemetry", __name__, url_prefix="/api/soc")

SUPPORTED_OS = {"Windows 10", "Windows 11", "Windows Server 2016", "Windows Server 2019", "Windows Server 2022"}


# ---------------------------------------------------------------------------
# Enrollment
# ---------------------------------------------------------------------------
@telemetry_bp.route("/enroll/token", methods=["POST"])
@require_user(roles=("admin", "analyst"))
def create_enrollment_token():
    """Mint an enrollment token. By default it's single-use (max_uses=1), for
    enrolling one machine interactively. For a GPO computer-startup-script
    rollout, where every machine in an OU presents the same token, pass
    max_uses (e.g. the OU's machine count, or omit/null for unlimited within
    the token's expiry) and a ttl_hours long enough to cover the rollout."""
    data = request.get_json(silent=True) or {}
    max_uses = data.get("max_uses", 1)
    if max_uses is not None and (not isinstance(max_uses, int) or max_uses < 1):
        return jsonify({"error": "max_uses must be a positive integer, or null for unlimited"}), 400
    ttl_hours = data.get("ttl_hours", config.ENROLLMENT_TOKEN_TTL_HOURS)

    token, token_hash = generate_enrollment_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO enrollment_tokens (token_hash, created_by, expires_at, max_uses, label)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
            """,
            (token_hash, g.user["sub"], expires_at, max_uses, data.get("label")),
        )
    return jsonify({
        "enrollment_token": token,
        "expires_at": expires_at.isoformat(),
        "max_uses": max_uses,
        "usage": "Pass this as -EnrollToken to agent/install.ps1 on the target Windows host "
                 "(or as the shared token in a GPO computer startup script when max_uses > 1).",
    }), 201


@telemetry_bp.route("/enroll", methods=["POST"])
def enroll_agent():
    """Called once by install.ps1 on a new endpoint to register it and receive
    a long-lived agent API key. Authenticated by a single-use enrollment token
    rather than an existing agent key (the endpoint doesn't have one yet)."""
    data = request.get_json(silent=True) or {}
    token = data.get("enrollment_token")
    hostname = data.get("hostname")
    os_name = data.get("os_name")

    if not token or not hostname:
        return jsonify({"error": "enrollment_token and hostname are required"}), 400

    token_hash = hash_enrollment_token(token)

    with get_cursor() as cur:
        # Atomically claim one use of the token: the row-level lock this
        # UPDATE takes makes the max_uses check race-safe even when many
        # endpoints enroll at once (e.g. a GPO startup-script storm at boot).
        cur.execute(
            """
            UPDATE enrollment_tokens SET use_count = use_count + 1
            WHERE token_hash = %s AND expires_at > now()
              AND (max_uses IS NULL OR use_count < max_uses)
            RETURNING id
            """,
            (token_hash,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid, expired, or exhausted (max_uses reached) enrollment token"}), 401

        cur.execute(
            """
            INSERT INTO assets (hostname, domain, os_name, os_version, os_edition,
                                 architecture, ip_address, mac_address, agent_version,
                                 status, last_seen)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'online', now())
            RETURNING id, agent_id
            """,
            (
                hostname,
                data.get("domain"),
                os_name,
                data.get("os_version"),
                data.get("os_edition"),
                data.get("architecture"),
                data.get("ip_address"),
                data.get("mac_address"),
                data.get("agent_version"),
            ),
        )
        asset = cur.fetchone()

        full_key, prefix, key_hash = generate_agent_api_key()
        cur.execute(
            "INSERT INTO agent_api_keys (asset_id, key_prefix, key_hash) VALUES (%s, %s, %s)",
            (asset["id"], prefix, key_hash),
        )

        cur.execute(
            """
            UPDATE enrollment_tokens
            SET used_at = COALESCE(used_at, now()), used_by_asset = COALESCE(used_by_asset, %s)
            WHERE id = %s
            """,
            (asset["id"], row["id"]),
        )
        cur.execute(
            "INSERT INTO enrollment_token_uses (token_id, asset_id) VALUES (%s, %s)",
            (row["id"], asset["id"]),
        )

    return jsonify({
        "asset_id": asset["id"],
        "agent_id": str(asset["agent_id"]),
        "api_key": full_key,
        "warning": "Store this API key securely on the endpoint now — it will not be shown again.",
    }), 201


# ---------------------------------------------------------------------------
# Agent heartbeat + telemetry (agent-key auth)
# ---------------------------------------------------------------------------
@telemetry_bp.route("/heartbeat", methods=["POST"])
@require_agent
def heartbeat():
    data = request.get_json(silent=True) or {}
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE assets SET last_seen = now(), status = CASE WHEN status = 'isolated' THEN 'isolated' ELSE 'online' END,
                   agent_version = COALESCE(%s, agent_version),
                   ip_address = COALESCE(%s, ip_address)
            WHERE id = %s
            """,
            (data.get("agent_version"), data.get("ip_address"), g.asset_id),
        )
        cur.execute(
            "SELECT status, action_type, params, id FROM remediation_actions WHERE asset_id = %s AND status = 'pending' ORDER BY requested_at",
            (g.asset_id,),
        )
        pending = cur.fetchall()
    return jsonify({"ok": True, "pending_actions": len(pending)})


@telemetry_bp.route("/events", methods=["POST"])
@require_agent
def ingest_events():
    """Bulk-ingest a batch of Windows Event Log / Sysmon / PowerShell records."""
    data = request.get_json(silent=True) or {}
    events = data.get("events", [])
    if not isinstance(events, list) or not events:
        return jsonify({"error": "events must be a non-empty list"}), 400
    if len(events) > 2000:
        return jsonify({"error": "batch too large (max 2000 events)"}), 400

    inserted_ids = []
    with get_cursor() as cur:
        for evt in events:
            cur.execute(
                """
                INSERT INTO events (
                    asset_id, event_time, channel, provider, event_id, level, computer,
                    user_name, process_name, process_id, parent_process, command_line,
                    image_hash_sha256, dest_ip, dest_port, raw
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    g.asset_id,
                    evt.get("event_time"),
                    evt.get("channel"),
                    evt.get("provider"),
                    evt.get("event_id"),
                    evt.get("level"),
                    evt.get("computer"),
                    evt.get("user_name"),
                    evt.get("process_name"),
                    evt.get("process_id"),
                    evt.get("parent_process"),
                    evt.get("command_line"),
                    evt.get("image_hash_sha256"),
                    evt.get("dest_ip"),
                    evt.get("dest_port"),
                    __import__("json").dumps(evt),
                ),
            )
            inserted_ids.append(cur.fetchone()["id"])

    # Run the detection engine against the freshly ingested batch.
    from backend.soc.detection import evaluate_events  # deferred: avoid circular import
    from backend.soc.threat_intel import match_iocs_for_events  # deferred

    alerts_raised = evaluate_events(g.asset_id, inserted_ids)
    ioc_hits = match_iocs_for_events(g.asset_id, inserted_ids)

    return jsonify({
        "ingested": len(inserted_ids),
        "alerts_raised": alerts_raised,
        "ioc_matches": ioc_hits,
    }), 201


# ---------------------------------------------------------------------------
# Asset inventory (dashboard-user auth)
# ---------------------------------------------------------------------------
@telemetry_bp.route("/assets", methods=["GET"])
@require_user()
def list_assets():
    status = request.args.get("status")
    query = "SELECT * FROM assets"
    params = []
    if status:
        query += " WHERE status = %s"
        params.append(status)
    query += " ORDER BY last_seen DESC NULLS LAST"

    with get_cursor() as cur:
        cur.execute(query, params)
        assets = cur.fetchall()

    threshold = datetime.now(timezone.utc) - timedelta(seconds=config.AGENT_OFFLINE_THRESHOLD_SECONDS)
    for a in assets:
        if a["status"] == "online" and a["last_seen"] and a["last_seen"] < threshold:
            a["status"] = "offline (stale heartbeat)"
    return jsonify(assets)


@telemetry_bp.route("/assets/<int:asset_id>", methods=["GET"])
@require_user()
def get_asset(asset_id):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM assets WHERE id = %s", (asset_id,))
        asset = cur.fetchone()
        if not asset:
            return jsonify({"error": "not found"}), 404
        cur.execute(
            "SELECT * FROM events WHERE asset_id = %s ORDER BY event_time DESC LIMIT 100",
            (asset_id,),
        )
        asset["recent_events"] = cur.fetchall()
        cur.execute(
            "SELECT * FROM alerts WHERE asset_id = %s ORDER BY triggered_at DESC LIMIT 50",
            (asset_id,),
        )
        asset["recent_alerts"] = cur.fetchall()
    return jsonify(asset)


@telemetry_bp.route("/assets/<int:asset_id>", methods=["PATCH"])
@require_user(roles=("admin", "analyst"))
def update_asset(asset_id):
    data = request.get_json(silent=True) or {}
    fields, values = [], []
    for key in ("criticality", "tags", "status"):
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data[key])
    if not fields:
        return jsonify({"error": "no updatable fields provided"}), 400
    values.append(asset_id)
    with get_cursor() as cur:
        cur.execute(f"UPDATE assets SET {', '.join(fields)} WHERE id = %s RETURNING *", values)
        updated = cur.fetchone()
    if not updated:
        return jsonify({"error": "not found"}), 404
    return jsonify(updated)
