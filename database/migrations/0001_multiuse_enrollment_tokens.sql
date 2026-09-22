-- Migration 0001: multi-use enrollment tokens + soc_audit_log rename
--
-- Run this against a database that already has the SOC schema applied from
-- before enrollment tokens supported max_uses/use_count, or before the
-- audit_log -> soc_audit_log rename (to avoid colliding with an existing
-- CFEMS audit_log table). Safe to run more than once.
--
--   psql -U postgres -d cfems -f database/migrations/0001_multiuse_enrollment_tokens.sql

-- --- enrollment_tokens: add multi-use support -------------------------
ALTER TABLE enrollment_tokens ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE enrollment_tokens ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollment_tokens ADD COLUMN IF NOT EXISTS label VARCHAR(255);

-- Backfill existing rows to their old single-use semantics.
UPDATE enrollment_tokens SET max_uses = 1 WHERE max_uses IS NULL AND used_at IS NULL;
UPDATE enrollment_tokens SET max_uses = 1, use_count = 1 WHERE used_at IS NOT NULL AND use_count = 0;

CREATE TABLE IF NOT EXISTS enrollment_token_uses (
    id            BIGSERIAL PRIMARY KEY,
    token_id      INTEGER NOT NULL REFERENCES enrollment_tokens(id) ON DELETE CASCADE,
    asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    used_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrollment_token_uses_token ON enrollment_token_uses(token_id);

-- Backfill the audit trail for tokens that were already used before this
-- table existed.
INSERT INTO enrollment_token_uses (token_id, asset_id, used_at)
SELECT et.id, et.used_by_asset, et.used_at
FROM enrollment_tokens et
WHERE et.used_by_asset IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM enrollment_token_uses u WHERE u.token_id = et.id
  );

-- --- audit_log -> soc_audit_log (skip if already renamed) -------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'audit_log' AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'soc_audit_log' AND table_schema = 'public'
    ) THEN
        -- Only rename if this audit_log looks like ours (our columns),
        -- never an unrelated pre-existing CFEMS audit_log table.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'audit_log' AND column_name = 'occurred_at'
        ) THEN
            ALTER TABLE audit_log RENAME TO soc_audit_log;
            ALTER INDEX IF EXISTS idx_audit_log_occurred_at RENAME TO idx_soc_audit_log_occurred_at;
        END IF;
    END IF;
END $$;

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
