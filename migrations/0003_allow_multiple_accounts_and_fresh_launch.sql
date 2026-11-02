PRAGMA foreign_keys = OFF;

-- =============================================================================
-- BORNTOWIN5 (B5) — Database Migration 0003
-- Purpose:
-- 1. Migrate `members` table to allow approved multiple accounts sharing mobile numbers
--    (Removes global UNIQUE on mobile, preserves referral/mobile/level/status indexes).
-- 2. Complete Fresh Launch Reset:
--    - Cleans all previous testing members, dummy records, requests, upgrades, payments, proofs.
--    - Seeds exactly 1 Company ID (BORN TO WIN) and the 15 approved initial Member IDs.
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
  'pbkdf2$sha256$100000$b96585aaf8639c0f4d250d729d000600$5c44bc885eb190e66a3a395739b3bd6fa0e5f5557f22888748a3aac3ff05b46e',
  1, NULL,
  '{"isCompanyAccount":true,"excludeFromSeniorityQueue":true,"b5Id":0,"aliases":["COMPANY","BORN TO WIN","B5-000","0"]}'
);

-- Step 5: Provision the 15 Initial B5 Member Accounts
-- 1. SATHYA (B5 ID 1)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-001', 'REF-001', 'SATHYA', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-001', 'Verified', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z', NULL, '{"1":"2026-01-01T00:00:01.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$81c5933abc9995f6f3e534bc80f9f511$124b7f267e057dcc54476493db305d1b498680e30d07f7ab9a3a1bd59f3cd4b0',
  1, NULL,
  '{"b5Id":1,"numericId":1,"initialSeniority":{"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1},"aliases":["1","B5-1","B5-001","REF-001"]}'
);

-- 2. ELANGO (B5 ID 2)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-002', 'REF-002', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-002', 'Verified', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:02.000Z', NULL, '{"1":"2026-01-01T00:00:02.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$4c74c0cbf1b240239fd4af34abc57886$ac520275132963e462faab978ff4c7529eb48213cf30ca6e29c7b7accea18821',
  1, NULL,
  '{"b5Id":2,"numericId":2,"initialSeniority":{"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2},"aliases":["2","B5-2","B5-002","REF-002"]}'
);

-- 3. KARTHIKEYAN (B5 ID 3)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-003', 'REF-003', 'KARTHIKEYAN', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-003', 'Verified', '2026-01-01T00:00:03.000Z', '2026-01-01T00:00:03.000Z', NULL, '{"1":"2026-01-01T00:00:03.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$20e0abf178f088e42e24106e65233857$2d5b9b35c0e6dad2b19e7828347e9e759e7844f21c00afb033364f9c5e5ade75',
  1, NULL,
  '{"b5Id":3,"numericId":3,"initialSeniority":{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3},"aliases":["3","B5-3","B5-003","REF-003"]}'
);

-- 4. ELANGO (B5 ID 4)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-004', 'REF-004', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-004', 'Verified', '2026-01-01T00:00:04.000Z', '2026-01-01T00:00:04.000Z', NULL, '{"1":"2026-01-01T00:00:04.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$3189bbba9d8a591b2c3389d634abfa67$e721c9267a9b3708ea6fcef8db092c45509c541a9eee18a539fa6549fd358c44',
  1, NULL,
  '{"b5Id":4,"numericId":4,"initialSeniority":{"1":4,"2":4,"3":4,"4":4,"5":4,"6":4,"7":4},"aliases":["4","B5-4","B5-004","REF-004"]}'
);

-- 5. RK (B5 ID 5)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-005', 'REF-005', 'RK', '', '9345151709', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-005', 'Verified', '2026-01-01T00:00:05.000Z', '2026-01-01T00:00:05.000Z', NULL, '{"1":"2026-01-01T00:00:05.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$8dff331368eeeab5d2de03fd8cd30419$2dbf1070edfc258200c0184531e3bb5ba301781a061ced5998c43c1b447e9748',
  1, NULL,
  '{"b5Id":5,"numericId":5,"initialSeniority":{"1":5,"2":5,"3":5,"4":5,"5":5,"6":5,"7":5},"aliases":["5","B5-5","B5-005","REF-005"]}'
);

-- 6. SATHYA (B5 ID 6)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-006', 'REF-006', 'SATHYA', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-006', 'Verified', '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:06.000Z', NULL, '{"1":"2026-01-01T00:00:06.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$2757ce025719fd343a379101d2178363$78f0660ec22434a4a017a88ff5ef8e32c1818a6b92f6b2ea2c5d114b6f8d571c',
  1, NULL,
  '{"b5Id":6,"numericId":6,"initialSeniority":{"1":6,"2":6,"3":6,"4":6,"5":6,"6":6,"7":6},"aliases":["6","B5-6","B5-006","REF-006"]}'
);

-- 7. ELANGO (B5 ID 7)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-007', 'REF-007', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-007', 'Verified', '2026-01-01T00:00:07.000Z', '2026-01-01T00:00:07.000Z', NULL, '{"1":"2026-01-01T00:00:07.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$e03c2d63236acb487840fbd74f5b7323$13ba8f7ad3e1e3943aeade683b0ddb077a51bb3a1566e92aad9f1891ce03e920',
  1, NULL,
  '{"b5Id":7,"numericId":7,"initialSeniority":{"1":7,"2":7,"3":7,"4":7,"5":7,"6":7,"7":7},"aliases":["7","B5-7","B5-007","REF-007"]}'
);

