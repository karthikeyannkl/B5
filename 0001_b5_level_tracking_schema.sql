-- =============================================================================
-- BORNTOWIN5 (B5) — Cloudflare D1 Database Schema Migration
-- Database Name : b5-level-tracking
-- Binding Name  : DB (accessed via env.DB in Cloudflare Workers)
-- Migration     : 0001_b5_level_tracking_schema.sql
--
-- Safety & Non-Destructive Guarantee:
-- 1. Uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS so applying
--    this migration is idempotent and never drops or resets existing records.
-- 2. Keeps the database empty initially apart from default payment account
--    structure (system_settings.payment_settings).
-- 3. Does NOT hardcode public admin credentials and does NOT seed dummy users.
--    First-time admin setup is completed via POST /api/admin/bootstrap or the
--    B5_ADMIN_PASSWORD Cloudflare Worker secret.
-- =============================================================================

-- 1. System Configuration & Payment Settings (Admin A/B/C rotation & Trust)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Members Directory & Profile/Bank Lock State
CREATE TABLE IF NOT EXISTS members (
  member_id TEXT PRIMARY KEY,
  referral_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  mobile TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  referral TEXT NOT NULL DEFAULT 'FIRST MEMBER',
  level INTEGER NOT NULL DEFAULT 1,
  level_member_id TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  joined_at TEXT,
  registered_at TEXT NOT NULL,
  upgrade_date TEXT,
  level_reached_at_json TEXT NOT NULL DEFAULT '{}',
  account_holder TEXT NOT NULL DEFAULT '',
  bank TEXT NOT NULL DEFAULT '',
  account TEXT NOT NULL DEFAULT '',
  ifsc TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  upi TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  profile_locked INTEGER NOT NULL DEFAULT 0,
  payment_access_locked INTEGER NOT NULL DEFAULT 0,
  payment_review_status TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  seniority_test_order INTEGER,
  extra_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_members_referral ON members(referral);
CREATE INDEX IF NOT EXISTS idx_members_mobile ON members(mobile);
CREATE INDEX IF NOT EXISTS idx_members_level ON members(level);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- 3. Joining PIN Wallet
CREATE TABLE IF NOT EXISTS pins (
  pin TEXT PRIMARY KEY,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  used_by TEXT,
  created_at TEXT NOT NULL,
  used_at TEXT,
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pins_assigned_status ON pins(assigned_to, status);

-- 4. Member & Admin Portal Messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'MAIN',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient, created_at DESC);

-- 5. Password Reset Requests
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  mobile TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  temporary_password TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_member_status ON password_reset_requests(member_id, status);

-- 6. LevelTrack Upgrade & Additional Referral Upgrade Requests
CREATE TABLE IF NOT EXISTS leveltrack_requests (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  seniority_level INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'LEVEL_UPGRADE',
  cycle INTEGER,
  status TEXT NOT NULL,
  upgrade_id TEXT,
  reserved_receiver_id TEXT,
  reserved_position INTEGER,
  reserved_at TEXT,
  assigned_at TEXT,
  completed_at TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  payee TEXT,
  payee_id TEXT,
  payee_phone TEXT,
  account_holder TEXT,
  bank TEXT,
  account TEXT,
  ifsc TEXT,
  branch TEXT,
  upi TEXT,
  amount INTEGER,
  payment_parts_json TEXT,
  assigned_admin_account_json TEXT,
  req_date TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lt_requests_member ON leveltrack_requests(member_id, status);
CREATE INDEX IF NOT EXISTS idx_lt_requests_reserved_receiver ON leveltrack_requests(reserved_receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_lt_requests_seniority ON leveltrack_requests(seniority_level, status);

-- 7. LevelTrack Upgrades
CREATE TABLE IF NOT EXISTS leveltrack_upgrades (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  seniority_level INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'LEVEL_UPGRADE',
  amount INTEGER NOT NULL DEFAULT 0,
  payee TEXT,
  payee_id TEXT,
  payee_phone TEXT,
  account_holder TEXT,
  bank TEXT,
  account TEXT,
  ifsc TEXT,
  branch TEXT,
  upi TEXT,
  payment_parts_json TEXT,
  details_sent INTEGER NOT NULL DEFAULT 0,
  details_sent_at TEXT,
  member_paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  utr TEXT,
  receiver_approved INTEGER NOT NULL DEFAULT 0,
  admin_approved INTEGER NOT NULL DEFAULT 0,
  payment_access_locked INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lt_upgrades_request ON leveltrack_upgrades(request_id);
CREATE INDEX IF NOT EXISTS idx_lt_upgrades_member ON leveltrack_upgrades(member_id);

-- 8. LevelTrack Payments (Persistent Receiver & Admin Payment Ledger)
CREATE TABLE IF NOT EXISTS leveltrack_payments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  upgrade_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'LEVEL_UPGRADE',
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  seniority_level INTEGER NOT NULL,
  from_member_id TEXT NOT NULL,
  receiver_member_id TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  from_name TEXT,
  to_name TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  utr TEXT,
  screenshot TEXT,
  proof_ref TEXT,
  parts_json TEXT NOT NULL DEFAULT '[]',
  member_paid INTEGER NOT NULL DEFAULT 0,
  member_accepted INTEGER NOT NULL DEFAULT 0,
  accepted_at TEXT,
  admin_approved INTEGER NOT NULL DEFAULT 0,
  admin_verified_at TEXT,
  rejected INTEGER NOT NULL DEFAULT 0,
  rejected_at TEXT,
  rejection_reason TEXT,
  slot_released INTEGER NOT NULL DEFAULT 0,
  payment_access_locked INTEGER NOT NULL DEFAULT 0,
  superseded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  submitted_at TEXT,
  details_sent_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lt_payments_upgrade ON leveltrack_payments(upgrade_id);
CREATE INDEX IF NOT EXISTS idx_lt_payments_receiver ON leveltrack_payments(receiver_member_id, status);
CREATE INDEX IF NOT EXISTS idx_lt_payments_sender ON leveltrack_payments(from_member_id);
CREATE INDEX IF NOT EXISTS idx_lt_payments_request ON leveltrack_payments(request_id);

-- 9. Durable Payment Proof Images in D1 (Survives Worker restarts/redeploys)
CREATE TABLE IF NOT EXISTS payment_proofs (
  payment_id TEXT NOT NULL,
  part_type TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  data_uri TEXT NOT NULL,
  utr TEXT,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (payment_id, part_type)
);

-- 10. Email Notification Audit & Deduplication Logs
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_key TEXT UNIQUE NOT NULL,
  recipient_email TEXT,
  recipient_id TEXT,
  subject TEXT,
  body_preview TEXT,
  event_generated INTEGER NOT NULL DEFAULT 1,
  live_delivered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);

-- =============================================================================
-- Initial System Configuration ONLY (No Hardcoded Public Credentials, Zero Dummy Users)
-- =============================================================================
INSERT OR IGNORE INTO system_settings (key, value_json, updated_at)
VALUES (
  'payment_settings',
  '{"admins":[{"id":"A","name":"Admin A","accountHolder":"","bank":"","account":"","ifsc":"","upi":"","active":true},{"id":"B","name":"Admin B","accountHolder":"","bank":"","account":"","ifsc":"","upi":"","active":true},{"id":"C","name":"Admin C","accountHolder":"","bank":"","account":"","ifsc":"","upi":"","active":true}],"adminRotationIndex":0,"adminRotationByLevel":{"4":0,"5":0,"6":0,"7":0},"trust":{"name":"Registered Trust","accountHolder":"","bank":"","account":"TEMP-TRUST-001","ifsc":"","upi":"","active":true}}',
  '2026-10-24T00:00:00.000Z'
);
