-- =============================================================================
-- BORNTOWIN5 (B5) — Migration 0005: Replace Initial Member List (17 Members)
-- Replaces old initial 15-member list with approved 17-member list (rows 1–17)
-- Total initial accounts: 1 Company ID (B5-COMPANY) + 17 Member IDs = 18 accounts
-- =============================================================================

-- Step 1: Remove old 15 initial member records
DELETE FROM members WHERE member_id IN (
  'B5-64847', 'B5-39246', 'B5-88384', 'B5-12971', 'B5-90143',
  'B5-54017', 'B5-96920', 'B5-37039', 'B5-17004', 'B5-35655',
  'B5-71226', 'B5-31508', 'B5-82715', 'B5-40331', 'B5-75949'
);

-- Step 2: Insert the 17 Approved Initial Members

-- 1. sathya (B5-46188) - 9600680468 - sweetsathya62@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-46188', 'REF-46188', 'sathya', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-001', 'Verified', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z', NULL, '{"1":"2026-01-01T00:00:01.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$15670b1d4267ff8a8c3defa9d9634308$2e554e0d7bcdd41504a43fcb307c843c9178c69de7af854443cb84a01ee1088f',
  1, NULL,
  '{"b5Id":1,"numericId":1,"initialSeniority":{"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1},"aliases":["1","B5-46188","REF-46188"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 2. Karthikeyan (B5-80575) - 9790151709 - dorakarthi51@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-80575', 'REF-80575', 'Karthikeyan', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-002', 'Verified', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:02.000Z', NULL, '{"1":"2026-01-01T00:00:02.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$e193e1e5a8393a00c816a785faf675e0$fa89102c0e98816e90b7188e83d9b99c7af886756f46bd6a6b6286794d3db283',
  1, NULL,
  '{"b5Id":2,"numericId":2,"initialSeniority":{"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2},"aliases":["2","B5-80575","REF-80575"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 3. Rajesh (B5-62065) - 9443248652 - Saravanastudionkl@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-62065', 'REF-62065', 'Rajesh', '', '9443248652', 'Saravanastudionkl@gmail.com', 'B5-COMPANY',
  1, 'L1-003', 'Verified', '2026-01-01T00:00:03.000Z', '2026-01-01T00:00:03.000Z', NULL, '{"1":"2026-01-01T00:00:03.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$75ef8fbafcead1392d706a80971faa9a$8d4b5ca2dded96b3822d55efd9d7f3385092bac0bc9af604990846a493d5fe44',
  1, NULL,
  '{"b5Id":3,"numericId":3,"initialSeniority":{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3},"aliases":["3","B5-62065","REF-62065"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 4. Pranev (B5-84638) - 9345151709 - borntowin5b5@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-84638', 'REF-84638', 'Pranev', '', '9345151709', 'borntowin5b5@gmail.com', 'B5-COMPANY',
  1, 'L1-004', 'Verified', '2026-01-01T00:00:04.000Z', '2026-01-01T00:00:04.000Z', NULL, '{"1":"2026-01-01T00:00:04.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$e7c944829df834444eb3b5176e272282$ccdb40c1630b8903993d08fc25fe7fb65ffc13e51072095b23f838da1f83c1ee',
  1, NULL,
  '{"b5Id":4,"numericId":4,"initialSeniority":{"1":4,"2":4,"3":4,"4":4,"5":4,"6":4,"7":4},"aliases":["4","B5-84638","REF-84638"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 5. Thanya (B5-86831) - 9489730468 - ksp.nkl@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-86831', 'REF-86831', 'Thanya', '', '9489730468', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-005', 'Verified', '2026-01-01T00:00:05.000Z', '2026-01-01T00:00:05.000Z', NULL, '{"1":"2026-01-01T00:00:05.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$a27342c81182bce58cc61d17c8282c95$17907b2acf3e2987baa4e0173fa945bd01929905c059f8171aa9288ea6ed2fb2',
  1, NULL,
  '{"b5Id":5,"numericId":5,"initialSeniority":{"1":5,"2":5,"3":5,"4":5,"5":5,"6":5,"7":5},"aliases":["5","B5-86831","REF-86831"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 6. Karthikeyan (B5-89433) - 9600680468 - sweetsathya62@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-89433', 'REF-89433', 'Karthikeyan', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-006', 'Verified', '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:06.000Z', NULL, '{"1":"2026-01-01T00:00:06.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$35d333cdaf5a9ba2a2dcbdde547924f4$58357f384e0dce7169687cbaa7ae36186eba4ea2a8ed8909b337c8df883080bf',
  1, NULL,
  '{"b5Id":6,"numericId":6,"initialSeniority":{"1":6,"2":6,"3":6,"4":6,"5":6,"6":6,"7":6},"aliases":["6","B5-89433","REF-89433"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 7. Pranev (B5-88695) - 9790151709 - dorakarthi51@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-88695', 'REF-88695', 'Pranev', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-007', 'Verified', '2026-01-01T00:00:07.000Z', '2026-01-01T00:00:07.000Z', NULL, '{"1":"2026-01-01T00:00:07.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$f5bd03d720bd9ba0a4219e8927a170f3$ae72d54c96d235078329a5ed6a84c2279fed36fab4c6791755d65ae742abced8',
  1, NULL,
  '{"b5Id":7,"numericId":7,"initialSeniority":{"1":7,"2":7,"3":7,"4":7,"5":7,"6":7,"7":7},"aliases":["7","B5-88695","REF-88695"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 8. Thanya (B5-88857) - 9345151709 - borntowin5b5@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-88857', 'REF-88857', 'Thanya', '', '9345151709', 'borntowin5b5@gmail.com', 'B5-COMPANY',
  1, 'L1-008', 'Verified', '2026-01-01T00:00:08.000Z', '2026-01-01T00:00:08.000Z', NULL, '{"1":"2026-01-01T00:00:08.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$8df32a3755554ff4f58d48c4452bc014$a41ec6e8c0fb08cc543e90b3a793252c35ff37b6c8cbcf1731e0c7b85f2ae4c8',
  1, NULL,
  '{"b5Id":8,"numericId":8,"initialSeniority":{"1":8,"2":8,"3":8,"4":8,"5":8,"6":8,"7":8},"aliases":["8","B5-88857","REF-88857"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 9. Karthikeyan (B5-86695) - 9489730468 - ksp.nkl@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-86695', 'REF-86695', 'Karthikeyan', '', '9489730468', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-009', 'Verified', '2026-01-01T00:00:09.000Z', '2026-01-01T00:00:09.000Z', NULL, '{"1":"2026-01-01T00:00:09.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$a838cd22af2ae901fc3f0098b707c2c0$badcdeebed1d014d713c2ff05a0fce496fc6380b694533421a43596c714b6cd7',
  1, NULL,
  '{"b5Id":9,"numericId":9,"initialSeniority":{"1":9,"2":9,"3":9,"4":9,"5":9,"6":9,"7":9},"aliases":["9","B5-86695","REF-86695"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 10. Pranev (B5-63456) - 9600680468 - sweetsathya62@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-63456', 'REF-63456', 'Pranev', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-010', 'Verified', '2026-01-01T00:00:10.000Z', '2026-01-01T00:00:10.000Z', NULL, '{"1":"2026-01-01T00:00:10.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$65f6a5259a92d37266bca62a2058a9c0$f5af86b6edc23eef7966b0b7447e6cc092c80a1d947e69c2fd5c7c9eae07c54e',
  1, NULL,
  '{"b5Id":10,"numericId":10,"initialSeniority":{"1":10,"2":10,"3":10,"4":10,"5":10,"6":10,"7":10},"aliases":["10","B5-63456","REF-63456"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 11. Thanya (B5-64464) - 9790151709 - dorakarthi51@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-64464', 'REF-64464', 'Thanya', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-011', 'Verified', '2026-01-01T00:00:11.000Z', '2026-01-01T00:00:11.000Z', NULL, '{"1":"2026-01-01T00:00:11.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$6584cfaa4c62d7f2969c243fc6d40922$cbb77260aa602aadb3f64585a70eacc65f99ef99fb029b5cf2cde9e524b8f900',
  1, NULL,
  '{"b5Id":11,"numericId":11,"initialSeniority":{"1":11,"2":11,"3":11,"4":11,"5":11,"6":11,"7":11},"aliases":["11","B5-64464","REF-64464"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 12. sathya (B5-22158) - 9345151709 - borntowin5b5@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-22158', 'REF-22158', 'sathya', '', '9345151709', 'borntowin5b5@gmail.com', 'B5-COMPANY',
  1, 'L1-012', 'Verified', '2026-01-01T00:00:12.000Z', '2026-01-01T00:00:12.000Z', NULL, '{"1":"2026-01-01T00:00:12.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$eaf41103145e9a450dc77125411c3b05$0d53683f9d042acc1d3d0561ad14fa3a302e71a3f39c94e3820f65762b0cfba7',
  1, NULL,
  '{"b5Id":12,"numericId":12,"initialSeniority":{"1":12,"2":12,"3":12,"4":12,"5":12,"6":12,"7":12},"aliases":["12","B5-22158","REF-22158"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 13. Pranev (B5-37029) - 9489730468 - ksp.nkl@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-37029', 'REF-37029', 'Pranev', '', '9489730468', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-013', 'Verified', '2026-01-01T00:00:13.000Z', '2026-01-01T00:00:13.000Z', NULL, '{"1":"2026-01-01T00:00:13.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$f965f4c9a11581a02ce776e5d0debf1c$5ba9d0c3826353e601dda736bc727cf86b789b2766a6ef2858dde64982bd6763',
  1, NULL,
  '{"b5Id":13,"numericId":13,"initialSeniority":{"1":13,"2":13,"3":13,"4":13,"5":13,"6":13,"7":13},"aliases":["13","B5-37029","REF-37029"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 14. Thanya (B5-18937) - 9600680468 - sweetsathya62@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-18937', 'REF-18937', 'Thanya', '', '9600680468', 'sweetsathya62@gmail.com', 'B5-COMPANY',
  1, 'L1-014', 'Verified', '2026-01-01T00:00:14.000Z', '2026-01-01T00:00:14.000Z', NULL, '{"1":"2026-01-01T00:00:14.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$d121fb704c5946d04d6848c89a8b0f8a$08ecac095396138d33d276195bd831340d30e4ed3a9993716f661f8a22f1dc1c',
  1, NULL,
  '{"b5Id":14,"numericId":14,"initialSeniority":{"1":14,"2":14,"3":14,"4":14,"5":14,"6":14,"7":14},"aliases":["14","B5-18937","REF-18937"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 15. sathya (B5-79020) - 9790151709 - dorakarthi51@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-79020', 'REF-79020', 'sathya', '', '9790151709', 'dorakarthi51@gmail.com', 'B5-COMPANY',
  1, 'L1-015', 'Verified', '2026-01-01T00:00:15.000Z', '2026-01-01T00:00:15.000Z', NULL, '{"1":"2026-01-01T00:00:15.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$ecc82df823307d4e8c95d17cf60a9884$8749217e0a79725997f1965dfc2abf9442547324aa67323106d12c0cde5497f5',
  1, NULL,
  '{"b5Id":15,"numericId":15,"initialSeniority":{"1":15,"2":15,"3":15,"4":15,"5":15,"6":15,"7":15},"aliases":["15","B5-79020","REF-79020"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 16. Karthikeyan (B5-71866) - 9345151709 - borntowin5b5@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-71866', 'REF-71866', 'Karthikeyan', '', '9345151709', 'borntowin5b5@gmail.com', 'B5-COMPANY',
  1, 'L1-016', 'Verified', '2026-01-01T00:00:16.000Z', '2026-01-01T00:00:16.000Z', NULL, '{"1":"2026-01-01T00:00:16.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$5a40c762efda651eed3b3e7240c87c47$14a0caa856223ef9612987c3167c79acf4e5d3af7929ace780b7e357275366af',
  1, NULL,
  '{"b5Id":16,"numericId":16,"initialSeniority":{"1":16,"2":16,"3":16,"4":16,"5":16,"6":16,"7":16},"aliases":["16","B5-71866","REF-71866"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;

-- 17. sathya (B5-83922) - 9489730468 - ksp.nkl@gmail.com
INSERT INTO members (
  member_id, referral_id, name, place, mobile, email, referral,
  level, level_member_id, status, joined_at, registered_at, upgrade_date,
  level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
  photo, profile_locked, payment_access_locked, payment_review_status,
  password_hash, must_change_password, seniority_test_order, extra_json
) VALUES (
  'B5-83922', 'REF-83922', 'sathya', '', '9489730468', 'ksp.nkl@gmail.com', 'B5-COMPANY',
  1, 'L1-017', 'Verified', '2026-01-01T00:00:17.000Z', '2026-01-01T00:00:17.000Z', NULL, '{"1":"2026-01-01T00:00:17.000Z"}',
  '', '', '', '', '', '', '', 0, 0, '',
  'pbkdf2$sha256$100000$cdce5c158930d4809dc70845260bbc64$9767425fa88100768a7203c204124b25f472a8e870f085bba5123238309aef64',
  1, NULL,
  '{"b5Id":17,"numericId":17,"initialSeniority":{"1":17,"2":17,"3":17,"4":17,"5":17,"6":17,"7":17},"aliases":["17","B5-83922","REF-83922"]}'
) ON CONFLICT(member_id) DO UPDATE SET
  referral_id = excluded.referral_id,
  name = excluded.name,
  mobile = excluded.mobile,
  email = excluded.email,
  referral = excluded.referral,
  level = excluded.level,
  level_member_id = excluded.level_member_id,
  status = excluded.status,
  joined_at = excluded.joined_at,
  registered_at = excluded.registered_at,
  upgrade_date = excluded.upgrade_date,
  level_reached_at_json = excluded.level_reached_at_json,
  account_holder = excluded.account_holder,
  bank = excluded.bank,
  account = excluded.account,
  ifsc = excluded.ifsc,
  branch = excluded.branch,
  upi = excluded.upi,
  password_hash = excluded.password_hash,
  must_change_password = excluded.must_change_password,
  extra_json = excluded.extra_json;