-- 8. KARTHIKEYAN (B5 ID 8)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-008', 'REF-008', 'KARTHIKEYAN', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-008', 'Verified', '2026-01-01T00:00:08.000Z', '2026-01-01T00:00:08.000Z', NULL, '{"1":"2026-01-01T00:00:08.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$a6b959ed1b22e3aeeb61bde74c9d11aa$799d1b6b0ec87d8484ef697927523732861dc387b13fce504e831ce49fefa8ae',
  1, NULL,
  '{"b5Id":8,"numericId":8,"initialSeniority":{"1":8,"2":8,"3":8,"4":8,"5":8,"6":8,"7":8},"aliases":["8","B5-8","B5-008","REF-008"]}'
);

-- 9. ELANGO (B5 ID 9)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-009', 'REF-009', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-009', 'Verified', '2026-01-01T00:00:09.000Z', '2026-01-01T00:00:09.000Z', NULL, '{"1":"2026-01-01T00:00:09.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$62d5788abf8574f6bef89f0ca9f9ea88$a3673418543aa19d236a1d69d460139fc8b74a381df3e2d4d6cb065d1aabe84c',
  1, NULL,
  '{"b5Id":9,"numericId":9,"initialSeniority":{"1":9,"2":9,"3":9,"4":9,"5":9,"6":9,"7":9},"aliases":["9","B5-9","B5-009","REF-009"]}'
);

-- 10. RK (B5 ID 10)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-010', 'REF-010', 'RK', '', '9345151709', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-010', 'Verified', '2026-01-01T00:00:10.000Z', '2026-01-01T00:00:10.000Z', NULL, '{"1":"2026-01-01T00:00:10.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$0ba022dfc5a08bd6169673f3c6ecfa6c$0fd8b3e50b3fa76726a1ccfd73ff4e95783c7498b9ef2b73121ec04d7857dc4a',
  1, NULL,
  '{"b5Id":10,"numericId":10,"initialSeniority":{"1":10,"2":10,"3":10,"4":10,"5":10,"6":10,"7":10},"aliases":["10","B5-10","B5-010","REF-010"]}'
);

-- 11. SATHYA (B5 ID 11)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-011', 'REF-011', 'SATHYA', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-011', 'Verified', '2026-01-01T00:00:11.000Z', '2026-01-01T00:00:11.000Z', NULL, '{"1":"2026-01-01T00:00:11.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$e8f0517379afdca9f012f877833da45a$7c8bea49852daa0f529504c5bd736f254af6baac956a1e13888733d12b0443c0',
  1, NULL,
  '{"b5Id":11,"numericId":11,"initialSeniority":{"1":11,"2":11,"3":11,"4":11,"5":11,"6":11,"7":11},"aliases":["11","B5-11","B5-011","REF-011"]}'
);

-- 12. ELANGO (B5 ID 12)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-012', 'REF-012', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-012', 'Verified', '2026-01-01T00:00:12.000Z', '2026-01-01T00:00:12.000Z', NULL, '{"1":"2026-01-01T00:00:12.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$8db97e376669685f5a0fcf8217ab3beb$5357ac09810ed78a99bc688662d584cafa2a140f007a0e5e43d25b9712b9ceb1',
  1, NULL,
  '{"b5Id":12,"numericId":12,"initialSeniority":{"1":12,"2":12,"3":12,"4":12,"5":12,"6":12,"7":12},"aliases":["12","B5-12","B5-012","REF-012"]}'
);

-- 13. KARTHIKEYAN (B5 ID 13)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-013', 'REF-013', 'KARTHIKEYAN', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-013', 'Verified', '2026-01-01T00:00:13.000Z', '2026-01-01T00:00:13.000Z', NULL, '{"1":"2026-01-01T00:00:13.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$32793e5cb588fa0b8db0d9e59cde8ed5$e6c3952e6535723d46537981757f451f0b8c1944be0637e744b59d1b75e617e1',
  1, NULL,
  '{"b5Id":13,"numericId":13,"initialSeniority":{"1":13,"2":13,"3":13,"4":13,"5":13,"6":13,"7":13},"aliases":["13","B5-13","B5-013","REF-013"]}'
);

-- 14. ELANGO (B5 ID 14)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-014', 'REF-014', 'ELANGO', '', '7867014621', 'kalaikalaielango@gmail.com', 'B5-COMPANY',
  1, 'L1-014', 'Verified', '2026-01-01T00:00:14.000Z', '2026-01-01T00:00:14.000Z', NULL, '{"1":"2026-01-01T00:00:14.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$13998cc86631255ca973920a30765a7c$b8cff6e6ee81fa2c17d46eea9b50855f16f4fdd591bc992aa794b9ad554a5c2d',
  1, NULL,
  '{"b5Id":14,"numericId":14,"initialSeniority":{"1":14,"2":14,"3":14,"4":14,"5":14,"6":14,"7":14},"aliases":["14","B5-14","B5-014","REF-014"]}'
);

-- 15. RK (B5 ID 15)
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-015', 'REF-015', 'RK', '', '9345151709', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-015', 'Verified', '2026-01-01T00:00:15.000Z', '2026-01-01T00:00:15.000Z', NULL, '{"1":"2026-01-01T00:00:15.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$73ab75d6084c69ac42889cc85c8c231b$32fb9f282fa5b505d395edf8484e4466dece16e97b092ac372c55f25d3116e14',
  1, NULL,
  '{"b5Id":15,"numericId":15,"initialSeniority":{"1":15,"2":15,"3":15,"4":15,"5":15,"6":15,"7":15},"aliases":["15","B5-15","B5-015","REF-015"]}'
);

PRAGMA foreign_keys = ON;
