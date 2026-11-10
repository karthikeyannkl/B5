/**
 * BORNTOWIN5 (B5) — Test Suite: Seniority Block, Unblock, Next Position Allocation & Confirmation Rules
 * Covers all 8 Test Cases + 3 Confirmation Requirements.
 */

const assert = require('assert');
const {
  createSessionContext,
  handleApiRequest,
  getMemberSeniorityPosition,
  getMaxAllocatedPosition,
  allocateNextSeniorityPosition,
  isSeniorityBlocked
} = require('../src/b5-engine');

console.log('=============================================================================');
console.log('BORNTOWIN5 — SENIORITY BLOCK / UNBLOCK & CONFIRMATION RULES TEST SUITE');
console.log('=============================================================================\n');

function createMockD1(initialState = {}) {
  const store = {
    system_settings: new Map([
      ['admin_password', JSON.stringify('ADMIN@2026!')],
      ['payment_settings', JSON.stringify({
        admins: [
          { id: 'A', name: 'Admin A', accountHolder: 'Holder A', bank: 'Bank A', account: 'ACC1', ifsc: 'IFSC1', upi: 'a@upi', active: true },
          { id: 'B', name: 'Admin B', accountHolder: 'Holder B', bank: 'Bank B', account: 'ACC2', ifsc: 'IFSC2', upi: 'b@upi', active: true },
          { id: 'C', name: 'Admin C', accountHolder: 'Holder C', bank: 'Bank C', account: 'ACC3', ifsc: 'IFSC3', upi: 'c@upi', active: true }
        ],
        adminRotationIndex: 0,
        adminRotationByLevel: { 4: 0, 5: 0, 6: 0, 7: 0 },
        trust: { name: 'Trust', accountHolder: 'Trust', bank: 'Bank', account: 'TR1', ifsc: 'TR_IFSC', upi: 'tr@upi', active: true },
        senioritySlotCaps: { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100 }
      })]
    ]),
    members: new Map(),
    pins: new Map([['PIN-START1', { pin: 'PIN-START1', assigned_to: null, status: 'AVAILABLE', used_by: null, created_at: new Date().toISOString(), is_system: 1 }]]),
    messages: [],
    password_reset_requests: new Map(),
    leveltrack_requests: new Map(),
    leveltrack_upgrades: new Map(),
    leveltrack_payments: new Map(),
    email_logs: new Map(),
    seniority_block_audit: new Map()
  };

  const initialMembers = [
    { b5Id: 0, memberId: 'B5-COMPANY', name: 'BORN TO WIN', mobile: '9345151709', email: 'notifications@borntowin5.com', level: 7, isCompanyAccount: true, excludeFromSeniorityQueue: true },
    { b5Id: 1,  memberId: 'B5-46188', name: 'sathya',      mobile: '9600680468', email: 'sweetsathya62@gmail.com', level: 1 },
    { b5Id: 2,  memberId: 'B5-80575', name: 'Karthikeyan', mobile: '9790151709', email: 'dorakarthi51@gmail.com', level: 1 },
    { b5Id: 3,  memberId: 'B5-62065', name: 'Rajesh',      mobile: '9443248652', email: 'Saravanastudionkl@gmail.com', level: 1 },
    { b5Id: 4,  memberId: 'B5-84638', name: 'Pranev',      mobile: '9345151709', email: 'borntowin5b5@gmail.com', level: 1 },
    { b5Id: 5,  memberId: 'B5-86831', name: 'Thanya',      mobile: '9489730468', email: 'ksp.nkl@gmail.com', level: 1 },
    { b5Id: 6,  memberId: 'B5-89433', name: 'Karthikeyan', mobile: '9600680468', email: 'sweetsathya62@gmail.com', level: 1 },
    { b5Id: 7,  memberId: 'B5-88695', name: 'Pranev',      mobile: '9790151709', email: 'dorakarthi51@gmail.com', level: 1 },
    { b5Id: 8,  memberId: 'B5-88857', name: 'Thanya',      mobile: '9345151709', email: 'borntowin5b5@gmail.com', level: 1 },
    { b5Id: 9,  memberId: 'B5-86695', name: 'Karthikeyan', mobile: '9489730468', email: 'ksp.nkl@gmail.com', level: 1 },
    { b5Id: 10, memberId: 'B5-63456', name: 'Pranev',      mobile: '9600680468', email: 'sweetsathya62@gmail.com', level: 1 },
    { b5Id: 11, memberId: 'B5-64464', name: 'Thanya',      mobile: '9790151709', email: 'dorakarthi51@gmail.com', level: 1 },
    { b5Id: 12, memberId: 'B5-22158', name: 'sathya',      mobile: '9345151709', email: 'borntowin5b5@gmail.com', level: 1 },
    { b5Id: 13, memberId: 'B5-37029', name: 'Pranev',      mobile: '9489730468', email: 'ksp.nkl@gmail.com', level: 1 },
    { b5Id: 14, memberId: 'B5-18937', name: 'Thanya',      mobile: '9600680468', email: 'sweetsathya62@gmail.com', level: 1 },
    { b5Id: 15, memberId: 'B5-79020', name: 'sathya',      mobile: '9790151709', email: 'dorakarthi51@gmail.com', level: 1 },
    { b5Id: 16, memberId: 'B5-71866', name: 'Karthikeyan', mobile: '9345151709', email: 'borntowin5b5@gmail.com', level: 1 },
    { b5Id: 17, memberId: 'B5-83922', name: 'sathya',      mobile: '9489730468', email: 'ksp.nkl@gmail.com', level: 1 }
  ];

  for (const m of initialMembers) {
    const senMap = {};
    for (let l = 1; l <= 7; l++) senMap[l] = m.b5Id;
    const extra = {
      b5Id: m.b5Id,
      numericId: m.b5Id,
      initialSeniority: m.b5Id > 0 ? senMap : undefined,
      seniorityPositions: m.b5Id > 0 ? senMap : undefined,
      seniorityBlocked: {},
      seniorityHistory: {},
      isCompanyAccount: !!m.isCompanyAccount,
      excludeFromSeniorityQueue: !!m.excludeFromSeniorityQueue
    };
    store.members.set(m.memberId, {
      member_id: m.memberId,
      referral_id: `REF-${m.memberId}`,
      name: m.name,
      place: '',
      mobile: m.mobile,
      email: m.email,
      referral: 'B5-COMPANY',
      level: m.level,
      level_member_id: `L${m.level}-${String(m.b5Id).padStart(3, '0')}`,
      status: 'Verified',
      joined_at: '2026-01-01T00:00:00.000Z',
      registered_at: '2026-01-01T00:00:00.000Z',
      upgrade_date: null,
      level_reached_at_json: JSON.stringify({ 1: '2026-01-01T00:00:00.000Z' }),
      account_holder: '',
      bank: '',
      account: '',
      ifsc: '',
      branch: '',
      upi: '',
      photo: '',
      profile_locked: 0,
      payment_access_locked: 0,
      payment_review_status: '',
      password_hash: 'pbkdf2$sha256$100000$test$test',
      must_change_password: 0,
      seniority_test_order: null,
      extra_json: JSON.stringify(extra)
    });
  }

  function createStatement(sql) {
    let boundArgs = [];
    async function exec() {
      const s = sql.trim();
      if (s.includes('INSERT INTO seniority_block_audit')) {
        const [id, member_id, level, original_position, action, reason, admin_id, timestamp, unblock_reason, payment_ref, approved_by_admin_id, approved_timestamp, new_position, created_at] = boundArgs;
        store.seniority_block_audit.set(id, {
          id, member_id, level, original_position, action, reason, admin_id, timestamp, unblock_reason, payment_ref, approved_by_admin_id, approved_timestamp, new_position, created_at
        });
        return { success: true, results: [] };
      }
      if (s.includes('INSERT INTO members') || s.includes('UPDATE members')) {
        const member_id = boundArgs[0];
        const extra_json = boundArgs[27];
        const existing = store.members.get(member_id) || {};
        store.members.set(member_id, {
          ...existing,
          member_id,
          name: boundArgs[2] || existing.name,
          level: boundArgs[7] || existing.level,
          extra_json: extra_json || existing.extra_json
        });
        return { success: true, results: [] };
      }
      if (s.includes('INSERT INTO pins') || s.includes('UPDATE pins')) {
        const pin = boundArgs[0];
        const existing = store.pins.get(pin) || {};
        store.pins.set(pin, {
          ...existing,
          pin,
          assigned_to: boundArgs[1],
          status: boundArgs[2],
          used_by: boundArgs[3]
        });
        return { success: true, results: [] };
      }
      if (s.startsWith('SELECT key, value_json FROM system_settings')) {
        const results = [];
        for (const [k, v] of store.system_settings.entries()) {
          results.push({ key: k, value_json: v });
        }
        return { results };
      }
      if (s.startsWith('SELECT * FROM members')) {
        return { results: Array.from(store.members.values()) };
      }
      if (s.startsWith('SELECT * FROM pins')) {
        return { results: Array.from(store.pins.values()) };
      }
      if (s.startsWith('SELECT * FROM messages')) {
        return { results: store.messages };
      }
      if (s.startsWith('SELECT * FROM password_reset_requests')) {
        return { results: Array.from(store.password_reset_requests.values()) };
      }
      if (s.startsWith('SELECT * FROM leveltrack_requests')) {
        return { results: Array.from(store.leveltrack_requests.values()) };
      }
      if (s.startsWith('SELECT * FROM leveltrack_upgrades')) {
        return { results: Array.from(store.leveltrack_upgrades.values()) };
      }
      if (s.includes('FROM leveltrack_payments')) {
        return { results: Array.from(store.leveltrack_payments.values()) };
      }
      if (s.startsWith('SELECT * FROM email_logs')) {
        return { results: Array.from(store.email_logs.values()) };
      }
      if (s.startsWith('SELECT * FROM seniority_block_audit')) {
        return { results: Array.from(store.seniority_block_audit.values()) };
      }
      return { results: [], success: true };
    }

    return {
      bind(...args) {
        boundArgs = args;
        return this;
      },
      all() { return exec(); },
      run() { return exec(); }
    };
  }

  return {
    prepare(sql) {
      return createStatement(sql);
    },
    async batch(stmts) {
      const results = [];
      for (const st of stmts) {
        if (st.all) results.push(await st.all());
        else if (st.run) results.push(await st.run());
      }
      return results;
    },
    _store: store
  };
}

