"""Dashboard analyst accounts: bootstrap admin, login, and user management."""

from flask import Blueprint, g, jsonify, request

from backend.auth import hash_password, issue_user_token, require_user, verify_password
from backend.db import get_cursor

users_bp = Blueprint("users", __name__, url_prefix="/api/soc/auth")


@users_bp.route("/register", methods=["POST"])
def register():
    """Open only to create the very first (admin) account; every subsequent
    account must be created by an existing admin via /users."""
    with get_cursor() as cur:
        cur.execute("SELECT count(*) AS c FROM soc_users")
        if cur.fetchone()["c"] > 0:
            return jsonify({"error": "registration is closed; ask an admin to create your account"}), 403

    data = request.get_json(silent=True) or {}
    required = ("username", "email", "password")
    if any(not data.get(k) for k in required):
        return jsonify({"error": f"missing required fields: {required}"}), 400

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO soc_users (username, email, password_hash, full_name, role)
            VALUES (%s, %s, %s, %s, 'admin') RETURNING id, username, role
            """,
            (data["username"], data["email"], hash_password(data["password"]), data.get("full_name")),
        )
        user = cur.fetchone()

    token = issue_user_token(user["id"], user["username"], user["role"])
    return jsonify({"token": token, "user": user}), 201


@users_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    with get_cursor() as cur:
        cur.execute("SELECT * FROM soc_users WHERE username = %s AND is_active = TRUE", (username,))
        user = cur.fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            return jsonify({"error": "invalid credentials"}), 401
        cur.execute("UPDATE soc_users SET last_login_at = now() WHERE id = %s", (user["id"],))

    token = issue_user_token(user["id"], user["username"], user["role"])
    return jsonify({
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "role": user["role"], "full_name": user["full_name"]},
    })


@users_bp.route("/me", methods=["GET"])
@require_user()
def me():
    return jsonify(g.user)


@users_bp.route("", methods=["GET"], strict_slashes=False)
@require_user(roles=("admin",))
def list_users():
    with get_cursor() as cur:
        cur.execute("SELECT id, username, email, full_name, role, is_active, created_at, last_login_at FROM soc_users ORDER BY created_at")
        return jsonify(cur.fetchall())


@users_bp.route("", methods=["POST"], strict_slashes=False)
@require_user(roles=("admin",))
def create_user():
    data = request.get_json(silent=True) or {}
    required = ("username", "email", "password")
    if any(not data.get(k) for k in required):
        return jsonify({"error": f"missing required fields: {required}"}), 400
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO soc_users (username, email, password_hash, full_name, role)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, username, email, full_name, role, is_active, created_at
            """,
            (data["username"], data["email"], hash_password(data["password"]),
             data.get("full_name"), data.get("role", "analyst")),
        )
        user = cur.fetchone()
    return jsonify(user), 201
