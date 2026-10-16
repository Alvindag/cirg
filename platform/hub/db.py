import os, sqlite3
from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'readonly',
    password_hash TEXT NOT NULL,
    must_change_pw INTEGER NOT NULL DEFAULT 0,
    totp_secret TEXT,
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    source TEXT NOT NULL,
    source_id INTEGER,
    actor TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    content_hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ledger_source ON ledger(source, source_id);
CREATE TABLE IF NOT EXISTS ledger_cursor (
    source TEXT PRIMARY KEY,
    last_id INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attestations (
    control_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,              -- implemented | partial | not_implemented | not_applicable
    owner TEXT,
    evidence TEXT,
    attested_by TEXT NOT NULL,
    attested_at TEXT NOT NULL,
    review_due TEXT
);
CREATE TABLE IF NOT EXISTS score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taken_at TEXT NOT NULL DEFAULT (datetime('now')),
    score REAL NOT NULL,
    detail TEXT
);
"""


def connect():
    path = config.hub_db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def init():
    conn = connect()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
