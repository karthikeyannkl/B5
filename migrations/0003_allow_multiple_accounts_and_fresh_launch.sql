PRAGMA foreign_keys = OFF;

-- =============================================================================
-- BORNTOWIN5 (B5) — Database Migration 0003
-- Purpose:
-- 1. Migrate `members` table to allow approved multiple accounts sharing mobile numbers
--    (Removes global UNIQUE on mobile, preserves referral/mobile/level/status indexes).
-- 2. Complete Fresh Launch Reset:
--    - Cleans all previous testing members, dummy records, requests, upgrades, payments, proofs.
--    - Seeds exactly 1 Company ID (BORN TO WIN: B5-COMPANY) and the 15 approved initial Member IDs.
--    - Format: Mandatory B5-XXXXX (B5- plus exactly 5 random numeric digits).
--    - Sets up Level 1 to Level 7 seniority positions 1 to 15.
--    - Leaves bank details blank for Admin to configure later.
--    - Ensures future qualifying upgrades receive Seniority 16+.
-- =============================================================================

-- Step 1: Create new members table without UNIQUE on mobile
CREATE TABLE IF NOT EXISTS members_new (
  member_id TEXT PRIMARY KEY,
  referral_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL,
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

-- Drop old members table and replace with members_new
DROP TABLE IF EXISTS members;
ALTER TABLE members_new RENAME TO members;

-- Recreate performance indexes
CREATE INDEX IF NOT EXISTS idx_members_referral ON members(referral);
CREATE INDEX IF NOT EXISTS idx_members_mobile ON members(mobile);
CREATE INDEX IF NOT EXISTS idx_members_level ON members(level);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- Ensure push_subscriptions table exists before cleaning
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  owner_role TEXT NOT NULL CHECK(owner_role IN ('member','admin')),
  member_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Step 2: Clean all operational testing records & reset rotation counters
DELETE FROM payment_proofs;
DELETE FROM leveltrack_payments;
DELETE FROM leveltrack_upgrades;
DELETE FROM leveltrack_requests;
DELETE FROM password_reset_requests;
DELETE FROM messages;
DELETE FROM email_logs;
DELETE FROM push_subscriptions;
DELETE FROM pins;

-- Reset payment settings rotation counters & trust
DELETE FROM system_settings WHERE key = 'payment_settings';
INSERT INTO system_settings (key, value_json, updated_at)
VALUES (
  'payment_settings',
  '{"admins":[{"id":"A","name":"Admin A","accountHolder":"","bank":"","account":"","ifsc":"","upi":"","active":true},{"id":"B","name":"Admin B","accountHolder":"","bank":"","account":"","ifsc":"","upi":"","active":true},{"id":"C","name":"Admin C","accountHolder":"","bank":"","account":"","ifsc":"","upi":"","active":true}],"adminRotationIndex":0,"adminRotationByLevel":{"4":0,"5":0,"6":0,"7":0},"trust":{"name":"BORNTOWIN5 Registered Trust","accountHolder":"","bank":"","account":"TEMP-TRUST-001","ifsc":"","upi":"","active":true}}',
  '2026-11-01T00:00:00.000Z'
);

-- Step 3: Insert initial joining PIN
INSERT OR IGNORE INTO pins (pin, assigned_to, status, used_by, created_at, used_at, is_system)
VALUES ('PIN-START1', NULL, 'AVAILABLE', NULL, '2026-11-01T00:00:00.000Z', NULL, 1);

-- Step 4: Provision exactly 1 Company ID (BORN TO WIN)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-COMPANY',
  'REF-COMPANY',
  'BORN TO WIN',
  'Headquarters',
  '9345151709',
  'notifications@borntowin5.com',
  'FIRST MEMBER',
  7,
  'L7-ROOT',
  'Verified',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z',
  '{"1":"2026-01-01T00:00:00.000Z","2":"2026-01-01T00:00:00.000Z","3":"2026-01-01T00:00:00.000Z","4":"2026-01-01T00:00:00.000Z","5":"2026-01-01T00:00:00.000Z","6":"2026-01-01T00:00:00.000Z","7":"2026-01-01T00:00:00.000Z"}',
  '', '', '', '', '', '',
  '', 0, 0, '',
  'pbkdf2$sha256$100000$5b35946ac68d0c561628854c6aeb121d$212f8e7c83c1393a457969858a41614778b395137a3d6341703ca412f1475e22',
  1, NULL,
  '{"isCompanyAccount":true,"excludeFromSeniorityQueue":true,"b5Id":0,"aliases":["COMPANY","BORN TO WIN","0","REF-COMPANY"]}'
);

