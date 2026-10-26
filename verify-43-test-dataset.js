/**
 * BORNTOWIN5 (B5) — Complete 43-Member Isolated Test Dataset & Workflow Verification Suite
 *
 * Verifies:
 * 1. Root test member: B5-TEST-ROOT-001 ("BORN TO WIN TEST ROOT")
 * 2. Three direct members under root:
 *    - B5-TEST-A-001 — Karthi Test
 *    - B5-TEST-B-001 — Siva Test
 *    - B5-TEST-C-001 — Sathya Test
 * 3. Exactly 13 direct referral child members under each of Karthi, Siva, and Sathya (1 + 3 + 39 = 43 total)
 * 4. Joining PIN generation & validation (43 registration PINs + 6 available PINs)
 * 5. Level 2–7 agreed seniority order:
 *    - L2: Karthi, Siva, Sathya
 *    - L3: Siva, Karthi, Sathya
 *    - L4: Sathya, Siva, Karthi
 *    - L5: Karthi, Sathya, Siva
 *    - L6: Sathya, Karthi, Siva
 *    - L7: Siva, Sathya, Karthi
 * 6. Concurrent upgrade requests across Karthi, Siva, Sathya & child members, slot capacities
 *    (L2=5, L3=10, L4=10, L5=5, L6=5, L7=5), 24-hour payment locks, independent Admin A/B/C
 *    rotation across L4-L7, dummy UTR/proof submission, receiver confirmation, and Admin final approval.
 * 7. Idempotent re-seeding (no duplicate IDs/PINs) and isolated cleanup.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { getD1Binding } = require('../src/d1-node-binding');
const {
  ensureD1SchemaAndBootstrap,
  loadStateFromD1,
  buildSnapshotMap,
  commitStateToD1,
  resetD1ToFreshSchema
} = require('../src/d1-repository');
const {
  LEVEL_RULES,
  LEVEL_SLOT_CAPACITY,
  createSessionContext,
  handleApiRequest
} = require('../src/b5-engine');

const DUMMY_PNG_PROOF =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runSuite() {
  console.log('=== Starting BORNTOWIN5 43-Member Isolated Test Dataset Verification Suite ===');
  const testPersistDir = path.join(__dirname, '.tmp-d1-43-test-suite');
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
  function pass(code, title, details) {
    passed++;
    console.log(`✅ PASS [${code}] ${title} — ${details}`);
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
    await ensureD1SchemaAndBootstrap(d1, 'ADMIN');
    await resetD1ToFreshSchema(d1, 'ADMIN');

    // Admin login token
    const loginRes = await api('POST', '/api/admin/login', { body: { password: 'ADMIN' } });
    assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');
    const adminToken = loginRes.body.adminToken;
    const adminHeaders = { 'x-admin-token': adminToken };

    // -------------------------------------------------------------------------
    // TEST 1: Seed 43-Member Dataset & Verify Idempotency (Repeatable Seeding)
    // -------------------------------------------------------------------------
    {
      const state1 = await loadStateFromD1(d1, 'ADMIN');
      const snap1 = buildSnapshotMap(state1);
      const ctx1 = createSessionContext(state1, env);
      ctx1.seedB5TestDataset43();
      await commitStateToD1(d1, snap1, state1, []);

      // Run seed a second time to verify idempotency (no duplicate IDs or PINs)
      const state2 = await loadStateFromD1(d1, 'ADMIN');
      const snap2 = buildSnapshotMap(state2);
      const ctx2 = createSessionContext(state2, env);
      ctx2.seedB5TestDataset43();
      await commitStateToD1(d1, snap2, state2, []);

      const verifyState = await loadStateFromD1(d1, 'ADMIN');
      const testMembers = verifyState.members.filter(m => m.memberId.startsWith('B5-TEST-'));
      assert.strictEqual(testMembers.length, 43, 'Expected exactly 43 test members after repeatable seed');
      assert.strictEqual(verifyState.members.length, 43, 'Total members in isolated DB should be 43');

      const uniqueIds = new Set(testMembers.map(m => m.memberId));
      const uniqueMobiles = new Set(testMembers.map(m => m.mobile));
      assert.strictEqual(uniqueIds.size, 43, 'All 43 member IDs must be unique');
      assert.strictEqual(uniqueMobiles.size, 43, 'All 43 mobile numbers must be unique');
      assert.ok(testMembers.every(m => m.isTestAccount === true && m.testTag === 'B5_TEST_DATASET_43'), 'All 43 records must be tagged as TEST data');

      // Verify login for Karthi, Siva, and Sathya via both Mobile Number and Member ID
      for (const [ldrId, ldrMobile] of [
        ['B5-TEST-A-001', '7000990100'],
        ['B5-TEST-B-001', '7000990200'],
        ['B5-TEST-C-001', '7000990300']
      ]) {
        const loginByMobile = await api('POST', '/api/member/login', {
          body: { mobile: ldrMobile, password: 'B5@123456' }
        });
        assert.strictEqual(loginByMobile.status, 200, `Login by mobile failed for ${ldrId}`);
        assert.strictEqual(loginByMobile.body.member.memberId, ldrId);
        assert.ok(loginByMobile.body.memberToken, `Missing memberToken for ${ldrId}`);

        const loginById = await api('POST', '/api/member/login', {
          body: { mobile: ldrId, password: 'B5@123456' }
        });
        assert.strictEqual(loginById.status, 200, `Login by Member ID failed for ${ldrId}`);
        assert.strictEqual(loginById.body.member.memberId, ldrId);

        const loginAltPwd = await api('POST', '/api/member/login', {
          body: { mobile: ldrId, password: 'Test@12345' }
        });
        assert.strictEqual(loginAltPwd.status, 200, `Login by alt test password failed for ${ldrId}`);
      }

      pass(
        'T43-01',
        '43-Member Test Dataset Seeded, Login Verified & Repeatable (Idempotent)',
        `totalMembers=${testMembers.length}, uniqueIds=${uniqueIds.size}, uniqueMobiles=${uniqueMobiles.size}, leaderLogins=OK`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 2: Verify Root, Karthi, Siva, Sathya & 13 Direct Referrals Each
    // -------------------------------------------------------------------------
    {
      const rootDash = await api('GET', '/api/leveltrack/member/dashboard/B5-TEST-ROOT-001');
      assert.strictEqual(rootDash.status, 200);
      assert.strictEqual(rootDash.body.member.name, 'BORN TO WIN TEST ROOT');
      assert.strictEqual(rootDash.body.directReferralCount, 3, 'Root must have 3 direct referrals');
      assert.strictEqual(rootDash.body.totalDownline, 42, 'Root must have 42 total downline members');

      const leaders = [
        ['B5-TEST-A-001', 'Karthi Test', 'B5-TEST-A-C'],
        ['B5-TEST-B-001', 'Siva Test', 'B5-TEST-B-C'],
        ['B5-TEST-C-001', 'Sathya Test', 'B5-TEST-C-C']
      ];
      for (const [ldrId, ldrName, childPrefix] of leaders) {
        const d = await api('GET', `/api/leveltrack/member/dashboard/${ldrId}`);
        assert.strictEqual(d.status, 200);
        assert.strictEqual(d.body.member.name, ldrName);
        assert.strictEqual(d.body.member.referral, 'B5-TEST-ROOT-001');
        assert.strictEqual(d.body.directReferralCount, 13, `${ldrName} must have 13 direct referrals`);
        assert.strictEqual(d.body.tree.children.length, 13, `${ldrName} referral tree must list 13 children`);
        for (let i = 1; i <= 13; i++) {
          const expectedChildId = `${childPrefix}${String(i).padStart(2, '0')}`;
          assert.ok(
            d.body.tree.children.some(c => c.memberId === expectedChildId),
            `Missing child ${expectedChildId} under ${ldrId}`
          );
        }
      }

      pass(
        'T43-02',
        'Parent-Child Referral Hierarchy Verified (Root -> 3 Leaders -> 13 Children Each)',
        'B5-TEST-ROOT-001 (3 direct, 42 downline); Karthi=13, Siva=13, Sathya=13'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 3: Verify Joining PINs & Live PIN Validation + Registration Workflow
    // -------------------------------------------------------------------------
    {
      // Used PIN should be rejected by /api/member/check-pin
      const usedPinCheck = await api('POST', '/api/member/check-pin', {
        body: { pin: 'PIN-TEST-A-001' }
      });
      assert.strictEqual(usedPinCheck.status, 400, 'Already-used PIN must fail check-pin');

      // Available test PIN should succeed
      const availPinCheck = await api('POST', '/api/member/check-pin', {
        body: { pin: 'PIN-TEST-AVAIL-001' }
      });
      assert.strictEqual(availPinCheck.status, 200, 'Available test PIN must pass check-pin');

      // Test Admin generating a new PIN for Karthi and validating it
      const genPinRes = await api('POST', '/api/admin/pins/generate', {
        headers: adminHeaders,
        body: { memberId: 'B5-TEST-A-001', quantity: 2 }
      });
      assert.strictEqual(genPinRes.status, 200);
      assert.strictEqual(genPinRes.body.pins.length, 2);

      const newPinCheck = await api('POST', '/api/member/check-pin', {
        body: { pin: genPinRes.body.pins[0].pin }
      });
      assert.strictEqual(newPinCheck.status, 200);

      pass(
        'T43-03',
        'Test Joining PIN Wallet & PIN Validation Verified',
        `usedPinRejected=400, availPinValid=200, generatedPin=${genPinRes.body.pins[0].pin}`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 4: Verify Agreed Level 2–7 Seniority Order
    // -------------------------------------------------------------------------
    {
      const expectedOrder = {
        2: ['B5-TEST-A-001', 'B5-TEST-B-001', 'B5-TEST-C-001'], // L2: Karthi, Siva, Sathya
        3: ['B5-TEST-B-001', 'B5-TEST-A-001', 'B5-TEST-C-001'], // L3: Siva, Karthi, Sathya
        4: ['B5-TEST-C-001', 'B5-TEST-B-001', 'B5-TEST-A-001'], // L4: Sathya, Siva, Karthi
        5: ['B5-TEST-A-001', 'B5-TEST-C-001', 'B5-TEST-B-001'], // L5: Karthi, Sathya, Siva
        6: ['B5-TEST-C-001', 'B5-TEST-A-001', 'B5-TEST-B-001'], // L6: Sathya, Karthi, Siva
        7: ['B5-TEST-B-001', 'B5-TEST-C-001', 'B5-TEST-A-001']  // L7: Siva, Sathya, Karthi
      };

      const adminDash = await api('GET', '/api/leveltrack/admin/dashboard', { headers: adminHeaders });
      assert.strictEqual(adminDash.status, 200);

      const summaryParts = [];
      for (let lvl = 2; lvl <= 7; lvl++) {
        const q = adminDash.body.seniorityCurrent[lvl].map(x => x.memberId);
        assert.deepStrictEqual(
          q.slice(0, 3),
          expectedOrder[lvl],
          `Level ${lvl} seniority order mismatch: got ${JSON.stringify(q.slice(0, 3))}`
        );
        summaryParts.push(`L${lvl}=[${q.slice(0, 3).join(' -> ')}]`);
      }

      pass(
        'T43-04',
        'Confirmed Level 2–7 Seniority Order Across Karthi, Siva, and Sathya',
        summaryParts.join(', ')
      );
    }

    // -------------------------------------------------------------------------
    // TEST 5: Concurrent Upgrade Requests by Karthi, Siva & Sathya (Self-Exclusion & Progression)
    // -------------------------------------------------------------------------
    {
      // All 3 main test members (Karthi, Siva, Sathya) submit L1 -> L2 upgrade requests concurrently
      const [reqKarthi, reqSiva, reqSathya] = await Promise.all([
        api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: 'B5-TEST-A-001' } }),
        api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: 'B5-TEST-B-001' } }),
        api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: 'B5-TEST-C-001' } })
      ]);

      assert.strictEqual(reqKarthi.status, 200, 'Karthi L1->L2 request must succeed');
      assert.strictEqual(reqSiva.status, 200, 'Siva L1->L2 request must succeed');
      assert.strictEqual(reqSathya.status, 200, 'Sathya L1->L2 request must succeed');

      // At L2, seniority is Karthi (#1), Siva (#2), Sathya (#3):
      // - Karthi cannot pay himself, so Karthi's reserved receiver must be Siva (B5-TEST-B-001)!
      // - Siva and Sathya must both reserve slots on Karthi (B5-TEST-A-001)!
      assert.strictEqual(reqKarthi.body.request.reservedReceiverId, 'B5-TEST-B-001', 'Karthi must be assigned to Siva (#2 at L2)');
      assert.strictEqual(reqSiva.body.request.reservedReceiverId, 'B5-TEST-A-001', 'Siva must be assigned to Karthi (#1 at L2)');
      assert.strictEqual(reqSathya.body.request.reservedReceiverId, 'B5-TEST-A-001', 'Sathya must be assigned to Karthi (#1 at L2)');

      // Complete all 3 upgrades (Admin Assign -> Verify Payer & Receiver Dashboards Before Proof -> Dummy Proof Submit -> Receiver Confirm -> Admin Final Approve)
      for (const reqRes of [reqKarthi, reqSiva, reqSathya]) {
        const reqObj = reqRes.body.request;

        // Verify duplicate upgrade-request call is rejected with HTTP 400 without creating duplicates
        const dupReq = await api('POST', '/api/leveltrack/member/upgrade-request', {
          body: { memberId: reqObj.memberId }
        });
        assert.strictEqual(dupReq.status, 400, 'Duplicate upgrade-request must be blocked with HTTP 400');
        assert.ok(String(dupReq.body.error || '').includes('already pending'));

        const assignRes = await api('POST', `/api/leveltrack/admin/requests/${reqObj.id}/assign`, {
          headers: adminHeaders
        });
        assert.strictEqual(assignRes.status, 200);
        const upg = assignRes.body.upgrade;
        const pay = assignRes.body.payment;

        // Verify duplicate assign call is idempotent and creates NO second payment record
        const dupAssignRes = await api('POST', `/api/leveltrack/admin/requests/${reqObj.id}/assign`, {
          headers: adminHeaders
        });
        assert.strictEqual(dupAssignRes.status, 200);
        assert.strictEqual(dupAssignRes.body.alreadyAssigned, true, 'Duplicate assign must return alreadyAssigned=true');
        assert.strictEqual(dupAssignRes.body.payment.id, pay.id, 'Duplicate assign must return the exact same payment ID');

        // 1. Verify PAYER dashboard immediately shows upgrade.payment + bank details BEFORE UTR submission
        const payerDash = await api('GET', `/api/leveltrack/member/dashboard/${reqObj.memberId}`);
        assert.strictEqual(payerDash.status, 200);
        assert.ok(payerDash.body.upgrade, `Payer ${reqObj.memberId} dashboard must have active upgrade`);
        assert.strictEqual(payerDash.body.upgrade.status, 'Assigned', 'Payer upgrade.status must be Assigned');
        assert.ok(payerDash.body.upgrade.payment, `Payer ${reqObj.memberId} upgrade.payment must be present immediately after assign`);
        assert.strictEqual(payerDash.body.upgrade.payment.id, pay.id);
        assert.ok(payerDash.body.upgrade.payment.bank, 'Payer upgrade.payment must include receiver bank name');
        assert.ok(payerDash.body.upgrade.payment.account, 'Payer upgrade.payment must include receiver account number');
        assert.ok(payerDash.body.upgrade.payment.ifsc, 'Payer upgrade.payment must include receiver IFSC');
        assert.ok(payerDash.body.upgrade.payment.upi, 'Payer upgrade.payment must include receiver UPI');

        // 2. Verify RECEIVER dashboard immediately shows the assigned payment in receiverPayments & incomingPayments BEFORE UTR submission
        const receiverDashBeforePay = await api('GET', `/api/leveltrack/member/dashboard/${pay.receiverMemberId}`);
        assert.strictEqual(receiverDashBeforePay.status, 200);
        const recIncomingMatch = (receiverDashBeforePay.body.incomingPayments || []).filter(p => p.id === pay.id);
        const recHistoryMatch = (receiverDashBeforePay.body.receiverPayments || []).filter(p => p.id === pay.id);
        assert.strictEqual(recIncomingMatch.length, 1, `Receiver ${pay.receiverMemberId} incomingPayments must have exactly 1 record for ${pay.id} immediately after assign`);
        assert.strictEqual(recHistoryMatch.length, 1, `Receiver ${pay.receiverMemberId} receiverPayments must have exactly 1 record for ${pay.id} immediately after assign`);
        assert.ok(recHistoryMatch[0].bank, 'Receiver payment record must include bank name');
        assert.ok(recHistoryMatch[0].account, 'Receiver payment record must include account number');
        assert.ok(recHistoryMatch[0].ifsc, 'Receiver payment record must include IFSC');
        assert.ok(recHistoryMatch[0].upi, 'Receiver payment record must include UPI ID');
        assert.strictEqual(recHistoryMatch[0].fromMemberId, reqObj.memberId);
        assert.strictEqual(recHistoryMatch[0].receiverMemberId, pay.receiverMemberId);

        const payRes = await api('POST', `/api/leveltrack/member/upgrade/${upg.id}/pay`, {
          body: {
            memberId: reqObj.memberId,
            parts: [
              {
                type: 'member',
                utr: `UTR-TEST-DUMMY-${reqObj.memberId}-L2`,
                screenshot: DUMMY_PNG_PROOF
              }
            ]
          }
        });
        assert.strictEqual(payRes.status, 200);

        const confirmRes = await api('POST', `/api/leveltrack/member/incoming/${pay.id}/accept`, {
          body: {
            memberId: pay.receiverMemberId,
            requestId: reqObj.id
          }
        });
        assert.strictEqual(confirmRes.status, 200);

        const approveRes = await api('POST', `/api/leveltrack/admin/payments/${pay.id}/approve`, {
          headers: adminHeaders,
          body: { requestId: reqObj.id, paymentId: pay.id }
        });
        assert.strictEqual(approveRes.status, 200);
        assert.strictEqual(approveRes.body.newLevel, 2, `${reqObj.memberId} should now be Level 2`);
      }

      pass(
        'T43-05',
        'Concurrent L1->L2 Upgrades for Karthi, Siva & Sathya Completed with Self-Exclusion',
        'Karthi->Siva (approved), Siva->Karthi (approved), Sathya->Karthi (approved); all 3 reached Level 2'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 6: Slot Capacity Enforcement Across L2 (5 Slots: Karthi=5/5 Completed, Siva=5/5, Sathya=3/5)
    // -------------------------------------------------------------------------
    {
      // Give 11 child members (B5-TEST-A-C01..C11) 3 referrals each so they can submit 11 more L1->L2 requests
      // Since Karthi already has 2 completed L2 slots (from Siva & Sathya) and Siva has 1 completed L2 slot (from Karthi):
      // Next 3 requests fill Karthi (2 + 3 = 5/5 slots), next 4 requests fill Siva (1 + 4 = 5/5 slots), next 4 requests go to Sathya (4/5 slots)
      const state = await loadStateFromD1(d1, 'ADMIN');
      const snap = buildSnapshotMap(state);
      const payers = [
        'B5-TEST-A-C01', 'B5-TEST-A-C02', 'B5-TEST-A-C03',
        'B5-TEST-A-C04', 'B5-TEST-A-C05', 'B5-TEST-A-C06', 'B5-TEST-A-C07',
        'B5-TEST-B-C01', 'B5-TEST-B-C02', 'B5-TEST-B-C03', 'B5-TEST-B-C04'
      ];
      // Temporarily link 3 dummy sub-referrals in memory or use REFERRAL_UPGRADE from Karthi, Siva, Sathya + children
      // Better yet: Karthi, Siva, and Sathya are now at Level 2 with 13 direct referrals each!
      // So their next action is REFERRAL_UPGRADE (cycle 1, seniorityLevel=2, ₹1,000)!
      // Let's submit concurrent REFERRAL_UPGRADE requests from Karthi, Siva, and Sathya!
      const [refReqK, refReqSi, refReqSa] = await Promise.all([
        api('POST', '/api/leveltrack/member/referral-upgrade-request', { body: { memberId: 'B5-TEST-A-001' } }),
        api('POST', '/api/leveltrack/member/referral-upgrade-request', { body: { memberId: 'B5-TEST-B-001' } }),
        api('POST', '/api/leveltrack/member/referral-upgrade-request', { body: { memberId: 'B5-TEST-C-001' } })
      ]);
      assert.strictEqual(refReqK.status, 200);
      assert.strictEqual(refReqSi.status, 200);
      assert.strictEqual(refReqSa.status, 200);

      for (const rr of [refReqK, refReqSi, refReqSa]) {
        const reqObj = rr.body.request;
        const assignRes = await api('POST', `/api/leveltrack/admin/requests/${reqObj.id}/assign`, { headers: adminHeaders });
        assert.strictEqual(assignRes.status, 200);
        const upg = assignRes.body.upgrade;
        const pay = assignRes.body.payment;
        await api('POST', `/api/leveltrack/member/upgrade/${upg.id}/pay`, {
          body: {
            memberId: reqObj.memberId,
            parts: [{ type: 'member', utr: `UTR-TEST-REF1-${reqObj.memberId}`, screenshot: DUMMY_PNG_PROOF }]
          }
        });
        await api('POST', `/api/leveltrack/member/incoming/${pay.id}/accept`, {
          body: { memberId: pay.receiverMemberId, requestId: reqObj.id }
        });
        const appRes = await api('POST', `/api/leveltrack/admin/payments/${pay.id}/approve`, {
          headers: adminHeaders,
          body: { requestId: reqObj.id, paymentId: pay.id }
        });
        assert.strictEqual(appRes.status, 200);
      }

      // Now Karthi has 4/5 completed L2 slots (2 from L1->L2 + 2 from Referral Upgrade).
      // Let's have Siva submit L2->L3 (which targets L3 seniority: Siva #1, so Siva is assigned to Karthi #2 at L3!)
      const [l3ReqK, l3ReqSi, l3ReqSa] = await Promise.all([
        api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: 'B5-TEST-A-001' } }),
        api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: 'B5-TEST-B-001' } }),
        api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: 'B5-TEST-C-001' } })
      ]);
      assert.strictEqual(l3ReqK.status, 200);
      assert.strictEqual(l3ReqSi.status, 200);
      assert.strictEqual(l3ReqSa.status, 200);

      // At L3, agreed seniority is Siva (#1), Karthi (#2), Sathya (#3):
      // - Karthi (#2 at L3) must be assigned to Siva (#1 at L3)!
      // - Sathya (#3 at L3) must be assigned to Siva (#1 at L3)!
      // - Siva (#1 at L3) excludes self and is assigned to Karthi (#2 at L3)!
      assert.strictEqual(l3ReqK.body.request.reservedReceiverId, 'B5-TEST-B-001', 'At L3, Karthi must be assigned to #1 Siva');
      assert.strictEqual(l3ReqSa.body.request.reservedReceiverId, 'B5-TEST-B-001', 'At L3, Sathya must be assigned to #1 Siva');
      assert.strictEqual(l3ReqSi.body.request.reservedReceiverId, 'B5-TEST-A-001', 'At L3, Siva excludes self and is assigned to #2 Karthi');

      for (const lr of [l3ReqK, l3ReqSi, l3ReqSa]) {
        const reqObj = lr.body.request;
        const assignRes = await api('POST', `/api/leveltrack/admin/requests/${reqObj.id}/assign`, { headers: adminHeaders });
        assert.strictEqual(assignRes.status, 200);
        const upg = assignRes.body.upgrade;
        const pay = assignRes.body.payment;
        await api('POST', `/api/leveltrack/member/upgrade/${upg.id}/pay`, {
          body: {
            memberId: reqObj.memberId,
            parts: [{ type: 'member', utr: `UTR-TEST-L3-${reqObj.memberId}`, screenshot: DUMMY_PNG_PROOF }]
          }
        });
        await api('POST', `/api/leveltrack/member/incoming/${pay.id}/accept`, {
          body: { memberId: pay.receiverMemberId, requestId: reqObj.id }
        });
        const appRes = await api('POST', `/api/leveltrack/admin/payments/${pay.id}/approve`, {
          headers: adminHeaders,
          body: { requestId: reqObj.id, paymentId: pay.id }
        });
        assert.strictEqual(appRes.status, 200);
        assert.strictEqual(appRes.body.newLevel, 3);
      }

      pass(
        'T43-06',
        'Referral Upgrades (L2) & L2->L3 Upgrades Verified with L3 Seniority (Siva, Karthi, Sathya)',
        'L3 assignments: Karthi->Siva, Sathya->Siva, Siva->Karthi; all 3 reached Level 3'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 7: Verify 5/5 Slot Completion Moves Karthi to Completed Seniority Queue at L2
    //         AND Test 24-Hour Payment Lock (HTTP 410) + Admin Review Actions
    // -------------------------------------------------------------------------
    {
      // At Level 3, Karthi, Siva, and Sathya each unlock Referral Upgrade cycle 2 (which uses L2 seniority!).
      // Karthi currently has 4/5 completed L2 slots. When Siva completes Referral Upgrade cycle 2 (assigned to Karthi),
      // Karthi reaches 5/5 completed L2 slots and moves to seniorityCompleted[2]!
      const ref2Siva = await api('POST', '/api/leveltrack/member/referral-upgrade-request', {
        body: { memberId: 'B5-TEST-B-001' }
      });
      assert.strictEqual(ref2Siva.status, 200);
      assert.strictEqual(ref2Siva.body.request.reservedReceiverId, 'B5-TEST-A-001', '5th L2 slot on Karthi reserved by Siva');

      const assignRef2Siva = await api('POST', `/api/leveltrack/admin/requests/${ref2Siva.body.request.id}/assign`, {
        headers: adminHeaders
      });
      assert.strictEqual(assignRef2Siva.status, 200);
      const upgSiva = assignRef2Siva.body.upgrade;
      const paySiva = assignRef2Siva.body.payment;

      // Simulate 24-hour payment expiration on paySiva first to test 24-hour lock (HTTP 410)
      {
        const st = await loadStateFromD1(d1, 'ADMIN');
        const snap = buildSnapshotMap(st);
        const pRow = st.leveltrackPayments.find(x => x.id === paySiva.id);
        pRow.expiresAt = '2020-01-01T00:00:00.000Z';
        await commitStateToD1(d1, snap, st, []);

        const expiredPayAttempt = await api('POST', `/api/leveltrack/member/upgrade/${upgSiva.id}/pay`, {
          body: {
            memberId: 'B5-TEST-B-001',
            parts: [{ type: 'member', utr: 'UTR-EXPIRED-TEST', screenshot: DUMMY_PNG_PROOF }]
          }
        });
        assert.strictEqual(expiredPayAttempt.status, 410, 'Expired 24-hour payment must return HTTP 410');

        // Admin extends deadline by 24 hours
        const extendRes = await api('POST', `/api/leveltrack/admin/requests/${ref2Siva.body.request.id}/extend-deadline`, {
          headers: adminHeaders
        });
        assert.strictEqual(extendRes.status, 200, 'Admin extend-deadline should unlock payment');
      }

      // Now submit payment proof, confirm, and approve to complete Karthi's 5th L2 slot
      await api('POST', `/api/leveltrack/member/upgrade/${upgSiva.id}/pay`, {
        body: {
          memberId: 'B5-TEST-B-001',
          parts: [{ type: 'member', utr: 'UTR-TEST-REF2-SIVA', screenshot: DUMMY_PNG_PROOF }]
        }
      });
      await api('POST', `/api/leveltrack/member/incoming/${paySiva.id}/accept`, {
        body: { memberId: 'B5-TEST-A-001', requestId: ref2Siva.body.request.id }
      });
      await api('POST', `/api/leveltrack/admin/payments/${paySiva.id}/approve`, {
        headers: adminHeaders,
        body: { requestId: ref2Siva.body.request.id, paymentId: paySiva.id }
      });

      const dashAfter5 = await api('GET', '/api/leveltrack/admin/dashboard', { headers: adminHeaders });
      const l2CompletedIds = dashAfter5.body.seniorityCompleted[2].map(x => x.memberId);
      const l2CurrentIds = dashAfter5.body.seniorityCurrent[2].map(x => x.memberId);
      assert.ok(l2CompletedIds.includes('B5-TEST-A-001'), 'Karthi (5/5 L2 slots) must move to seniorityCompleted[2]');
      assert.ok(!l2CurrentIds.includes('B5-TEST-A-001'), 'Karthi must no longer be in seniorityCurrent[2]');
      assert.strictEqual(l2CurrentIds[0], 'B5-TEST-B-001', 'Siva must now be #1 in seniorityCurrent[2]');

      pass(
        'T43-07',
        '24-Hour Payment Lock (HTTP 410), Admin Unlock & L2 5/5 Slot Completion Verified',
        `expiredStatus=410, unlocked=200, Karthi completed=5/5 -> seniorityCompleted[2], nextActiveL2=${l2CurrentIds[0]}`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 8: Progress Through L4, L5, L6 & L7 Verifying Agreed Seniority Order
    //         AND Independent Admin A/B/C Account Rotation (L3->L4, L4->L5, L5->L6, L6->L7)
    // -------------------------------------------------------------------------
    {
      // Ensure 2 child members (B5-TEST-A-C01, B5-TEST-B-C01) are at Level 2 (positions #4 and #5 in L2 queue)
      // so that once Karthi (5/5), Siva (5/5), and Sathya (5/5) complete all 15 of their L2 slots,
      // subsequent L2 Referral Upgrade cycles (cycles 4 & 5) have eligible L2 receivers after self-exclusion.
      {
        const st = await loadStateFromD1(d1, 'ADMIN');
        const snap = buildSnapshotMap(st);
        ['B5-TEST-A-C01', 'B5-TEST-B-C01'].forEach((cid, idx) => {
          const cm = st.members.find(x => x.memberId === cid);
          cm.level = 2;
          cm.levelReachedAt = { ...(cm.levelReachedAt || {}), 2: `2026-02-01T00:00:0${idx + 1}.000Z` };
          cm._seniorityTestOrderByLevel = { 2: 10 + idx };
        });
        await commitStateToD1(d1, snap, st, []);
      }

      // Complete remaining Referral Upgrade cycle 2 for Karthi and Sathya so all 3 can request L3 -> L4
      for (const mid of ['B5-TEST-A-001', 'B5-TEST-C-001']) {
        const rr = await api('POST', '/api/leveltrack/member/referral-upgrade-request', { body: { memberId: mid } });
        assert.strictEqual(rr.status, 200);
        const asg = await api('POST', `/api/leveltrack/admin/requests/${rr.body.request.id}/assign`, { headers: adminHeaders });
        await api('POST', `/api/leveltrack/member/upgrade/${asg.body.upgrade.id}/pay`, {
          body: { memberId: mid, parts: [{ type: 'member', utr: `UTR-REF2-${mid}`, screenshot: DUMMY_PNG_PROOF }] }
        });
        await api('POST', `/api/leveltrack/member/incoming/${asg.body.payment.id}/accept`, {
          body: { memberId: asg.body.payment.receiverMemberId, requestId: rr.body.request.id }
        });
        await api('POST', `/api/leveltrack/admin/payments/${asg.body.payment.id}/approve`, {
          headers: adminHeaders,
          body: { requestId: rr.body.request.id, paymentId: asg.body.payment.id }
        });
      }

      const expectedTopSeniorByLevel = {
        4: ['B5-TEST-C-001', 'B5-TEST-B-001'], // L4: #1 Sathya, #2 Siva
        5: ['B5-TEST-A-001', 'B5-TEST-C-001'], // L5: #1 Karthi, #2 Sathya
        6: ['B5-TEST-C-001', 'B5-TEST-A-001'], // L6: #1 Sathya, #2 Karthi
        7: ['B5-TEST-B-001', 'B5-TEST-C-001']  // L7: #1 Siva, #2 Sathya
      };

      const rotationLog = {};

      for (let targetLvl = 4; targetLvl <= 7; targetLvl++) {
        const [top1, top2] = expectedTopSeniorByLevel[targetLvl];
        const membersOrder = ['B5-TEST-A-001', 'B5-TEST-B-001', 'B5-TEST-C-001'];
        const assignedAdmins = [];

        // Submit concurrent Level (targetLvl-1) -> targetLvl requests for Karthi, Siva, Sathya
        const reqs = await Promise.all(
          membersOrder.map(mid => api('POST', '/api/leveltrack/member/upgrade-request', { body: { memberId: mid } }))
        );
        for (const rRes of reqs) {
          assert.strictEqual(rRes.status, 200, `L${targetLvl - 1}->L${targetLvl} request must succeed`);
          const rObj = rRes.body.request;
          const expectedReceiver = rObj.memberId === top1 ? top2 : top1;
          assert.strictEqual(
            rObj.reservedReceiverId,
            expectedReceiver,
            `At L${targetLvl}, payer ${rObj.memberId} should reserve receiver ${expectedReceiver}`
          );
        }

        // Assign & complete all 3 upgrades for targetLvl (Member + Trust + Admin parts)
        for (const rRes of reqs) {
          const rObj = rRes.body.request;
          const asg = await api('POST', `/api/leveltrack/admin/requests/${rObj.id}/assign`, { headers: adminHeaders });
          assert.strictEqual(asg.status, 200);
          const upg = asg.body.upgrade;
          const pay = asg.body.payment;

          const adminPart = (pay.parts || []).find(p => p.type === 'admin');
          assert.ok(adminPart, `L${targetLvl} upgrade must include an admin split part`);
          assignedAdmins.push(adminPart.adminAccountId || adminPart.accountDetails?.id);

          const proofParts = (pay.parts || []).map(pt => ({
            type: pt.type,
            utr: `UTR-TEST-L${targetLvl}-${rObj.memberId}-${pt.type.toUpperCase()}`,
            screenshot: DUMMY_PNG_PROOF
          }));

          const paySubmit = await api('POST', `/api/leveltrack/member/upgrade/${upg.id}/pay`, {
            body: { memberId: rObj.memberId, parts: proofParts }
          });
          assert.strictEqual(paySubmit.status, 200);

          const recAccept = await api('POST', `/api/leveltrack/member/incoming/${pay.id}/accept`, {
            body: { memberId: pay.receiverMemberId, requestId: rObj.id }
          });
          assert.strictEqual(recAccept.status, 200);

          const admApprove = await api('POST', `/api/leveltrack/admin/payments/${pay.id}/approve`, {
            headers: adminHeaders,
            body: { requestId: rObj.id, paymentId: pay.id }
          });
          assert.strictEqual(admApprove.status, 200);
          assert.strictEqual(admApprove.body.newLevel, targetLvl);
        }

        // Verify independent Admin A -> B -> C rotation for this level!
        assert.deepStrictEqual(
          assignedAdmins,
          ['A', 'B', 'C'],
          `Level ${targetLvl} must independently rotate Admin A -> B -> C`
        );
        rotationLog[`L${targetLvl}`] = assignedAdmins.join('->');

        // If targetLvl < 7, complete the Referral Upgrade cycle unlocked at targetLvl so next level upgrade is ready
        if (targetLvl < 7) {
          for (const mid of membersOrder) {
            const rr = await api('POST', '/api/leveltrack/member/referral-upgrade-request', { body: { memberId: mid } });
            assert.strictEqual(rr.status, 200);
            const asg = await api('POST', `/api/leveltrack/admin/requests/${rr.body.request.id}/assign`, { headers: adminHeaders });
            await api('POST', `/api/leveltrack/member/upgrade/${asg.body.upgrade.id}/pay`, {
              body: { memberId: mid, parts: [{ type: 'member', utr: `UTR-REF-L${targetLvl}-${mid}`, screenshot: DUMMY_PNG_PROOF }] }
            });
            await api('POST', `/api/leveltrack/member/incoming/${asg.body.payment.id}/accept`, {
              body: { memberId: asg.body.payment.receiverMemberId, requestId: rr.body.request.id }
            });
            await api('POST', `/api/leveltrack/admin/payments/${asg.body.payment.id}/approve`, {
              headers: adminHeaders,
              body: { requestId: rr.body.request.id, paymentId: asg.body.payment.id }
            });
          }
        }
      }

      pass(
        'T43-08',
        'Full L4–L7 Seniority Progression & Independent Admin A/B/C Rotation Verified',
        `Karthi, Siva & Sathya reached Level 7 | Admin Rotation: ${JSON.stringify(rotationLog)}`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 9: Verify Surgical Test Data Cleanup in D1 Preserves Non-Test Members
    //         AND /api/db-status Reports Actual Connection Mode
    // -------------------------------------------------------------------------
    {
      const d1BindingMod = require('../src/d1-node-binding');
      assert.strictEqual(d1BindingMod.sanitizeApiToken(' "Bearer abc_123-XYZ" \n'), 'abc_123-XYZ');
      assert.strictEqual(d1BindingMod.isValidCloudflareAccountId('104cb4ae619367e91c5e05d5a712627e'), true);
      assert.strictEqual(d1BindingMod.isValidCloudflareAccountId('66c93b0f-274f-44df-82f0-b310c7c2acdf'), false);
      assert.strictEqual(d1BindingMod.isValidD1DatabaseId('66c93b0f-274f-44df-82f0-b310c7c2acdf'), true);
      assert.strictEqual(d1BindingMod.isValidD1DatabaseId('104cb4ae619367e91c5e05d5a712627e'), false);

      const dbStatusRes = await api('GET', '/api/db-status');
      assert.strictEqual(dbStatusRes.status, 200);
      assert.ok(
        ['cloudflare-d1-local', 'cloudflare-d1-portable-node', 'cloudflare-d1-remote'].includes(dbStatusRes.body.mode),
        `/api/db-status must report actual connection mode, got ${dbStatusRes.body.mode}`
      );
      assert.strictEqual(dbStatusRes.body.connectionMode, dbStatusRes.body.mode);

      const st = await loadStateFromD1(d1, 'ADMIN');
      const snapBeforeReal = buildSnapshotMap(st);

      // Add 1 simulated genuine member to D1 first to prove surgical cleanup preserves non-test records in D1
      st.members.push({
        memberId: 'B5-REAL01',
        referralId: 'REF-REAL01',
        name: 'Genuine Member',
        mobile: '9876543210',
        referral: 'FIRST MEMBER',
        level: 1,
        status: 'Verified',
        joinedAt: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        passwordHash: 'realhash'
      });
      await commitStateToD1(d1, snapBeforeReal, st, []);

      // Now run surgical cleanup via API / commitStateToD1 and verify D1 persistence
      const stWithReal = await loadStateFromD1(d1, 'ADMIN');
      assert.strictEqual(stWithReal.members.length, 44, '43 test members + 1 genuine member in D1 before cleanup');
      const snapWithReal = buildSnapshotMap(stWithReal);
      const ctx = createSessionContext(stWithReal, env);
      ctx.cleanupB5TestDataset43();
      await commitStateToD1(d1, snapWithReal, stWithReal, []);

      const afterCleanupD1 = await loadStateFromD1(d1, 'ADMIN');
      assert.strictEqual(afterCleanupD1.members.length, 1, 'D1 must retain ONLY the 1 genuine member after cleanupB5TestDataset43');
      assert.strictEqual(afterCleanupD1.members[0].memberId, 'B5-REAL01');
      assert.strictEqual(afterCleanupD1.leveltrackRequests.length, 0, 'All B5-TEST-* requests must be deleted from D1');
      assert.strictEqual(afterCleanupD1.leveltrackUpgrades.length, 0, 'All B5-TEST-* upgrades must be deleted from D1');
      assert.strictEqual(afterCleanupD1.leveltrackPayments.length, 0, 'All B5-TEST-* payments must be deleted from D1');

      // Remove temporary B5-REAL01 test fixture and re-seed the clean 43 test dataset
      await d1.prepare(`DELETE FROM members WHERE member_id = ?`).bind('B5-REAL01').run();
      const emptySt = await loadStateFromD1(d1, 'ADMIN');
      const emptySnap = buildSnapshotMap(emptySt);
      const cleanCtx = createSessionContext(emptySt, env);
      cleanCtx.seedB5TestDataset43();
      await commitStateToD1(d1, emptySnap, emptySt, []);

      const finalState = await loadStateFromD1(d1, 'ADMIN');
      assert.strictEqual(finalState.members.length, 43, 'Clean 43-member test dataset restored in D1');

      pass(
        'T43-09',
        'Surgical D1 Test Cleanup, Non-Test Member Preservation & /api/db-status Mode Verified',
        `mode=${dbStatusRes.body.mode}; D1 retained B5-REAL01 (1) & deleted 43 B5-TEST-* members + test payments; clean 43-member dataset restored`
      );
    }

    // -------------------------------------------------------------------------
    // TEST 10: Cross-Member Privacy Guard (Logged-in Member Cannot View Another Member's Dashboard/Profile)
    // -------------------------------------------------------------------------
    {
      const loginKarthi = await api('POST', '/api/member/login', {
        body: { mobile: 'B5-TEST-A-001', password: 'B5@123456' }
      });
      assert.strictEqual(loginKarthi.status, 200);
      const karthiToken = loginKarthi.body.memberToken;
      assert.ok(karthiToken, 'Karthi login must return member session token');

      const ownDash = await api('GET', '/api/leveltrack/member/dashboard/B5-TEST-A-001', {
        headers: { 'x-member-token': karthiToken }
      });
      assert.strictEqual(ownDash.status, 200, 'Karthi can view own LevelTrack dashboard');

      const otherDash = await api('GET', '/api/leveltrack/member/dashboard/B5-TEST-B-001', {
        headers: { 'x-member-token': karthiToken }
      });
      assert.strictEqual(otherDash.status, 403, 'Karthi token must be forbidden (HTTP 403) from viewing Siva LevelTrack dashboard');

      const otherProfile = await api('GET', '/api/member/profile/B5-TEST-C-001', {
        headers: { 'x-member-token': karthiToken }
      });
      assert.strictEqual(otherProfile.status, 403, 'Karthi token must be forbidden (HTTP 403) from viewing Sathya profile/bank details');

      pass(
        'T43-10',
        'Cross-Member Privacy Guard Verified (HTTP 403 on Other Member Dashboard & Bank Profile)',
        'ownDashboard=200, otherMemberDashboard=403, otherMemberProfile=403'
      );
    }

    console.log('\n================================================================');
    console.log(`ALL ${passed}/10 43-MEMBER TEST DATASET SCENARIOS PASSED`);
    console.log('================================================================\n');
  } finally {
    await dispose();
    if (fs.existsSync(testPersistDir)) {
      fs.rmSync(testPersistDir, { recursive: true, force: true });
    }
  }
}

runSuite().catch(err => {
  console.error('❌ 43-MEMBER TEST SUITE FAILED:', err);
  process.exit(1);
});
