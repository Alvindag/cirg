-- LAN Compliance Monitor schema

CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL,   -- AD sAMAccountName
    display_name TEXT,
    department   TEXT,
    ip_address   INET,
    hostname     TEXT,
    last_seen    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,     -- e.g. "social-media", "gambling", "streaming"
    is_blocked  BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS domain_categories (
    domain      TEXT PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id)
);

-- Raw usage events, ingested from Squid access.log
CREATE TABLE IF NOT EXISTS usage_events (
    id           BIGSERIAL PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL,
    client_ip    INET NOT NULL,
    user_id      INTEGER REFERENCES users(id),
    method       TEXT,
    url          TEXT NOT NULL,
    domain       TEXT NOT NULL,
    status_code  INTEGER,
    bytes        BIGINT,
    action       TEXT,             -- ALLOWED / BLOCKED / TCP_DENIED etc (from Squid result code)
    category_id  INTEGER REFERENCES categories(id)
);
CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events (ts);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_domain ON usage_events (domain);

-- Policy violations derived from usage_events (blocked-category hits, off-hours access, etc.)
CREATE TABLE IF NOT EXISTS compliance_violations (
    id            BIGSERIAL PRIMARY KEY,
    ts            TIMESTAMPTZ NOT NULL,
    user_id       INTEGER REFERENCES users(id),
    usage_event_id BIGINT REFERENCES usage_events(id),
    rule          TEXT NOT NULL,     -- e.g. "blocked-category", "off-hours", "data-volume"
    detail        TEXT,
    severity      TEXT DEFAULT 'medium'
);

-- Endpoint security posture, polled via WinRM/PowerShell
CREATE TABLE IF NOT EXISTS endpoint_posture (
    id                  BIGSERIAL PRIMARY KEY,
    ts                  TIMESTAMPTZ NOT NULL,
    hostname            TEXT NOT NULL,
    ip_address          INET,
    os_version           TEXT,
    defender_enabled    BOOLEAN,
    defender_up_to_date BOOLEAN,
    realtime_protection BOOLEAN,
    firewall_domain_on  BOOLEAN,
    firewall_private_on BOOLEAN,
    firewall_public_on  BOOLEAN,
    bitlocker_on        BOOLEAN,
    pending_updates     INTEGER,
    last_boot           TIMESTAMPTZ,
    reachable           BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_endpoint_posture_host_ts ON endpoint_posture (hostname, ts);

-- Active Directory / GPO security state snapshots
CREATE TABLE IF NOT EXISTS ad_security_snapshot (
    id                     BIGSERIAL PRIMARY KEY,
    ts                     TIMESTAMPTZ NOT NULL,
    min_password_length    INTEGER,
    password_complexity    BOOLEAN,
    max_password_age_days  INTEGER,
    lockout_threshold       INTEGER,
    stale_account_count    INTEGER,      -- no logon in > 90 days, still enabled
    disabled_account_count INTEGER,
    domain_admin_count     INTEGER,
    gpo_count              INTEGER,
    raw_json               JSONB
);

CREATE TABLE IF NOT EXISTS ad_stale_accounts (
    id            BIGSERIAL PRIMARY KEY,
    snapshot_id   BIGINT REFERENCES ad_security_snapshot(id),
    username      TEXT,
    last_logon    TIMESTAMPTZ,
    enabled       BOOLEAN
);

-- Network device inventory, from periodic ARP/nmap sweeps
CREATE TABLE IF NOT EXISTS network_devices (
    id          SERIAL PRIMARY KEY,
    mac_address TEXT UNIQUE NOT NULL,
    ip_address  INET,
    vendor      TEXT,
    hostname    TEXT,
    first_seen  TIMESTAMPTZ NOT NULL,
    last_seen   TIMESTAMPTZ NOT NULL,
    is_known    BOOLEAN DEFAULT FALSE,   -- true once an admin allow-lists it
    is_flagged  BOOLEAN DEFAULT FALSE    -- rogue/unexpected device
);

INSERT INTO categories (name, is_blocked, description) VALUES
    ('social-media', FALSE, 'Social networking sites'),
    ('streaming', FALSE, 'Video/audio streaming'),
    ('gambling', TRUE, 'Online gambling and betting'),
    ('adult', TRUE, 'Adult content'),
    ('malware', TRUE, 'Known malicious/C2 domains'),
    ('file-sharing', TRUE, 'P2P and file-sharing sites'),
    ('proxy-vpn', TRUE, 'Anonymizers, public proxies, VPN services'),
    ('uncategorized', FALSE, 'Not yet classified')
ON CONFLICT (name) DO NOTHING;
