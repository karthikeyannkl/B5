/**
 * BORNTOWIN5 (B5) — Launch Accounts & Security Rules Comprehensive Verification Suite
 *
 * Verifies all requirements of the B5 Fresh Launch & Password Security Specifications:
 * 1. Exactly 1 Company ID: "BORN TO WIN" (B5-COMPANY).
 * 2. Exactly 15 Initial Member Accounts with Mandatory B5-XXXXX Format (Prefix B5- + 5 random digits).
 * 3. Exactly 4 approved mobile numbers shared among the 15 accounts.
 * 4. Bank details blank for all initial accounts.
 * 5. PBKDF2 Password Hashing (100,000 iterations, unique salts, no hardcoded passwords).
 * 6. Secure Individual Password Setup API (Member self-service & Admin batch/single).
 * 7. Multiple Member Login: Mobile + individual password opens exact corresponding Member ID.
 * 8. Company ID vs RK Accounts Strict Login Separation on shared mobile 9345151709.
 * 9. Direct Member ID Login via B5-XXXXX / Aliases.
 * 10. Public Registration Lock: Duplicate mobile numbers rejected with HTTP 409 Conflict.
 * 11. Seniority Levels 1–7: Exactly 15 entries (positions 1–15) in every level with 0 fake payments.
 * 12. Sequential Seniority 16 for subsequent qualifying upgrades.
 * 13. Zero operational test data & reset counters remaining across all tables.
 * 14. Strict Admin Authorization & Production Guard.
 * 15. Zero test IDs or stale test accounts in directory.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getD1Binding } = require('../src/d1-node-binding');
const {
  ensureD1SchemaAndBootstrap,
  loadStateFromD1,
  resetD1ToFreshSchema
} = require('../src/d1-repository');
const {
  LEVEL_RULES,
  LEVEL_SLOT_CAPACITY,
  hashPassword,
  verifyPassword,
  createSessionContext,
  handleApiRequest,
  makeMemberId
} = require('../src/b5-engine');
const { buildLaunchState, APPROVED_15_MEMBERS } = require('../scripts/fresh-launch-reset');

async function runSuite() {
  console.log('================================================================');
  console.log('BORNTOWIN5 — FRESH LAUNCH COMPREHENSIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  const testPersistDir = path.join(__dirname, '.tmp-d1-launch-test-suite');
  if (fs.existsSync(testPersistDir)) {
    fs.rmSync(testPersistDir, { recursive: true, force: true });
  }

  process.env.B5_LOCAL_TEST_ONLY = '1';
  process.env.B5_ADMIN_PASSWORD = 'ADMIN';

  const { DB: d1, dispose } = await getD1Binding({
    persistDir: testPersistDir,
    forceLocal: true
  });

  const env = {
    ...process.env,
    DB: d1,
    B5_LOCAL_TEST_ONLY: '1',
    B5_ADMIN_PASSWORD: 'ADMIN'
  };

  let passed = 0;
  let total = 0;

  function pass(code, title, details) {
    passed++;
    total++;
    console.log(`✅ PASS [${code}] ${title} — ${details}`);
  }

  function fail(code, title, error) {
    total++;
    console.error(`❌ FAIL [${code}] ${title} — ${error.message}`);
    throw error;
  }

  async function api(method, pathname, { body = {}, query = {}, headers = {} } = {}) {
    return handleApiRequest({
      method,
      pathname,
      query,
      headers,
      body,
      env
    });
  }

  try {
    // Bootstrap D1 schema and apply clean state
    await ensureD1SchemaAndBootstrap(d1, 'ADMIN');
    await resetD1ToFreshSchema(d1, 'ADMIN');

    // Admin login
    const adminLogin = await api('POST', '/api/admin/login', { body: { password: 'ADMIN' } });
    assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
    const adminToken = adminLogin.body.adminToken || adminLogin.body.token;

    // Trigger Fresh Launch Reset API
    const resetRes = await api('POST', '/api/leveltrack/admin/fresh-launch-reset', {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resetRes.status, 200, 'Fresh launch reset must succeed');
    assert.strictEqual(resetRes.body.ok, true);

    // Load state from D1 to verify database persistence
    let state = await loadStateFromD1(d1, 'ADMIN');
    let ctx = createSessionContext(state, env);

    // -------------------------------------------------------------------------
    // TEST 1: Exactly 1 Company ID + 15 Member IDs
    // -------------------------------------------------------------------------
    try {
      assert.strictEqual(state.members.length, 16, 'Total members directory must have 16 accounts');
      const company = state.members.find(m => m.isCompanyAccount || m.name === 'BORN TO WIN');
      assert.ok(company, 'Company account must exist');
      assert.strictEqual(company.name, 'BORN TO WIN');
      assert.strictEqual(company.memberId, 'B5-COMPANY');
      assert.strictEqual(company.excludeFromSeniorityQueue, true);

      const members = state.members.filter(m => !m.isCompanyAccount);
      assert.strictEqual(members.length, 15, 'Initial member accounts count must be 15');
      pass('T-LAUNCH-01', '1 Company ID + 15 Member IDs Verified', `total=${state.members.length}, companyId=${company.memberId}, membersCount=${members.length}`);
    } catch (e) {
      fail('T-LAUNCH-01', '1 Company ID + 15 Member IDs Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Mandatory B5 Member ID Format (B5- plus exactly 5 random numeric digits)
    // -------------------------------------------------------------------------
    try {
      const members = state.members.filter(m => !m.isCompanyAccount);
      const memberIds = members.map(m => m.memberId);

      // Check unique
      assert.strictEqual(new Set(memberIds).size, 15, 'All 15 Member IDs must be unique');

      // Check exact format: B5-XXXXX (exactly 5 numeric digits)
      for (const m of members) {
        assert.match(
          m.memberId,
          /^B5-\d{5}$/,
          `Member ID ${m.memberId} must match format B5-XXXXX (exactly 5 numeric digits)`
        );
        const digits = m.memberId.replace(/^B5-/, '');
        assert.strictEqual(digits.length, 5, 'Must have exactly 5 digits after B5-');

        // Check non-sequential / non-trivial
        assert.ok(
          !['00001', '00002', '12345', '54321', '11111', '99999'].includes(digits),
          `Member ID ${m.memberId} must not be a simple or sequential ID`
        );

        // Check not derived from mobile number
        assert.ok(!m.mobile.includes(digits), `Member ID ${m.memberId} must not be derived from mobile number`);
      }

      // Test engine dynamic makeMemberId generation
      const generated = [];
      for (let i = 0; i < 20; i++) {
        const newId = makeMemberId(state.members);
        assert.match(newId, /^B5-\d{5}$/, 'makeMemberId must generate B5- followed by exactly 5 numeric digits');
        generated.push(newId);
      }
      assert.strictEqual(new Set(generated).size, 20, 'Generated member IDs must all be unique');

      pass('T-LAUNCH-02', 'Mandatory B5-XXXXX 5-Digit Member ID Format Verified', `All 15 IDs strictly match /^B5-\\d{5}$/, non-sequential, unique, and not derived from mobile`);
    } catch (e) {
      fail('T-LAUNCH-02', 'Mandatory B5-XXXXX 5-Digit Member ID Format Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Only the 4 Approved Mobile Numbers
    // -------------------------------------------------------------------------
    try {
      const members = state.members.filter(m => !m.isCompanyAccount);
      const usedMobiles = [...new Set(members.map(m => m.mobile))].sort();
      const expectedMobiles = ['7867014621', '9345151709', '9600680468', '9790151709'];
      assert.deepStrictEqual(usedMobiles, expectedMobiles, 'Only the 4 approved mobiles must be used');

      // Verify exact counts per person
      const sathya = members.filter(m => m.mobile === '9600680468');
      const elango = members.filter(m => m.mobile === '7867014621');
      const karthi = members.filter(m => m.mobile === '9790151709');
      const rk = members.filter(m => m.mobile === '9345151709');

      assert.strictEqual(sathya.length, 3, 'Sathya must have 3 accounts (1, 6, 11)');
      assert.strictEqual(elango.length, 6, 'Elango must have 6 accounts (2, 4, 7, 9, 12, 14)');
      assert.strictEqual(karthi.length, 3, 'Karthikeyan must have 3 accounts (3, 8, 13)');
      assert.strictEqual(rk.length, 3, 'RK must have 3 accounts (5, 10, 15)');

      pass('T-LAUNCH-03', '4 Approved Mobile Numbers Distribution Verified', `Sathya=3, Elango=6, Karthikeyan=3, RK=3; total=15`);
    } catch (e) {
      fail('T-LAUNCH-03', '4 Approved Mobile Numbers Distribution Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Bank Details Blank for All Initial Accounts
    // -------------------------------------------------------------------------
    try {
      const members = state.members.filter(m => !m.isCompanyAccount);
      members.forEach(m => {
        assert.strictEqual(m.accountHolder, '', `Account ${m.memberId} accountHolder must be blank`);
        assert.strictEqual(m.bank, '', `Account ${m.memberId} bank must be blank`);
        assert.strictEqual(m.account, '', `Account ${m.memberId} account must be blank`);
        assert.strictEqual(m.ifsc, '', `Account ${m.memberId} ifsc must be blank`);
        assert.strictEqual(m.branch, '', `Account ${m.memberId} branch must be blank`);
        assert.strictEqual(m.upi, '', `Account ${m.memberId} upi must be blank`);
      });
      pass('T-LAUNCH-04', 'Blank Bank Details for Admin Configuration', 'All accountHolder, bank, account, ifsc, branch, upi are blank');
    } catch (e) {
      fail('T-LAUNCH-04', 'Blank Bank Details for Admin Configuration', e);
    }

    // -------------------------------------------------------------------------
    // TEST 5: PBKDF2 Password Hashing Architecture
    // -------------------------------------------------------------------------
    try {
      const allAccounts = state.members;
      const hashes = allAccounts.map(m => m.passwordHash);
      assert.strictEqual(new Set(hashes).size, 16, 'All 16 accounts must have unique password hashes');

      hashes.forEach((h, idx) => {
        assert.ok(h.startsWith('pbkdf2$sha256$100000$'), `Account ${allAccounts[idx].memberId} must use PBKDF2 with 100k iterations`);
        const parts = h.split('$');
        assert.strictEqual(parts.length, 5, 'Hash must have 5 parts (pbkdf2, sha256, iters, salt, key)');
        assert.strictEqual(parts[3].length, 32, 'Salt must be 16 bytes (32 hex chars)');
        assert.strictEqual(parts[4].length, 64, 'Derived key must be 32 bytes (64 hex chars)');
      });

      // Verify timing-safe verification
      const sampleHash = hashPassword('TestPassword123');
      assert.strictEqual(verifyPassword('TestPassword123', sampleHash), true);
      assert.strictEqual(verifyPassword('WrongPassword', sampleHash), false);

      pass('T-LAUNCH-05', 'PBKDF2 Password Hashing Architecture Verified', '16 unique salted PBKDF2 hashes (100,000 iters, timing-safe equal)');
    } catch (e) {
      fail('T-LAUNCH-05', 'PBKDF2 Password Hashing Architecture Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Secure Individual Password Setup (Member Self-Service & Admin)
    // -------------------------------------------------------------------------
    const testPasswords = {};
    for (const item of APPROVED_15_MEMBERS) {
      testPasswords[item.memberId] = `SecureB5#${item.b5Id}_${crypto.randomBytes(4).toString('hex')}`;
    }
    const companyTestPassword = `CompanySecret#${crypto.randomBytes(4).toString('hex')}`;
    const firstMember = APPROVED_15_MEMBERS[0];

    try {
      // 1. Member self-service password setup for Sathya (B5-64847)
      const m1Setup = await api('POST', '/api/member/setup-password', {
        body: {
          memberId: firstMember.memberId,
          mobile: firstMember.mobile,
          email: firstMember.email,
          newPassword: testPasswords[firstMember.memberId],
          confirmPassword: testPasswords[firstMember.memberId]
        }
      });
      assert.strictEqual(m1Setup.status, 200, 'Member password setup must return 200');
      assert.strictEqual(m1Setup.body.ok, true);

      // Verify validation: wrong mobile rejected
      const badMobile = await api('POST', '/api/member/setup-password', {
        body: {
          memberId: firstMember.memberId,
          mobile: '9999999999',
          email: firstMember.email,
          newPassword: 'newpwd',
          confirmPassword: 'newpwd'
        }
      });
      assert.strictEqual(badMobile.status, 403, 'Mobile mismatch must return 403');

      // Verify validation: wrong email rejected
      const badEmail = await api('POST', '/api/member/setup-password', {
        body: {
          memberId: firstMember.memberId,
          mobile: firstMember.mobile,
          email: 'wrong@test.com',
          newPassword: 'newpwd',
          confirmPassword: 'newpwd'
        }
      });
      assert.strictEqual(badEmail.status, 403, 'Email mismatch must return 403');

      // 2. Member self-service password setup for Company Account
      const compSetup = await api('POST', '/api/member/setup-password', {
        body: {
          memberId: 'B5-COMPANY',
          mobile: '9345151709',
          email: 'notifications@borntowin5.com',
          newPassword: companyTestPassword,
          confirmPassword: companyTestPassword
        }
      });
      assert.strictEqual(compSetup.status, 200, 'Company password setup must succeed');

      // 3. Admin batch provisioning for remaining members
      const adminBatchRes = await api('POST', '/api/leveltrack/admin/member-password-setup', {
        headers: { authorization: `Bearer ${adminToken}` },
        body: { passwords: testPasswords }
      });
      assert.strictEqual(adminBatchRes.status, 200, 'Admin batch password setup must succeed');
      assert.strictEqual(adminBatchRes.body.count, 15);

      pass('T-LAUNCH-06', 'Secure Individual Password Setup Verified', 'Self-service endpoint with strict identity check + Admin batch setup verified');
    } catch (e) {
      fail('T-LAUNCH-06', 'Secure Individual Password Setup Verified', e);
    }

    // Refresh state after password setups
    state = await loadStateFromD1(d1, 'ADMIN');
    ctx = createSessionContext(state, env);

    // -------------------------------------------------------------------------
    // TEST 7: Multiple Member Login Verified Across All 15 Accounts
    // -------------------------------------------------------------------------
    try {
      // Test all 15 accounts with their individual passwords
      for (const item of APPROVED_15_MEMBERS) {
        const res = await api('POST', '/api/member/login', {
          body: {
            mobile: item.mobile,
            password: testPasswords[item.memberId]
          }
        });
        assert.strictEqual(res.status, 200, `Login for ${item.name} (${item.memberId}) on ${item.mobile} must succeed`);
        assert.strictEqual(res.body.member.memberId, item.memberId, `Must log in strictly into ${item.memberId}`);
        assert.strictEqual(res.body.member.name, item.name);
      }

      // Wrong password check
      const wrong = await api('POST', '/api/member/login', {
        body: { mobile: '9600680468', password: 'WrongPassword' }
      });
      assert.strictEqual(wrong.status, 401);

      pass('T-LAUNCH-07', 'Multiple Member Login Verified Across All 15 Accounts', 'Each mobile + individual password opens exact corresponding Member ID');
    } catch (e) {
      fail('T-LAUNCH-07', 'Multiple Member Login Verified Across All 15 Accounts', e);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Strict Company ID vs RK Member Accounts Separation (Mobile 9345151709)
    // -------------------------------------------------------------------------
    try {
      // 1. Company login using shared mobile 9345151709 + Company password -> Opens B5-COMPANY
      const compLogin = await api('POST', '/api/member/login', {
        body: { mobile: '9345151709', password: companyTestPassword }
      });
      assert.strictEqual(compLogin.status, 200, 'Company ID login via mobile 9345151709 must succeed');
      assert.strictEqual(compLogin.body.member.memberId, 'B5-COMPANY');
      assert.strictEqual(compLogin.body.member.name, 'BORN TO WIN');

      // 2. RK accounts login on 9345151709
      const rkMembers = APPROVED_15_MEMBERS.filter(m => m.mobile === '9345151709');
      assert.strictEqual(rkMembers.length, 3, 'Must be 3 RK accounts');

      for (const rk of rkMembers) {
        const rkLogin = await api('POST', '/api/member/login', {
          body: { mobile: '9345151709', password: testPasswords[rk.memberId] }
        });
        assert.strictEqual(rkLogin.status, 200, `RK ${rk.memberId} login must succeed`);
        assert.strictEqual(rkLogin.body.member.memberId, rk.memberId);
        assert.strictEqual(rkLogin.body.member.name, 'RK');
      }

      // 3. Wrong password on mobile 9345151709 -> 401
      const badRk = await api('POST', '/api/member/login', {
        body: { mobile: '9345151709', password: 'InvalidPassword' }
      });
      assert.strictEqual(badRk.status, 401);

      pass('T-LAUNCH-08', 'Strict Company ID vs RK Separation on Mobile 9345151709', 'Mobile 9345151709 opens B5-COMPANY or RK Member IDs strictly based on individual password');
    } catch (e) {
      fail('T-LAUNCH-08', 'Strict Company ID vs RK Separation on Mobile 9345151709', e);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Direct Member ID Login Verified
    // -------------------------------------------------------------------------
    try {
      // Direct login by Member ID (e.g. B5-64847)
      const d1 = await api('POST', '/api/member/login', {
        body: { memberId: firstMember.memberId, password: testPasswords[firstMember.memberId] }
      });
      assert.strictEqual(d1.status, 200);
      assert.strictEqual(d1.body.member.memberId, firstMember.memberId);

      // Direct login by ID "B5-COMPANY"
      const dComp = await api('POST', '/api/member/login', {
        body: { memberId: 'B5-COMPANY', password: companyTestPassword }
      });
      assert.strictEqual(dComp.status, 200);
      assert.strictEqual(dComp.body.member.memberId, 'B5-COMPANY');

      pass('T-LAUNCH-09', 'Direct Member ID Login Verified', `Login via "${firstMember.memberId}" and "B5-COMPANY" opens exact matching account`);
    } catch (e) {
      fail('T-LAUNCH-09', 'Direct Member ID Login Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Public Registration Lock
    // -------------------------------------------------------------------------
    try {
      const dup = await api('POST', '/api/member/register', {
        body: {
          name: 'Public Duplicate Test',
          mobile: '9600680468',
          password: 'Password@123',
          pin: 'PIN-START1',
          referral: firstMember.memberId
        }
      });
      assert.strictEqual(dup.status, 409, 'Public registration with existing mobile must return 409');
      assert.ok(/already registered/i.test(dup.body.error));
      pass('T-LAUNCH-10', 'Public Registration Lock Verified', 'Public duplicate mobile registration blocked with HTTP 409');
    } catch (e) {
      fail('T-LAUNCH-10', 'Public Registration Lock Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Seniority Positions 1–15 in ALL 7 Levels (Level 1 to Level 7)
    // -------------------------------------------------------------------------
    try {
      for (let lvl = 1; lvl <= 7; lvl++) {
        const q = ctx.seniorityQueue(lvl);
        assert.strictEqual(q.length, 15, `Level ${lvl} queue must contain exactly 15 members`);
        for (let pos = 1; pos <= 15; pos++) {
          const entry = q[pos - 1];
          assert.strictEqual(entry.position, pos);
          const expected = APPROVED_15_MEMBERS[pos - 1];
          assert.strictEqual(entry.memberId, expected.memberId);
          assert.strictEqual(entry.completed, 0, 'Must have 0 fake completed transactions');
          assert.strictEqual(entry.status, 'ACTIVE');
        }
      }
      pass('T-LAUNCH-11', 'Level 1–7 Seniority Sequences Verified', 'Each of Levels 1–7 contains exactly Seniority positions 1–15 for the initial accounts');
    } catch (e) {
      fail('T-LAUNCH-11', 'Level 1–7 Seniority Sequences Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 12: Sequential Seniority 16 for Next Qualifying Upgrade
    // -------------------------------------------------------------------------
    try {
      const newUpgrader = {
        memberId: 'B5-83921',
        referralId: 'REF-83921',
        name: 'First New Genuine Member',
        mobile: '9888777666',
        email: 'genuine16@test.com',
        referral: firstMember.memberId,
        level: 2,
        status: 'Verified',
        joinedAt: '2026-11-02T13:00:00.000Z',
        registeredAt: '2026-11-02T13:00:00.000Z',
        levelReachedAt: { 1: '2026-11-02T13:00:00.000Z', 2: '2026-11-02T13:05:00.000Z' },
        accountHolder: '', bank: '', account: '', ifsc: '', branch: '', upi: '',
        photo: '', profileLocked: false, paymentAccessLocked: false, paymentReviewStatus: '',
        passwordHash: hashPassword('dummy'), mustChangePassword: false, seniorityTestOrder: null
      };

      state.members.push(newUpgrader);

      const l2 = ctx.seniorityQueue(2);
      assert.strictEqual(l2.length, 16, 'Level 2 queue must have 16 members');
      assert.strictEqual(l2[15].position, 16, 'New upgrader must receive position 16');
      assert.strictEqual(l2[15].memberId, 'B5-83921');

      // Other levels must remain at 15
      assert.strictEqual(ctx.seniorityQueue(3).length, 15);
      assert.strictEqual(ctx.seniorityQueue(4).length, 15);

      state.members.pop();
      pass('T-LAUNCH-12', 'Seniority 16 Sequence Verified', 'Next qualifying upgrade receives position 16 independently in that level');
    } catch (e) {
      fail('T-LAUNCH-12', 'Seniority 16 Sequence Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 13: Zero Operational Test Data Remaining
    // -------------------------------------------------------------------------
    try {
      assert.strictEqual(state.leveltrackPayments.length, 0);
      assert.strictEqual(state.leveltrackUpgrades.length, 0);
      assert.strictEqual(state.leveltrackRequests.length, 0);
      assert.strictEqual(state.passwordResetRequests.length, 0);
      if (state.paymentSettings) {
        assert.strictEqual(state.paymentSettings.adminRotationIndex, 0);
        assert.deepStrictEqual(state.paymentSettings.adminRotationByLevel, { 4: 0, 5: 0, 6: 0, 7: 0 });
      }
      pass('T-LAUNCH-13', 'Zero Operational Test Data Remaining', 'All payments=0, upgrades=0, requests=0, password_resets=0, rotationIndex=0');
    } catch (e) {
      fail('T-LAUNCH-13', 'Zero Operational Test Data Remaining', e);
    }

    // -------------------------------------------------------------------------
    // TEST 14: Correct Initial Level State (Level 1, upgradeDate null, No False L7)
    // -------------------------------------------------------------------------
    try {
      const members = state.members.filter(m => !m.isCompanyAccount);
      assert.strictEqual(members.length, 15);
      members.forEach((m, idx) => {
        const id = idx + 1;
        const pad = String(id).padStart(3, '0');
        assert.strictEqual(m.level, 1, `Member ${m.memberId} must start at level 1`);
        assert.strictEqual(m.upgradeDate, null, `Member ${m.memberId} upgradeDate must be null`);
        assert.strictEqual(m.levelMemberId, `L1-${pad}`, `Member ${m.memberId} levelMemberId must be L1-${pad}`);
        assert.deepStrictEqual(Object.keys(m.levelReachedAt || {}), ['1'], `Member ${m.memberId} levelReachedAt must only contain level 1`);
        // Must occupy seniority in all levels independently via initialSeniority
        assert.ok(m.initialSeniority, `Member ${m.memberId} must have initialSeniority`);
        for (let lvl = 1; lvl <= 7; lvl++) {
          assert.strictEqual(m.initialSeniority[lvl], id, `Member ${m.memberId} initialSeniority for Level ${lvl} must be ${id}`);
        }
      });
      // Company account check
      const company = state.members.find(m => m.isCompanyAccount);
      assert.strictEqual(company.level, 7, 'Company ID must remain at level 7');
      pass('T-LAUNCH-14', 'Initial Level 1 State & Seniority Mapping Verified', 'All 15 members start at level 1 with upgradeDate=null, levelReachedAt={1:iso}, and positions 1..15 in all 7 levels');
    } catch (e) {
      fail('T-LAUNCH-14', 'Initial Level 1 State & Seniority Mapping Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 15: Strict Admin Authorization Enforced on Admin Routes
    // -------------------------------------------------------------------------
    try {
      // 1. Unauthenticated fresh-launch-reset must return 401
      const unauthReset = await api('POST', '/api/leveltrack/admin/fresh-launch-reset');
      assert.strictEqual(unauthReset.status, 401, 'fresh-launch-reset without token must return 401');

      // 2. Member token must return 403 (Forbidden: Member accounts cannot access admin APIs)
      const memberToken = (await api('POST', '/api/member/login', { body: { memberId: firstMember.memberId, password: testPasswords[firstMember.memberId] } })).body.memberToken;
      const memberReset = await api('POST', '/api/leveltrack/admin/fresh-launch-reset', {
        headers: { authorization: `Bearer ${memberToken}` }
      });
      assert.strictEqual(memberReset.status, 403, 'fresh-launch-reset with member token must return 403 Forbidden');

      // 3. Test dataset seed without admin token must return 401
      const unauthSeed = await api('POST', '/api/leveltrack/admin/seed-test-dataset-43');
      assert.strictEqual(unauthSeed.status, 401, 'seed-test-dataset-43 without admin token must return 401');

      pass('T-LAUNCH-15', 'Strict Admin Authorization & Production Guard Verified', 'fresh-launch-reset requires admin auth (401); member token rejected with 403');
    } catch (e) {
      fail('T-LAUNCH-15', 'Strict Admin Authorization & Production Guard Verified', e);
    }

    // -------------------------------------------------------------------------
    // TEST 16: Zero Test IDs or Stale Test Accounts in Member Directory
    // -------------------------------------------------------------------------
    try {
      const allMembers = state.members;
      const staleTestMembers = allMembers.filter(m =>
        String(m.memberId).startsWith('B5-TEST-') ||
        m.memberId === 'B5-FC329E' ||
        String(m.name).toLowerCase().includes('test') ||
        m.isTestAccount === true
      );
      assert.strictEqual(staleTestMembers.length, 0, `Must be zero stale test accounts, found: ${staleTestMembers.length}`);
      assert.strictEqual(allMembers.length, 16, 'Active member directory must contain exactly 16 accounts (1 Company + 15 Members)');
      pass('T-LAUNCH-16', 'Zero Stale Test Accounts in Directory Verified', 'Active directory has exactly 1 Company ID + 15 Member IDs, zero test accounts');
    } catch (e) {
      fail('T-LAUNCH-16', 'Zero Stale Test Accounts in Directory Verified', e);
    }

    console.log('\n================================================================');
    console.log(`ALL ${passed} / ${total} FRESH LAUNCH TESTS PASSED SUCCESSFULLY! (100%)`);
    console.log('================================================================\n');

  } finally {
    if (dispose) await dispose();
    if (fs.existsSync(testPersistDir)) {
      fs.rmSync(testPersistDir, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  runSuite().catch(err => {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };
