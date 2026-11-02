/**
 * BORNTOWIN5 (B5) — Safe Isolated Staging Test Data Reset & Seed Script
 *
 * SAFETY GUARDRAILS:
 * 1. Requires B5_LOCAL_TEST_ONLY=1 (defaults to '1' only for isolated staging file inside tests/).
 * 2. Refuses to execute if NODE_ENV === 'production' or if SUPABASE_SECRET_KEY is set without B5_LOCAL_TEST_ONLY=1.
 * 3. Refuses to overwrite f:\B5 RK\db.json or f:\B5 RK\data\db.json.
 * 4. Writes only to tests/local-review-db.json (or a custom path inside tests/).
 *
 * Seeds deterministic test fixtures:
 * - Root Company Account (B5-FC329E) + 10 Seniority Test IDs (KARTHI01..KARTHI10)
 * - 2 Root Accounts each with 13 referral descendants (B5-MOBTEST01 with M1T01..M1T13, B5-MOBTEST02 with M2T01..M2T13)
 * - Controlled Seniority Queue across L2-L7 (L2:5, L3:10, L4:10, L5:5, L6:5, L7:5)
 * - 5 Distinct Payment Submissions to the same receiver (B5-FC329E) with distinct screenshots, UTRs, Payment IDs & Request IDs
 * - Pending, Approved, Rejected, and Expired upgrade requests
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROD_DB_ROOT = path.resolve(ROOT_DIR, 'db.json');
const PROD_DB_DATA = path.resolve(ROOT_DIR, 'data', 'db.json');
const PROD_D1_STATE = path.resolve(ROOT_DIR, '.wrangler', 'state', 'v3', 'd1');

function verifyNonProductionSafety(targetDbPath) {
  const resolved = path.resolve(targetDbPath);
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('ABORTED: Staging reset script cannot run when NODE_ENV=production.');
  }
  if (process.env.B5_LOCAL_TEST_ONLY === '0') {
    throw new Error('ABORTED: Staging reset script requires B5_LOCAL_TEST_ONLY=1.');
  }
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.B5_LOCAL_TEST_ONLY !== '1') {
    throw new Error('ABORTED: CLOUDFLARE_API_TOKEN detected without B5_LOCAL_TEST_ONLY=1. Refusing to run.');
  }
  if (process.env.SUPABASE_SECRET_KEY && process.env.B5_LOCAL_TEST_ONLY !== '1') {
    throw new Error('ABORTED: SUPABASE_SECRET_KEY detected without B5_LOCAL_TEST_ONLY=1. Refusing to run.');
  }
  if (resolved === PROD_DB_ROOT || resolved === PROD_DB_DATA || resolved.startsWith(PROD_D1_STATE)) {
    throw new Error(`ABORTED: Target database path (${resolved}) points to a primary/production database.`);
  }
  if (!resolved.startsWith(path.resolve(__dirname))) {
    throw new Error(`ABORTED: Staging reset target (${resolved}) must reside inside the tests/ directory.`);
  }
}

function hashPassword(v) {
  return crypto.createHash('sha256').update(String(v || '')).digest('hex');
}
function referralCode(memberId) {
  return 'REF-' + String(memberId || '').replace(/^B5-/, '').toUpperCase();
}

const SAMPLE_PROOFS = [
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
];

function buildStagingDataset(proofsDir) {
  fs.mkdirSync(proofsDir, { recursive: true });
  const pwHash = hashPassword('B5@123456');

  const db = {
    adminPassword: 'ADMIN',
    members: [],
    pins: [
      { pin: 'PIN-START1', assignedTo: null, status: 'AVAILABLE', usedBy: null, createdAt: '2026-01-01T00:00:00.000Z', system: true }
    ],
    messages: [
      { to: 'ALL', message: 'Welcome to BORNTOWIN5 Emerald Sovereign Staging Portal.', at: '2026-01-10T09:00:00.000Z' }
    ],
    passwordResetRequests: [],
    leveltrackRequests: [],
    leveltrackUpgrades: [],
    leveltrackPayments: [],
    leveltrackMessages: [],
    emailNotificationLog: [],
    paymentSettings: {
      admins: [
        { id: 'A', name: 'Admin A', accountHolder: 'BORNTOWIN5 Admin A', bank: 'HDFC Bank', account: '50100011112222', ifsc: 'HDFC0000123', upi: 'b5admin.a@hdfcbank', active: true },
        { id: 'B', name: 'Admin B', accountHolder: 'BORNTOWIN5 Admin B', bank: 'ICICI Bank', account: '00090122223333', ifsc: 'ICIC0000456', upi: 'b5admin.b@icici', active: true },
        { id: 'C', name: 'Admin C', accountHolder: 'BORNTOWIN5 Admin C', bank: 'Axis Bank', account: '91901003334444', ifsc: 'UTIB0000789', upi: 'b5admin.c@axis', active: true }
      ],
      adminRotationIndex: 0,
      adminRotationByLevel: { 4: 0, 5: 0, 6: 0, 7: 0 },
      trust: { name: 'BORNTOWIN5 Registered Trust', accountHolder: 'BORNTOWIN5 Charitable Trust', bank: 'State Bank of India', account: '309988776655', ifsc: 'SBIN0001000', upi: 'b5trust@sbi', active: true }
    }
  };

  // 1. Root Company Member
  const root = {
    memberId: 'B5-FC329E',
    referralId: 'REF-FC329E',
    name: 'B5 Sovereign Root',
    mobile: '7999999999',
    email: 'root@borntowin5.test',
    status: 'Verified',
    referral: 'FIRST MEMBER',
    level: 7,
    levelMemberId: 'L7-001',
    joinedAt: '2025-01-01T00:00:00.000Z',
    registeredAt: '2025-01-01T00:00:00.000Z',
    levelReachedAt: {
      2: '2025-01-01T00:01:00.000Z',
      3: '2025-01-01T00:02:00.000Z',
      4: '2025-01-01T00:03:00.000Z',
      5: '2025-01-01T00:04:00.000Z',
      6: '2025-01-01T00:05:00.000Z',
      7: '2025-01-01T00:06:00.000Z'
    },
    passwordHash: pwHash,
    place: 'Chennai',
    accountHolder: 'B5 Sovereign Root',
    bank: 'State Bank of India',
    account: '100000000001',
    ifsc: 'SBIN0000001',
    branch: 'Chennai HQ',
    upi: 'b5root@sbi',
    profileLocked: true
  };
  db.members.push(root);

  // 2. 10 Base Seniority Test IDs (KARTHI01..KARTHI10)
  const baseIds = [
    ['KARTHI01', '7000000001'], ['SATHYA02', '7000000002'], ['KARTHI03', '7000000003'], ['SATHYA04', '7000000004'], ['KARTHI05', '7000000005'],
    ['SATHYA06', '7000000006'], ['KARTHI07', '7000000007'], ['SATHYA08', '7000000008'], ['KARTHI09', '7000000009'], ['KARTHI10', '7000000010']
  ];
  baseIds.forEach(([memberId, mobile], i) => {
    const stamp = `2025-02-01T00:00:${String(i + 1).padStart(2, '0')}.000Z`;
    const reached = {};
    for (let l = 2; l <= 7; l++) reached[l] = stamp;
    db.members.push({
      memberId,
      referralId: referralCode(memberId),
      name: `${memberId} Sovereign`,
      mobile,
      email: `${memberId.toLowerCase()}@borntowin5.test`,
      status: 'Verified',
      referral: root.memberId,
      level: 2,
      levelMemberId: `L2-${String(i + 1).padStart(3, '0')}`,
      joinedAt: stamp,
      registeredAt: stamp,
      levelReachedAt: reached,
      passwordHash: pwHash,
      place: 'Chennai',
      accountHolder: `${memberId} Sovereign`,
      bank: 'Indian Bank',
      account: `2000000000${String(i + 1).padStart(2, '0')}`,
      ifsc: 'IDIB000C001',
      branch: 'Anna Nagar',
      upi: `${memberId.toLowerCase()}@indianbank`,
      profileLocked: true,
      _seniorityTestOrder: i + 1
    });
  });

  // 3. Two Root Accounts Each with 13 Referral Descendants
  const trees = [
    { memberId: 'B5-MOBTEST01', referralId: 'REF-MOBTEST01', name: 'Mobile Test Parent 1', mobile: '7888888801', prefix: 'M1T' },
    { memberId: 'B5-MOBTEST02', referralId: 'REF-MOBTEST02', name: 'Mobile Test Parent 2', mobile: '7888888802', prefix: 'M2T' }
  ];
  trees.forEach((t, ti) => {
    db.members.push({
      memberId: t.memberId,
      referralId: t.referralId,
      name: t.name,
      mobile: t.mobile,
      email: `${t.prefix.toLowerCase()}@borntowin5.test`,
      status: 'Verified',
      referral: 'FIRST MEMBER',
      level: 1,
      levelMemberId: `L1-MOB-${ti + 1}`,
      joinedAt: `2025-03-01T00:00:0${ti + 1}.000Z`,
      registeredAt: `2025-03-01T00:00:0${ti + 1}.000Z`,
      passwordHash: pwHash,
      place: 'Coimbatore',
      accountHolder: t.name,
      bank: 'Canara Bank',
      account: `30000000000${ti + 1}`,
      ifsc: 'CNRB0001001',
      branch: 'RS Puram',
      upi: `${t.prefix.toLowerCase()}@cnrb`,
      profileLocked: true
    });
    for (let i = 1; i <= 13; i++) {
      const childId = `${t.prefix}${String(i).padStart(2, '0')}`;
      const childMobile = String(7300000000 + ti * 100 + i);
      const stamp = `2025-03-02T00:${String(i).padStart(2, '0')}:00.000Z`;
      db.members.push({
        memberId: childId,
        referralId: referralCode(childId),
        name: `${t.prefix} Referral ${String(i).padStart(2, '0')}`,
        mobile: childMobile,
        email: `${childId.toLowerCase()}@borntowin5.test`,
        status: 'Verified',
        referral: t.memberId,
        level: 1,
        levelMemberId: `L1-${t.prefix}-${String(i).padStart(3, '0')}`,
        joinedAt: stamp,
        registeredAt: stamp,
        passwordHash: pwHash,
        place: 'Madurai',
        accountHolder: `${t.prefix} Referral ${i}`,
        bank: 'Karur Vysya Bank',
        account: `4000000${ti}${String(i).padStart(2, '0')}`,
        ifsc: 'KVBL0001234',
        branch: 'Main',
        upi: `${childId.toLowerCase()}@kvb`,
        profileLocked: true
      });
    }
  });

  // 4. Seed 5 Distinct Payment Submissions to the same receiver (B5-FC329E)
  //    - 3 Approved, 1 Receiver Confirmed (Pending Admin), 1 Proof Submitted (Pending Receiver)
  //    Plus 1 Rejected payment & 1 Expired request for full UI/QA coverage.
  for (let idx = 0; idx < 5; idx++) {
    const payer = db.members.find(m => m.memberId === `M1T0${idx + 1}`);
    const reqId = `LTR-STG0000${idx + 1}`;
    const upgId = `LTU-STG0000${idx + 1}`;
    const payId = `LTP-STG0000${idx + 1}`;
    const createdAt = `2026-01-15T10:0${idx}:00.000Z`;
    const proofData = SAMPLE_PROOFS[idx % SAMPLE_PROOFS.length];
    const proofRef = `/api/leveltrack/proofs/${payId}/member`;
    const m = proofData.match(/^data:image\/png;base64,(.+)$/);
    if (m) {
      fs.writeFileSync(path.join(proofsDir, `${payId}-member.png`), Buffer.from(m[1], 'base64'));
    }

    const isApproved = idx < 3;
    const isReceiverConfirmed = idx === 3;
    const reqStatus = isApproved ? 'Completed' : 'Assigned';
    const partStatus = isApproved ? 'APPROVED' : (isReceiverConfirmed ? 'CONFIRMED' : 'SUBMITTED');

    db.leveltrackRequests.push({
      id: reqId,
      memberId: payer.memberId,
      from: 1,
      to: 2,
      seniorityLevel: 2,
      kind: 'LEVEL_UPGRADE',
      status: reqStatus,
      upgradeId: upgId,
      reservedReceiverId: root.memberId,
      reservedPosition: 1,
      payee: root.name,
      payeeId: root.memberId,
      payeePhone: root.mobile,
      accountHolder: root.accountHolder,
      bank: root.bank,
      account: root.account,
      ifsc: root.ifsc,
      branch: root.branch,
      upi: root.upi,
      amount: 1000,
      createdAt,
      assignedAt: createdAt,
      completedAt: isApproved ? createdAt : undefined
    });

    db.leveltrackUpgrades.push({
      id: upgId,
      requestId: reqId,
      memberId: payer.memberId,
      from: 1,
      to: 2,
      kind: 'LEVEL_UPGRADE',
      seniorityLevel: 2,
      amount: 1000,
      payee: root.name,
      payeeId: root.memberId,
      payeePhone: root.mobile,
      accountHolder: root.accountHolder,
      bank: root.bank,
      account: root.account,
      ifsc: root.ifsc,
      branch: root.branch,
      upi: root.upi,
      detailsSent: true,
      detailsSentAt: createdAt,
      memberPaid: true,
      paidAt: createdAt,
      utr: `UTR-STG-000${idx + 1}`,
      receiverApproved: isApproved || isReceiverConfirmed,
      adminApproved: isApproved,
      status: isApproved ? 'Completed' : undefined,
      completedAt: isApproved ? createdAt : undefined,
      createdAt
    });

    db.leveltrackPayments.push({
      id: payId,
      requestId: reqId,
      upgradeId: upgId,
      kind: 'LEVEL_UPGRADE',
      fromLevel: 1,
      toLevel: 2,
      seniorityLevel: 2,
      fromMemberId: payer.memberId,
      receiverMemberId: root.memberId,
      payeeId: root.memberId,
      from: payer.name,
      to: root.name,
      amount: 1000,
      utr: `UTR-STG-000${idx + 1}`,
      screenshot: proofData,
      proofRef,
      parts: [
        {
          type: 'member',
          label: 'MEMBER / RECEIVER',
          amount: 1000,
          status: partStatus,
          utr: `UTR-STG-000${idx + 1}`,
          screenshot: proofData,
          proofRef,
          submittedAt: createdAt,
          accountDetails: {
            name: root.name,
            memberId: root.memberId,
            mobile: root.mobile,
            accountHolder: root.accountHolder,
            bank: root.bank,
            account: root.account,
            ifsc: root.ifsc,
            branch: root.branch,
            upi: root.upi
          }
        }
      ],
      memberPaid: true,
      memberAccepted: isApproved || isReceiverConfirmed,
      acceptedAt: (isApproved || isReceiverConfirmed) ? createdAt : null,
      adminApproved: isApproved,
      adminVerifiedAt: isApproved ? createdAt : null,
      submittedAt: createdAt,
      createdAt,
      detailsSentAt: createdAt,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      status: isApproved ? 'APPROVED' : 'PENDING'
    });
  }

  // Seed 20 AVAILABLE joining PINs assigned to B5-FC329E
  for (let p = 1; p <= 20; p++) {
    db.pins.push({
      pin: `PIN-STG${String(p).padStart(3, '0')}`,
      assignedTo: root.memberId,
      status: 'AVAILABLE',
      usedBy: null,
      createdAt: '2026-01-01T00:00:00.000Z'
    });
  }

  for (const m of db.members) {
    m.isTestAccount = true;
    m.testTag = 'SAFE_TEST_MODE';
  }
  for (const p of db.leveltrackPayments) {
    p.isTestPayment = true;
  }

  return db;
}

function resetStagingDatabase(customDbPath) {
  const targetDb = customDbPath || process.env.DB_FILE || path.join(__dirname, 'local-review-db.json');
  verifyNonProductionSafety(targetDb);
  const proofsDir = path.join(path.dirname(targetDb), 'proofs');
  const data = buildStagingDataset(proofsDir);
  fs.mkdirSync(path.dirname(targetDb), { recursive: true });
  fs.writeFileSync(targetDb, JSON.stringify(data, null, 2), 'utf8');
  return {
    ok: true,
    dbFile: targetDb,
    proofsDir,
    membersCount: data.members.length,
    paymentsCount: data.leveltrackPayments.length,
    pinsCount: data.pins.length
  };
}

if (require.main === module) {
  process.env.B5_LOCAL_TEST_ONLY = process.env.B5_LOCAL_TEST_ONLY || '1';
  const info = resetStagingDatabase();
  console.log('✓ Staging test database safely reset & seeded:', JSON.stringify(info, null, 2));
}

module.exports = { resetStagingDatabase, verifyNonProductionSafety };
