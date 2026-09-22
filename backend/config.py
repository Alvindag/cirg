import os

from dotenv import load_dotenv

load_dotenv()

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "5432"))
    DB_NAME = os.getenv("DB_NAME", "cfems")
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")

    CIRG_PORT = int(os.getenv("CIRG_PORT", "5001"))
    FLASK_DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"

    # Secret used to sign session/API tokens for the dashboard. Must be set
    # explicitly in production; a per-process random fallback is used only so
    # local dev doesn't crash, and it deliberately invalidates all sessions on
    # restart.
    SECRET_KEY = os.getenv("SECRET_KEY") or os.urandom(32).hex()

    # Where generated PDF reports are written (git-ignored). Resolved to an
    # absolute path: Flask's send_file() resolves relative paths against the
    # app's root_path (backend/), not the process CWD, which would otherwise
    # silently look in the wrong directory.
    REPORTS_DIR = os.path.abspath(os.getenv("REPORTS_DIR", os.path.join(_PROJECT_ROOT, "reports")))

    # Endpoints report in as "offline" once no heartbeat has been received
    # for this many seconds.
    AGENT_OFFLINE_THRESHOLD_SECONDS = int(os.getenv("AGENT_OFFLINE_THRESHOLD_SECONDS", "180"))

    # How long an enrollment token used by install.ps1 remains valid.
    ENROLLMENT_TOKEN_TTL_HOURS = int(os.getenv("ENROLLMENT_TOKEN_TTL_HOURS", "24"))

    @property
    def dsn(self) -> str:
        return (
            f"host={self.DB_HOST} port={self.DB_PORT} dbname={self.DB_NAME} "
            f"user={self.DB_USER} password={self.DB_PASSWORD}"
        )


config = Config()
