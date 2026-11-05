-- =============================================================================
-- BORNTOWIN5 (B5) — Migration 0004: Seniority Block & Unblock Audit
-- Tracks all Seniority Block, Unblock and Undo-Block actions across Levels 1–7
-- =============================================================================

CREATE TABLE IF NOT EXISTS seniority_block_audit (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  original_position INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'BLOCK', 'UNBLOCK', 'UNDO_BLOCK'
  reason TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  unblock_reason TEXT,
  payment_ref TEXT,
  approved_by_admin_id TEXT,
  approved_timestamp TEXT,
  new_position INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seniority_block_audit_member_level ON seniority_block_audit(member_id, level);
CREATE INDEX IF NOT EXISTS idx_seniority_block_audit_level_time ON seniority_block_audit(level, timestamp DESC);
