"""Threat intelligence: IOC storage, bulk import (manual list or STIX 2.1
'indicator' objects), and automatic correlation against ingested telemetry."""

from flask import Blueprint, jsonify, request

from backend.auth import require_user
from backend.db import get_cursor

threat_intel_bp = Blueprint("threat_intel", __name__, url_prefix="/api/soc")

IOC_TYPES = ("ip", "domain", "url", "hash_md5", "hash_sha1", "hash_sha256")

# Maps an IOC type to the events.* column(s) it should be correlated against.
_IOC_EVENT_FIELD = {
    "ip": "dest_ip",
    "hash_sha256": "image_hash_sha256",
}


@threat_intel_bp.route("/threat-intel/iocs", methods=["GET"])
@require_user()
def list_iocs():
    ioc_type = request.args.get("type")
    active_only = request.args.get("active", "true").lower() != "false"
    query = "SELECT * FROM threat_intel_iocs WHERE 1=1"
    params = []
    if ioc_type:
        query += " AND ioc_type = %s"
        params.append(ioc_type)
    if active_only:
        query += " AND active = TRUE"
    query += " ORDER BY last_seen DESC LIMIT 1000"
    with get_cursor() as cur:
        cur.execute(query, params)
        iocs = cur.fetchall()
    return jsonify(iocs)


@threat_intel_bp.route("/threat-intel/iocs", methods=["POST"])
@require_user(roles=("admin", "analyst"))
def add_ioc():
    data = request.get_json(silent=True) or {}
    if data.get("ioc_type") not in IOC_TYPES or not data.get("value"):
        return jsonify({"error": f"ioc_type must be one of {IOC_TYPES}, and value is required"}), 400
    ioc = _upsert_ioc(data)
    return jsonify(ioc), 201


@threat_intel_bp.route("/threat-intel/import", methods=["POST"])
@require_user(roles=("admin", "analyst"))
def bulk_import_iocs():
    """Accepts either:
      {"iocs": [{"ioc_type": "ip", "value": "1.2.3.4", "severity": "high", ...}, ...]}
    or a minimal STIX 2.1 bundle:
      {"type": "bundle", "objects": [{"type": "indicator", "pattern": "[ipv4-addr:value = '1.2.3.4']", ...}]}
    """
    data = request.get_json(silent=True) or {}
    records = []

    if data.get("type") == "bundle":
        for obj in data.get("objects", []):
            if obj.get("type") != "indicator":
                continue
            parsed = _parse_stix_pattern(obj.get("pattern", ""))
            if parsed:
                ioc_type, value = parsed
                records.append({
                    "ioc_type": ioc_type,
                    "value": value,
                    "source": data.get("source", "stix_import"),
                    "severity": obj.get("cirg_severity", "medium"),
                    "description": obj.get("description") or obj.get("name"),
                    "tags": obj.get("labels", []),
                })
    else:
        records = data.get("iocs", [])

    inserted = 0
    errors = []
    for rec in records:
        if rec.get("ioc_type") not in IOC_TYPES or not rec.get("value"):
            errors.append({"record": rec, "error": "invalid ioc_type or missing value"})
            continue
        _upsert_ioc(rec)
        inserted += 1

    return jsonify({"imported": inserted, "errors": errors}), 201


def _upsert_ioc(rec: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO threat_intel_iocs (ioc_type, value, source, severity, description, tags)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (ioc_type, value) DO UPDATE SET
                last_seen = now(), active = TRUE,
                severity = EXCLUDED.severity,
                source = EXCLUDED.source,
                description = COALESCE(EXCLUDED.description, threat_intel_iocs.description)
            RETURNING *
            """,
            (
                rec["ioc_type"],
                rec["value"].strip().lower() if rec["ioc_type"] != "hash_sha256" else rec["value"].strip().lower(),
                rec.get("source", "manual"),
                rec.get("severity", "medium"),
                rec.get("description"),
                rec.get("tags", []),
            ),
        )
        return cur.fetchone()


def _parse_stix_pattern(pattern: str):
    """Very small STIX pattern subset parser: [ipv4-addr:value = '1.2.3.4'],
    [domain-name:value = 'evil.com'], [file:hashes.SHA256 = 'abc...']"""
    import re

    m = re.search(r"ipv4-addr:value\s*=\s*'([^']+)'", pattern)
    if m:
        return "ip", m.group(1)
    m = re.search(r"domain-name:value\s*=\s*'([^']+)'", pattern)
    if m:
        return "domain", m.group(1)
    m = re.search(r"url:value\s*=\s*'([^']+)'", pattern)
    if m:
        return "url", m.group(1)
    m = re.search(r"file:hashes\.(?:'?SHA-?256'?)\s*=\s*'([^']+)'", pattern, re.IGNORECASE)
    if m:
        return "hash_sha256", m.group(1)
    return None


@threat_intel_bp.route("/threat-intel/iocs/<int:ioc_id>", methods=["DELETE"])
@require_user(roles=("admin", "analyst"))
def deactivate_ioc(ioc_id):
    with get_cursor() as cur:
        cur.execute("UPDATE threat_intel_iocs SET active = FALSE WHERE id = %s RETURNING id", (ioc_id,))
        updated = cur.fetchone()
    if not updated:
        return jsonify({"error": "not found"}), 404
    return jsonify({"deactivated": ioc_id})


def match_iocs_for_events(asset_id: int, event_ids: list[int]) -> int:
    """Correlate newly-ingested events against active IOCs (by dest IP and
    file hash). Raises a high-severity alert per match. Returns match count."""
    if not event_ids:
        return 0

    matches = 0
    with get_cursor() as cur:
        cur.execute("SELECT * FROM events WHERE id = ANY(%s)", (event_ids,))
        events = cur.fetchall()

        cur.execute("SELECT * FROM threat_intel_iocs WHERE active = TRUE")
        iocs_by_type: dict[str, dict[str, dict]] = {}
        for ioc in cur.fetchall():
            iocs_by_type.setdefault(ioc["ioc_type"], {})[ioc["value"]] = ioc

        for evt in events:
            hit = None
            ioc_type = None
            if evt.get("dest_ip") and str(evt["dest_ip"]) in iocs_by_type.get("ip", {}):
                hit = iocs_by_type["ip"][str(evt["dest_ip"])]
                ioc_type = "ip"
            elif evt.get("image_hash_sha256") and evt["image_hash_sha256"].lower() in iocs_by_type.get("hash_sha256", {}):
                hit = iocs_by_type["hash_sha256"][evt["image_hash_sha256"].lower()]
                ioc_type = "hash_sha256"

            if not hit:
                continue

            cur.execute(
                """
                INSERT INTO alerts (asset_id, title, description, severity, matched_event_ids, mitre_attack_techniques)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
                """,
                (
                    asset_id,
                    f"Threat intel match: {ioc_type} {hit['value']}",
                    f"Event matched known-bad {ioc_type} indicator from source '{hit['source']}': {hit.get('description') or ''}",
                    hit["severity"],
                    [evt["id"]],
                    ["T1071"] if ioc_type == "ip" else ["T1204"],
                ),
            )
            alert_id = cur.fetchone()["id"]

            cur.execute(
                "INSERT INTO ioc_matches (ioc_id, event_id, asset_id, alert_id) VALUES (%s, %s, %s, %s)",
                (hit["id"], evt["id"], asset_id, alert_id),
            )
            cur.execute("UPDATE threat_intel_iocs SET last_seen = now() WHERE id = %s", (hit["id"],))
            matches += 1

    return matches
