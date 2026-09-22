import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from backend.config import config
from backend.db import get_cursor

JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = 12


# ---------------------------------------------------------------------------
# Dashboard user auth (username/password -> JWT bearer token)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)


def issue_user_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_user_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, config.SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[len("Bearer ") :].strip()
    # Fallback for plain <a href> navigations (e.g. report downloads) that
    # can't set a custom header.
    return request.args.get("token")


def require_user(roles: tuple[str, ...] | None = None):
    """Route decorator requiring a valid dashboard-user JWT, optionally scoped to roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = _bearer_token()
            if not token:
                return jsonify({"error": "authentication required"}), 401
            payload = decode_user_token(token)
            if not payload:
                return jsonify({"error": "invalid or expired token"}), 401
            if roles and payload.get("role") not in roles:
                return jsonify({"error": "insufficient permissions"}), 403
            g.user = payload
            return fn(*args, **kwargs)

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Agent API-key auth (Windows endpoints authenticating to the collector)
# ---------------------------------------------------------------------------
def generate_agent_api_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, sha256_hash) — only the hash is stored."""
    full_key = f"cirg_agt_{secrets.token_urlsafe(32)}"
    prefix = full_key[:16]
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, prefix, key_hash


def hash_agent_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def require_agent(fn):
    """Route decorator requiring a valid agent API key; sets g.asset_id."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        api_key = _bearer_token() or request.headers.get("X-Agent-Key")
        if not api_key or len(api_key) < 16:
            return jsonify({"error": "agent authentication required"}), 401

        prefix = api_key[:16]
        key_hash = hash_agent_api_key(api_key)

        with get_cursor() as cur:
            cur.execute(
                """
                SELECT id, asset_id FROM agent_api_keys
                WHERE key_prefix = %s AND key_hash = %s AND revoked_at IS NULL
                """,
                (prefix, key_hash),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "invalid agent credentials"}), 401
            cur.execute(
                "UPDATE agent_api_keys SET last_used_at = now() WHERE id = %s",
                (row["id"],),
            )

        g.asset_id = row["asset_id"]
        return fn(*args, **kwargs)

    return wrapper


def generate_enrollment_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


def hash_enrollment_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