-- Step 5: Provision the 15 Initial B5 Member Accounts (Format: B5-XXXXX)
-- 1. SATHYA (B5-64847)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-64847', 'REF-64847', 'SATHYA', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-001', 'Verified', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z', NULL, '{"1":"2026-01-01T00:00:01.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$395b46be3cec6155f40c91129475990e$5dc1311a8c9ee0e072ad047db84f945759120f59dd4ac11ea17de177888a7d02',
  1, NULL,
  '{"b5Id":1,"numericId":1,"initialSeniority":{"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1},"aliases":["1","B5-64847","REF-64847"]}'
);

-- 2. ELANGO (B5-39246)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-39246', 'REF-39246', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-002', 'Verified', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:02.000Z', NULL, '{"1":"2026-01-01T00:00:02.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$ca8ce86169c144216a11cf25a6d9bf08$b97bdb956f897e95b9ade6f6f64a977417b9bd99e718dd56593cd2c1c26e5f7d',
  1, NULL,
  '{"b5Id":2,"numericId":2,"initialSeniority":{"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2},"aliases":["2","B5-39246","REF-39246"]}'
);

-- 3. KARTHIKEYAN (B5-88384)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-88384', 'REF-88384', 'KARTHIKEYAN', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-003', 'Verified', '2026-01-01T00:00:03.000Z', '2026-01-01T00:00:03.000Z', NULL, '{"1":"2026-01-01T00:00:03.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$edc970751a40f3b04c384e0ffb83a9bf$13e53bbd731fc1b13bddff241871b6437d7c0202deb8ab3ad8cbddfe6a95560c',
  1, NULL,
  '{"b5Id":3,"numericId":3,"initialSeniority":{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3},"aliases":["3","B5-88384","REF-88384"]}'
);

-- 4. ELANGO (B5-12971)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-12971', 'REF-12971', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-004', 'Verified', '2026-01-01T00:00:04.000Z', '2026-01-01T00:00:04.000Z', NULL, '{"1":"2026-01-01T00:00:04.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$6cc139933248297fb1a103978e1534d8$768bb73c25f415db558e70896b1baf6ef6312aa0afc850853650a091e91f9311',
  1, NULL,
  '{"b5Id":4,"numericId":4,"initialSeniority":{"1":4,"2":4,"3":4,"4":4,"5":4,"6":4,"7":4},"aliases":["4","B5-12971","REF-12971"]}'
);

-- 5. RK (B5-90143)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-90143', 'REF-90143', 'RK', '', '9345151709', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-005', 'Verified', '2026-01-01T00:00:05.000Z', '2026-01-01T00:00:05.000Z', NULL, '{"1":"2026-01-01T00:00:05.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$c9be03c2e34d108c208d46ee3ca2b7a0$216c534a7f6ee213cff0437f9d3a2204955cff6c9d4d14b5808f5a7d661fee18',
  1, NULL,
  '{"b5Id":5,"numericId":5,"initialSeniority":{"1":5,"2":5,"3":5,"4":5,"5":5,"6":5,"7":5},"aliases":["5","B5-90143","REF-90143"]}'
);

-- 6. SATHYA (B5-54017)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-54017', 'REF-54017', 'SATHYA', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-006', 'Verified', '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:06.000Z', NULL, '{"1":"2026-01-01T00:00:06.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$ba5246f7a52ad067d374193030eece46$974361ac0c86e5e7d72ca205eccc5efda21ff1315d38775ee4483c7f6128b221',
  1, NULL,
  '{"b5Id":6,"numericId":6,"initialSeniority":{"1":6,"2":6,"3":6,"4":6,"5":6,"6":6,"7":6},"aliases":["6","B5-54017","REF-54017"]}'
);

-- 7. ELANGO (B5-96920)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-96920', 'REF-96920', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-007', 'Verified', '2026-01-01T00:00:07.000Z', '2026-01-01T00:00:07.000Z', NULL, '{"1":"2026-01-01T00:00:07.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$06d273aedf4c6f2c4a8865c83b901bce$3ceb83129dcb56aacab60b46a6eea6d4a00f505638ec6d0fbc597a651ec88dd8',
  1, NULL,
  '{"b5Id":7,"numericId":7,"initialSeniority":{"1":7,"2":7,"3":7,"4":7,"5":7,"6":7,"7":7},"aliases":["7","B5-96920","REF-96920"]}'
);

-- 8. KARTHIKEYAN (B5-37039)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-37039', 'REF-37039', 'KARTHIKEYAN', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-008', 'Verified', '2026-01-01T00:00:08.000Z', '2026-01-01T00:00:08.000Z', NULL, '{"1":"2026-01-01T00:00:08.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$09ab53f0c88e8b49201d8099b703c35d$802b084deda8e72909af9d6d4afff220a7dbd2ed0f19f612b82243f5522139ab',
  1, NULL,
  '{"b5Id":8,"numericId":8,"initialSeniority":{"1":8,"2":8,"3":8,"4":8,"5":8,"6":8,"7":8},"aliases":["8","B5-37039","REF-37039"]}'
);

