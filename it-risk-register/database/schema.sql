-- IT Risk Register schema

CREATE TABLE IF NOT EXISTS assets (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    asset_type       TEXT NOT NULL CHECK (asset_type IN ('physical', 'software')),
    category         TEXT NOT NULL,   -- physical: server/laptop/network-device/storage/other
                                       -- software: application/database/os/cloud-service/other
    owner            TEXT,
    department       TEXT,
    criticality      SMALLINT NOT NULL DEFAULT 3 CHECK (criticality BETWEEN 1 AND 5),  -- business impact if lost/compromised
    internet_facing  BOOLEAN NOT NULL DEFAULT FALSE,

    -- physical asset fields
    location         TEXT,
    ip_address       INET,
    serial_number    TEXT,

    -- software/logical asset fields
    vendor           TEXT,
    product          TEXT,
    version          TEXT,

    install_date     DATE,
    end_of_life_date DATE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (asset_type);

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id           SERIAL PRIMARY KEY,
    cve_id       TEXT UNIQUE,           -- NULL for scanner findings without a CVE (e.g. misconfig)
    title        TEXT NOT NULL,
    description  TEXT,
    cvss_score   NUMERIC(3,1),
    cvss_severity TEXT,                 -- LOW/MEDIUM/HIGH/CRITICAL
    published_date TIMESTAMPTZ,
    source       TEXT NOT NULL DEFAULT 'nvd',   -- 'nvd' or a scanner name
    raw_json     JSONB
);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_cvss ON vulnerabilities (cvss_score);

CREATE TABLE IF NOT EXISTS asset_vulnerabilities (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    vulnerability_id INTEGER NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigated', 'accepted', 'false_positive')),
    first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (asset_id, vulnerability_id)
);
CREATE INDEX IF NOT EXISTS idx_asset_vulns_asset ON asset_vulnerabilities (asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_vulns_status ON asset_vulnerabilities (status);

-- One row per scoring run per asset; dashboard shows the latest per asset.
CREATE TABLE IF NOT EXISTS risk_assessments (
    id              BIGSERIAL PRIMARY KEY,
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
    likelihood      NUMERIC(3,1) NOT NULL,   -- 1-5
    impact          NUMERIC(3,1) NOT NULL,   -- 1-5 (== criticality at scoring time)
    max_cvss        NUMERIC(3,1),            -- highest CVSS among this asset's open vulns, if any
    open_vuln_count INTEGER NOT NULL DEFAULT 0,
    risk_score      NUMERIC(4,1) NOT NULL,   -- likelihood * impact, 1-25
    risk_band       TEXT NOT NULL CHECK (risk_band IN ('low', 'medium', 'high', 'critical')),
    rationale       TEXT
);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_asset_ts ON risk_assessments (asset_id, ts DESC);

CREATE TABLE IF NOT EXISTS recommendations (
    id                 BIGSERIAL PRIMARY KEY,
    asset_id           INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    risk_assessment_id BIGINT REFERENCES risk_assessments(id) ON DELETE SET NULL,
    ts                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    category           TEXT NOT NULL,   -- patch / config / compensating-control / replace / ownership / accept
    priority           TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    recommendation     TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
    UNIQUE (asset_id, category, recommendation)
);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations (status);

CREATE TABLE IF NOT EXISTS scanner_imports (
    id             BIGSERIAL PRIMARY KEY,
    ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
    source         TEXT NOT NULL,
    filename       TEXT,
    matched_count  INTEGER NOT NULL DEFAULT 0,
    unmatched_count INTEGER NOT NULL DEFAULT 0
);
