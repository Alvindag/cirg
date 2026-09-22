-- ============================================================================
-- CIRG Enterprise Security Operations (SOC) schema
--
-- Adds monitoring, detection, alerting, incident response, remediation,
-- threat intelligence, and reporting tables on top of the shared CFEMS/CIRG
-- PostgreSQL database. Run after the core cirg_schema.sql (if present):
--
--   psql -U postgres -d cfems -f database/soc_schema.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Analysts / dashboard users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soc_users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(30) NOT NULL DEFAULT 'analyst'
                       CHECK (role IN ('admin', 'analyst', 'viewer')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Assets (monitored endpoints: Windows 10, Windows 11, Windows Server 2016+)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
    id                SERIAL PRIMARY KEY,
    agent_id          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    hostname          VARCHAR(255) NOT NULL,
    domain            VARCHAR(255),
    os_name           VARCHAR(100),        -- 'Windows 10', 'Windows 11', 'Windows Server 2016'
    os_version        VARCHAR(100),        -- build number, e.g. 10.0.19045
    os_edition        VARCHAR(100),
    architecture      VARCHAR(20),
    ip_address        INET,
    mac_address       MACADDR,
    agent_version     VARCHAR(50),
    criticality       VARCHAR(20) NOT NULL DEFAULT 'medium'
                         CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
    tags              TEXT[] NOT NULL DEFAULT '{}',
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'online', 'offline', 'isolated', 'decommissioned')),
    first_seen        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen         TIMESTAMPTZ,
    isolated_at       TIMESTAMPTZ,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_hostname ON assets(hostname);

-- Per-agent bearer credential (hashed). One asset may rotate keys over time.
CREATE TABLE IF NOT EXISTS agent_api_keys (
    id              SERIAL PRIMARY KEY,
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    key_prefix      VARCHAR(16) NOT NULL,   -- first chars of key, for lookup
    key_hash        VARCHAR(255) NOT NULL,  -- sha256 hex of the full key
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_api_keys_prefix ON agent_api_keys(key_prefix);

-- Enrollment tokens issued by an admin, used once by install.ps1 to register
-- a new endpoint and mint its agent_api_key.
CREATE TABLE IF NOT EXISTS enrollment_tokens (
    id              SERIAL PRIMARY KEY,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    created_by      INTEGER REFERENCES soc_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    used_by_asset   INTEGER REFERENCES assets(id)
);

-- ---------------------------------------------------------------------------
-- Telemetry events (Windows Event Log / Sysmon / PowerShell channels)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    event_time      TIMESTAMPTZ NOT NULL,
    channel         VARCHAR(100) NOT NULL,   -- Security, System, Microsoft-Windows-Sysmon/Operational, ...
    provider        VARCHAR(150),
    event_id        INTEGER NOT NULL,
    level            VARCHAR(20),
    computer        VARCHAR(255),
    user_name       VARCHAR(255),
    process_name    VARCHAR(500),
    process_id      INTEGER,
    parent_process   VARCHAR(500),
    command_line    TEXT,
    image_hash_sha256 VARCHAR(64),
    dest_ip         INET,
    dest_port       INTEGER,
    raw             JSONB NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_asset_time ON events(asset_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_events_channel_eventid ON events(channel, event_id);
CREATE INDEX IF NOT EXISTS idx_events_ingested_at ON events(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_gin ON events USING GIN (raw);
CREATE INDEX IF NOT EXISTS idx_events_dest_ip ON events(dest_ip);
CREATE INDEX IF NOT EXISTS idx_events_hash ON events(image_hash_sha256);

-- ---------------------------------------------------------------------------
-- Detection rules (Sigma-lite: simple structured match conditions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_rules (
    id                    SERIAL PRIMARY KEY,
    rule_key              VARCHAR(150) NOT NULL UNIQUE,
    name                  VARCHAR(255) NOT NULL,
    description           TEXT,
    severity              VARCHAR(20) NOT NULL DEFAULT 'medium'
                             CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    channel               VARCHAR(100),
    -- logic: {"event_id": 4625, "field_matches": [{"field": "user_name", "op": "eq", "value": "..."}],
    --         "threshold": {"count": 5, "window_seconds": 300, "group_by": "user_name"}}
    logic                 JSONB NOT NULL,
    mitre_attack_techniques TEXT[] NOT NULL DEFAULT '{}',
    nist_csf_categories    TEXT[] NOT NULL DEFAULT '{}',
    enabled               BOOLEAN NOT NULL DEFAULT TRUE,
    is_builtin            BOOLEAN NOT NULL DEFAULT FALSE,
    created_by            INTEGER REFERENCES soc_users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id                 SERIAL PRIMARY KEY,
    rule_id            INTEGER REFERENCES detection_rules(id) ON DELETE SET NULL,
    rule_key           VARCHAR(150),
    asset_id           INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    title              VARCHAR(255) NOT NULL,
    description        TEXT,
    severity           VARCHAR(20) NOT NULL DEFAULT 'medium'
                          CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    status             VARCHAR(20) NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'investigating', 'contained', 'resolved', 'false_positive')),
    matched_event_ids  BIGINT[] NOT NULL DEFAULT '{}',
    mitre_attack_techniques TEXT[] NOT NULL DEFAULT '{}',
    assignee           INTEGER REFERENCES soc_users(id),
    incident_id        INTEGER,
    triggered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_asset ON alerts(asset_id);

-- ---------------------------------------------------------------------------
-- Incidents (case management)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    category        VARCHAR(100),     -- ransomware, phishing, credential-access, lateral-movement, ...
    severity        VARCHAR(20) NOT NULL DEFAULT 'medium'
                       CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    -- NIST SP 800-61 Rev.2 lifecycle phases
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'contained', 'eradicated', 'recovering', 'closed')),
    summary         TEXT,
    lead_analyst    INTEGER REFERENCES soc_users(id),
    related_alert_ids INTEGER[] NOT NULL DEFAULT '{}',
    affected_asset_ids INTEGER[] NOT NULL DEFAULT '{}',
    mitre_attack_techniques TEXT[] NOT NULL DEFAULT '{}',
    root_cause      TEXT,
    lessons_learned TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    contained_at    TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ
);