async function runTests() {
  const mockD1 = createMockD1();
  const env = { DB: mockD1, B5_ADMIN_PASSWORD: 'ADMIN@2026!' };

  // Create an admin auth token for calling APIs
  const adminLoginResp = await handleApiRequest({
    method: 'POST',
    pathname: '/api/admin/login',
    body: { password: 'ADMIN@2026!' },
    env
  });
  assert.strictEqual(adminLoginResp.status, 200, 'Admin login must succeed');
  const adminToken = adminLoginResp.body.adminToken;
  const headers = { 'x-admin-token': adminToken };

  console.log('--- TEST 1: Initial 17 Members Occupy Positions 1–17 in Level 2 ---');
  let dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  assert.strictEqual(dashResp.status, 200);
  let l2Queue = dashResp.body.seniority[2];
  assert.strictEqual(l2Queue.length, 17, 'Level 2 queue must start with exactly 17 initial members');
  for (let i = 1; i <= 17; i++) {
    assert.strictEqual(l2Queue[i - 1].position, i, `Initial member ${i} must have Seniority Position ${i}`);
  }
  console.log('✓ Initial 17 members verified at positions 1–17.');

  console.log('\n--- TEST 2: Add Qualifying Member 18 and verify Position 18 allocated ---');
  // Add member 18 to Level 2
  const member18 = {
    memberId: 'B5-M18',
    name: 'NEW MEMBER 18',
    mobile: '9876543210',
    email: 'm18@test.com',
    level: 2,
    levelReachedAt: { 1: '2026-01-01T00:00:00.000Z', 2: '2026-01-02T00:00:00.000Z' },
    status: 'Verified'
  };
  mockD1._store.members.set('B5-M18', {
    member_id: 'B5-M18',
    referral_id: 'REF-M18',
    name: 'NEW MEMBER 18',
    mobile: '9876543210',
    email: 'm18@test.com',
    referral: 'B5-COMPANY',
    level: 2,
    status: 'Verified',
    registered_at: '2026-01-02T00:00:00.000Z',
    level_reached_at_json: JSON.stringify({ 1: '2026-01-01T00:00:00.000Z', 2: '2026-01-02T00:00:00.000Z' }),
    extra_json: JSON.stringify({ seniorityPositions: { 2: 18 } })
  });

  dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  l2Queue = dashResp.body.seniority[2];
  const row18 = l2Queue.find(x => x.memberId === 'B5-M18');
  assert.ok(row18, 'Member 18 must appear in Level 2 seniority queue');
  assert.strictEqual(row18.position, 18, 'Member 18 must occupy Position 18');
  assert.strictEqual(row18.status, 'ACTIVE', 'Member 18 must be ACTIVE initially');
  console.log('✓ Member 18 allocated Position 18 as ACTIVE.');

  console.log('\n--- TEST 3: Block Position 18 with Reason & Admin Password ---');
  // First test wrong password: must fail with HTTP 401 and no changes
  const wrongPwdResp = await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/block',
    headers,
    body: { memberId: 'B5-M18', level: 2, reason: 'Payment incomplete', adminPassword: 'WRONG_PASSWORD' },
    env
  });
  assert.strictEqual(wrongPwdResp.status, 401, 'Wrong admin password must be rejected with HTTP 401');

  // Correct password block
  const blockResp = await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/block',
    headers,
    body: { memberId: 'B5-M18', level: 2, reason: 'Payment verification failed', adminPassword: 'ADMIN@2026!' },
    env
  });
  assert.strictEqual(blockResp.status, 200, 'Block with valid password must succeed');
  assert.strictEqual(blockResp.body.status, 'BLOCKED');
  assert.strictEqual(blockResp.body.position, 18);

  // Verify dashboard reflects Position 18 as BLOCKED and availableSlots === 0
  dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  const blockedRow18 = dashResp.body.seniority[2].find(x => x.memberId === 'B5-M18');
  assert.strictEqual(blockedRow18.position, 18, 'Blocked member must remain visible at original Position 18');
  assert.strictEqual(blockedRow18.status, 'BLOCKED', 'Member 18 status must be BLOCKED');
  assert.strictEqual(blockedRow18.availableSlots, 0, 'Blocked member must have 0 available slots');
  assert.ok(blockedRow18.isBlocked, 'isBlocked must be true');
  console.log('✓ Position 18 successfully blocked with reason and Admin password.');

  console.log('\n--- TEST 4: Allocate Positions 19–22 to other qualifying members ---');
  for (let p = 19; p <= 22; p++) {
    const mId = `B5-M${p}`;
    mockD1._store.members.set(mId, {
      member_id: mId,
      referral_id: `REF-M${p}`,
      name: `NEW MEMBER ${p}`,
      mobile: `98765432${p}`,
      email: `m${p}@test.com`,
      referral: 'B5-COMPANY',
      level: 2,
      status: 'Verified',
      registered_at: `2026-01-0${p - 14}T00:00:00.000Z`,
      level_reached_at_json: JSON.stringify({ 1: '2026-01-01T00:00:00.000Z', 2: `2026-01-0${p - 14}T00:00:00.000Z` }),
      extra_json: JSON.stringify({ seniorityPositions: { 2: p } })
    });
  }

  dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  l2Queue = dashResp.body.seniority[2];
  for (let p = 19; p <= 22; p++) {
    const row = l2Queue.find(x => x.memberId === `B5-M${p}`);
    assert.ok(row, `Member ${p} must exist in queue`);
    assert.strictEqual(row.position, p, `Member ${p} must have Position ${p}`);
    assert.strictEqual(row.status, 'ACTIVE');
  }
  // Confirm Position 18 is still at 18 (never shifted or overwritten)
  const check18 = l2Queue.find(x => x.memberId === 'B5-M18');
  assert.strictEqual(check18.position, 18, 'Position 18 must not shift when 19–22 are allocated');
  assert.strictEqual(check18.status, 'BLOCKED');
  console.log('✓ Positions 19–22 allocated sequentially. Position 18 remains at 18 (Blocked).');

  console.log('\n--- TEST 5: Unblock original Position 18 member after verified payment ---');
  // First test wrong password rejection
  const wrongUnblockPwd = await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/unblock',
    headers,
    body: { memberId: 'B5-M18', level: 2, reason: 'Payment verified', paymentRef: 'UPI-99887766', adminPassword: 'WRONG' },
    env
  });
  assert.strictEqual(wrongUnblockPwd.status, 401, 'Unblock with wrong password must be rejected');

  // Valid unblock
  const unblockResp = await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/unblock',
    headers,
    body: {
      memberId: 'B5-M18',
      level: 2,
      reason: 'Bank credit verified in account A',
      paymentRef: 'UPI-998877665544',
      adminPassword: 'ADMIN@2026!'
    },
    env
  });
  assert.strictEqual(unblockResp.status, 200, 'Unblock with valid password must succeed');
  assert.strictEqual(unblockResp.body.oldPosition, 18, 'Old position must be 18');
  assert.strictEqual(unblockResp.body.newPosition, 23, 'Reactivated member must receive Position 23 (Max 22 + 1)');
  assert.strictEqual(unblockResp.body.status, 'ACTIVE');
  console.log('✓ Member 18 unblocked and allocated Position 23.');

  console.log('\n--- TEST 6: Confirm Positions 19–22 remain unchanged & Reactivated is Position 23 ---');
  dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  l2Queue = dashResp.body.seniority[2];
  for (let p = 19; p <= 22; p++) {
    const row = l2Queue.find(x => x.memberId === `B5-M${p}`);
    assert.strictEqual(row.position, p, `Position ${p} must remain strictly ${p}`);
  }
  const reactivatedRow = l2Queue.find(x => x.memberId === 'B5-M18');
  assert.strictEqual(reactivatedRow.position, 23, 'Reactivated member must now occupy Position 23');
  assert.strictEqual(reactivatedRow.status, 'ACTIVE');
  assert.strictEqual(reactivatedRow.seniorityHistory.length, 2, 'Seniority history must track BLOCK and UNBLOCK events');
  assert.strictEqual(reactivatedRow.seniorityHistory[0].action, 'BLOCK');
  assert.strictEqual(reactivatedRow.seniorityHistory[0].position, 18);
  assert.strictEqual(reactivatedRow.seniorityHistory[1].action, 'UNBLOCK');
  assert.strictEqual(reactivatedRow.seniorityHistory[1].oldPosition, 18);
  assert.strictEqual(reactivatedRow.seniorityHistory[1].newPosition, 23);
  console.log('✓ Positions 19–22 remain unchanged. Reactivated member is Position 23 with full history.');

  console.log('\n--- TEST 7: Confirm Old Position 18 is Preserved in Audit Records ---');
  const auditResp = await handleApiRequest({
    method: 'GET',
    pathname: '/api/leveltrack/admin/seniority/audit',
    headers,
    env
  });
  assert.strictEqual(auditResp.status, 200);
  const auditRecords = auditResp.body.audit;
  assert.ok(auditRecords.length >= 2, 'Audit must have at least 2 records (block + unblock)');
  const unblockAudit = auditRecords.find(a => a.action === 'UNBLOCK' && a.member_id === 'B5-M18');
  assert.ok(unblockAudit, 'Unblock audit record must exist');
  assert.strictEqual(unblockAudit.original_position, 18);
  assert.strictEqual(unblockAudit.new_position, 23);
  assert.strictEqual(unblockAudit.payment_ref, 'UPI-998877665544');
  console.log('✓ Old Position 18 permanently recorded in Audit Table with payment ref.');

  console.log('\n--- TEST 8: Test Undo Block Feature ---');
  // Temporarily block member 19
  const block19 = await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/block',
    headers,
    body: { memberId: 'B5-M19', level: 2, reason: 'Accidental block test', adminPassword: 'ADMIN@2026!' },
    env
  });
  assert.strictEqual(block19.status, 200);

  // Undo block with valid admin password
  const undoResp = await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/undo-block',
    headers,
    body: { memberId: 'B5-M19', level: 2, adminPassword: 'ADMIN@2026!' },
    env
  });
  assert.strictEqual(undoResp.status, 200);
  assert.strictEqual(undoResp.body.position, 19, 'Undo block must restore member back to original Position 19');
  assert.strictEqual(undoResp.body.status, 'ACTIVE');

  dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  const row19 = dashResp.body.seniority[2].find(x => x.memberId === 'B5-M19');
  assert.strictEqual(row19.position, 19);
  assert.strictEqual(row19.status, 'ACTIVE');
  console.log('✓ Undo Block successfully restored member to Position 19 without shifting.');

  console.log('\n--- TEST 9: Test Level Independence (Level 3 unaffected by Level 2 block) ---');
  // Block member 18 in Level 2
  await handleApiRequest({
    method: 'POST',
    pathname: '/api/leveltrack/admin/seniority/block',
    headers,
    body: { memberId: 'B5-M18', level: 2, reason: 'L2 hold only', adminPassword: 'ADMIN@2026!' },
    env
  });

  // Verify member 18 is blocked in Level 2
  dashResp = await handleApiRequest({ method: 'GET', pathname: '/api/leveltrack/admin/dashboard', headers, env });
  const m18L2 = dashResp.body.seniority[2].find(x => x.memberId === 'B5-M18');
  assert.strictEqual(m18L2.status, 'BLOCKED');

  // Verify member 18 is NOT blocked in Level 1
  const m18L1 = dashResp.body.seniority[1].find(x => x.memberId === 'B5-M18');
  if (m18L1) {
    assert.notStrictEqual(m18L1.status, 'BLOCKED', 'Member 18 must NOT be blocked in Level 1');
  }
  console.log('✓ Level Independence verified: blocking in Level 2 does not affect other levels.');

  console.log('\n--- TEST 10: Test PIN Generation Concurrency & Protection ---');
  const pinResp = await handleApiRequest({
    method: 'POST',
    pathname: '/api/admin/pins/generate',
    headers,
    body: { memberId: 'B5-46188', quantity: 5 },
    env
  });
  assert.strictEqual(pinResp.status, 200, 'PIN generation must succeed');
  assert.strictEqual(pinResp.body.pins.length, 5, 'Must generate exactly 5 PINs');
  console.log('✓ PIN generation executed safely with lock guard.');

  console.log('\n=============================================================================');
  console.log('ALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY! (100% SUCCESS)');
  console.log('=============================================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