-- 9. ELANGO (B5-17004)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-17004', 'REF-17004', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-009', 'Verified', '2026-01-01T00:00:09.000Z', '2026-01-01T00:00:09.000Z', NULL, '{"1":"2026-01-01T00:00:09.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$004e62af8f7462471babd6d18c1314ff$2293a107353eeb4b6de79dd91abab793b305f384cd86079185c672f9df33e5c6',
  1, NULL,
  '{"b5Id":9,"numericId":9,"initialSeniority":{"1":9,"2":9,"3":9,"4":9,"5":9,"6":9,"7":9},"aliases":["9","B5-17004","REF-17004"]}'
);

-- 10. RK (B5-35655)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-35655', 'REF-35655', 'RK', '', '9345151709', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-010', 'Verified', '2026-01-01T00:00:10.000Z', '2026-01-01T00:00:10.000Z', NULL, '{"1":"2026-01-01T00:00:10.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$2a78d0e19b96910527535bb42c2a2f1a$e7074afbee022955fee7abf23d08a16cb5580e5af6376d4106449195bcef8c69',
  1, NULL,
  '{"b5Id":10,"numericId":10,"initialSeniority":{"1":10,"2":10,"3":10,"4":10,"5":10,"6":10,"7":10},"aliases":["10","B5-35655","REF-35655"]}'
);

-- 11. SATHYA (B5-71226)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-71226', 'REF-71226', 'SATHYA', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-011', 'Verified', '2026-01-01T00:00:11.000Z', '2026-01-01T00:00:11.000Z', NULL, '{"1":"2026-01-01T00:00:11.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$b24f94fbd1820c23b9b97b6b9cdbf2d1$9f14bb44a811bab43ad8fc890d3db1257e5bf682635635f4bc01a1b5c70b5b81',
  1, NULL,
  '{"b5Id":11,"numericId":11,"initialSeniority":{"1":11,"2":11,"3":11,"4":11,"5":11,"6":11,"7":11},"aliases":["11","B5-71226","REF-71226"]}'
);

-- 12. ELANGO (B5-31508)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-31508', 'REF-31508', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-012', 'Verified', '2026-01-01T00:00:12.000Z', '2026-01-01T00:00:12.000Z', NULL, '{"1":"2026-01-01T00:00:12.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$d80b0e554f84cc7fd81b5ee22a6da884$f1a923820d9528a3bc221d9a1d2db0e456c0cce42951573381eadb2828f12387',
  1, NULL,
  '{"b5Id":12,"numericId":12,"initialSeniority":{"1":12,"2":12,"3":12,"4":12,"5":12,"6":12,"7":12},"aliases":["12","B5-31508","REF-31508"]}'
);

-- 13. KARTHIKEYAN (B5-82715)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-82715', 'REF-82715', 'KARTHIKEYAN', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-013', 'Verified', '2026-01-01T00:00:13.000Z', '2026-01-01T00:00:13.000Z', NULL, '{"1":"2026-01-01T00:00:13.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$b2b5d65a3146d5780e9aa638bc05ff85$d6e0172d02b9e1a1f175b5b8f18a0a2672cdc5f96658856bd7737ed875ee2f40',
  1, NULL,
  '{"b5Id":13,"numericId":13,"initialSeniority":{"1":13,"2":13,"3":13,"4":13,"5":13,"6":13,"7":13},"aliases":["13","B5-82715","REF-82715"]}'
);

-- 14. ELANGO (B5-40331)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-40331', 'REF-40331', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-014', 'Verified', '2026-01-01T00:00:14.000Z', '2026-01-01T00:00:14.000Z', NULL, '{"1":"2026-01-01T00:00:14.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$bc7e6662e5b8f7b2e24382274b0ca80b$6fa81807e22b13199ff8760b7bfd8d15a6a7f496e9fdd1082e5312ed24964c87',
  1, NULL,
  '{"b5Id":14,"numericId":14,"initialSeniority":{"1":14,"2":14,"3":14,"4":14,"5":14,"6":14,"7":14},"aliases":["14","B5-40331","REF-40331"]}'
);

-- 15. RK (B5-75949)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-75949', 'REF-75949', 'RK', '', '9345151709', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-015', 'Verified', '2026-01-01T00:00:15.000Z', '2026-01-01T00:00:15.000Z', NULL, '{"1":"2026-01-01T00:00:15.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$5eefd2ae432907c072c60862da4e95ff$a42333be76e6fcad74d1541789bd0e1b92fc80e220fa5f7d53e272475409798f',
  1, NULL,
  '{"b5Id":15,"numericId":15,"initialSeniority":{"1":15,"2":15,"3":15,"4":15,"5":15,"6":15,"7":15},"aliases":["15","B5-75949","REF-75949"]}'
);

PRAGMA foreign_keys = ON;
