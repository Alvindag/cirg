"""CIRG backend entrypoint: Flask application factory wiring the core API
plus the Enterprise Security Operations (SOC) module — monitoring, detection,
alerting, incident response, remediation, threat intel, and reporting for
Windows 10 / 11 / Server 2016+ endpoints.

Run from the project root:  python backend/server.py
"""

import logging
import os
import sys

# Allow `python backend/server.py` to be run directly from the project root
# (README's documented entrypoint) by ensuring the project root — not
# backend/ itself — is on sys.path for the `backend.*` absolute imports below.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify
from flask_cors import CORS

from backend.config import config
from backend.db import init_pool
from backend.soc.detection import detection_bp
from backend.soc.remediation import remediation_bp
from backend.soc.reporting import reporting_bp
from backend.soc.response import response_bp
from backend.soc.rules_seed import seed_builtin_rules
from backend.soc.telemetry import telemetry_bp
from backend.soc.threat_intel import threat_intel_bp
from backend.soc.users import users_bp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("cirg")


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    init_pool()

    app.register_blueprint(users_bp)
    app.register_blueprint(telemetry_bp)
    app.register_blueprint(detection_bp)
    app.register_blueprint(response_bp)
    app.register_blueprint(remediation_bp)
    app.register_blueprint(threat_intel_bp)
    app.register_blueprint(reporting_bp)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "cirg-soc"})

    with app.app_context():
        try:
            n = seed_builtin_rules()
            logger.info("Seeded %d built-in detection rules", n)
        except Exception:
            logger.exception(
                "Could not seed built-in detection rules — is the database reachable and has "
                "`psql -U postgres -d %s -f database/soc_schema.sql` been run?",
                config.DB_NAME,
            )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=config.CIRG_PORT, debug=config.FLASK_DEBUG)