ALTER TABLE alerts
    ADD CONSTRAINT fk_alerts_incident
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS incident_timeline (
    id            SERIAL PRIMARY KEY,
    incident_id   INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor         VARCHAR(255) NOT NULL,       -- analyst username or 'system'
    action        VARCHAR(100) NOT NULL,       -- note, status_change, remediation, evidence_added
    notes         TEXT,
    details       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON incident_timeline(incident_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Remediation actions (issued to agents, or manual/organizational actions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS remediation_actions (
    id              SERIAL PRIMARY KEY,
    asset_id        INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    incident_id     INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
    alert_id        INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
    action_type     VARCHAR(50) NOT NULL
                       CHECK (action_type IN (
                         'isolate_host', 'unisolate_host', 'kill_process',
                         'block_ip', 'quarantine_file', 'disable_local_user',
                         'collect_triage_package', 'run_av_scan'
                       )),
    params          JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'completed', 'failed', 'cancelled')),
    requested_by    INTEGER REFERENCES soc_users(id),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    result          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_remediation_asset_status ON remediation_actions(asset_id, status);

-- ---------------------------------------------------------------------------
-- Threat intelligence: indicators of compromise
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threat_intel_iocs (
    id            SERIAL PRIMARY KEY,
    ioc_type      VARCHAR(20) NOT NULL
                     CHECK (ioc_type IN ('ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256')),
    value         VARCHAR(500) NOT NULL,
    source        VARCHAR(255) NOT NULL DEFAULT 'manual',
    severity      VARCHAR(20) NOT NULL DEFAULT 'medium'
                     CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    description   TEXT,
    tags          TEXT[] NOT NULL DEFAULT '{}',
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ioc_type, value)
);

CREATE INDEX IF NOT EXISTS idx_iocs_value ON threat_intel_iocs(value);
CREATE INDEX IF NOT EXISTS idx_iocs_active ON threat_intel_iocs(active);

CREATE TABLE IF NOT EXISTS ioc_matches (
    id            BIGSERIAL PRIMARY KEY,
    ioc_id        INTEGER NOT NULL REFERENCES threat_intel_iocs(id) ON DELETE CASCADE,
    event_id      BIGINT REFERENCES events(id) ON DELETE CASCADE,
    asset_id      INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    alert_id      INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
    matched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ioc_matches_ioc ON ioc_matches(ioc_id);

-- ---------------------------------------------------------------------------
-- Generated reports (incident, compliance, executive)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soc_reports (
    id              SERIAL PRIMARY KEY,
    report_type     VARCHAR(30) NOT NULL
                       CHECK (report_type IN ('incident', 'compliance', 'executive_summary')),
    framework       VARCHAR(50),          -- NIST_CSF, NIST_800_61, CIS, ACPO, GHANA_CSA
    incident_id     INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    generated_by    INTEGER REFERENCES soc_users(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    file_path       VARCHAR(500) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Audit log (who did what, across the SOC module)
--
-- Named soc_audit_log (not audit_log) because this schema is designed to
-- share a database with an existing CFEMS installation, which already owns
-- an unrelated `audit_log` table for its own forensic chain-of-custody
-- actions (see chain_of_custody, evidence, case_file, analyst, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soc_audit_log (
    id            BIGSERIAL PRIMARY KEY,
    actor         VARCHAR(255) NOT NULL,
    action        VARCHAR(150) NOT NULL,
    target_type   VARCHAR(50),
    target_id     VARCHAR(50),
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soc_audit_log_occurred_at ON soc_audit_log(occurred_at DESC);
