/**
 * BORNTOWIN5 (B5) — Cloudflare D1 Relational Repository
 * Database Name : b5-level-tracking
 * Binding Name  : DB (env.DB)
 *
 * All reads and writes go through Cloudflare D1 relational tables using
 * parameterized prepared statements and atomic env.DB.batch([...]) transactions.
 */

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS members (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_members_referral ON members(referral)`,
  `CREATE INDEX IF NOT EXISTS idx_members_mobile ON members(mobile)`,
  `CREATE INDEX IF NOT EXISTS idx_members_level ON members(level)`,
  `CREATE INDEX IF NOT EXISTS idx_members_status ON members(status)`,
  `CREATE TABLE IF NOT EXISTS pins (
    pin TEXT PRIMARY KEY,
    assigned_to TEXT,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    used_by TEXT,
    created_at TEXT NOT NULL,
    used_at TEXT,
    is_system INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pins_assigned_status ON pins(assigned_to, status)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'MAIN',
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    mobile TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    temporary_password TEXT,
    created_at TEXT NOT NULL,
    approved_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pwd_reset_member_status ON password_reset_requests(member_id, status)`,
  `CREATE TABLE IF NOT EXISTS leveltrack_requests (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lt_requests_member ON leveltrack_requests(member_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_lt_requests_reserved_receiver ON leveltrack_requests(reserved_receiver_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_lt_requests_seniority ON leveltrack_requests(seniority_level, status)`,
  `CREATE TABLE IF NOT EXISTS leveltrack_upgrades (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lt_upgrades_request ON leveltrack_upgrades(request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lt_upgrades_member ON leveltrack_upgrades(member_id)`,
  `CREATE TABLE IF NOT EXISTS leveltrack_payments (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lt_payments_upgrade ON leveltrack_payments(upgrade_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lt_payments_receiver ON leveltrack_payments(receiver_member_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_lt_payments_sender ON leveltrack_payments(from_member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lt_payments_request ON leveltrack_payments(request_id)`,
  `CREATE TABLE IF NOT EXISTS payment_proofs (
    payment_id TEXT NOT NULL,
    part_type TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/png',
    data_uri TEXT NOT NULL,
    utr TEXT,
    submitted_at TEXT NOT NULL,
    PRIMARY KEY (payment_id, part_type)
  )`,
  `CREATE TABLE IF NOT EXISTS email_logs (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC)`
];

function defaultPaymentSettings() {
  return {
    admins: [
      { id: 'A', name: 'Admin A', accountHolder: '', bank: '', account: '', ifsc: '', upi: '', active: true },
      { id: 'B', name: 'Admin B', accountHolder: '', bank: '', account: '', ifsc: '', upi: '', active: true },
      { id: 'C', name: 'Admin C', accountHolder: '', bank: '', account: '', ifsc: '', upi: '', active: true }
    ],
    adminRotationIndex: 0,
    adminRotationByLevel: { 4: 0, 5: 0, 6: 0, 7: 0 },
    trust: { name: 'Registered Trust', accountHolder: '', bank: '', account: 'TEMP-TRUST-001', ifsc: '', upi: '', active: true }
  };
}

function safeJsonParse(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

let _schemaInitializedForBinding = new WeakSet();

async function ensureD1SchemaAndBootstrap(d1, configuredAdminPassword = null) {
  if (!d1) throw new Error('Cloudflare D1 binding (env.DB) is not configured.');
  if (_schemaInitializedForBinding.has(d1)) return;

  const now = new Date().toISOString();
  const stmts = SCHEMA_STATEMENTS.map(sql => d1.prepare(sql));
  stmts.push(
    d1.prepare(`INSERT OR IGNORE INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)`)
      .bind('payment_settings', JSON.stringify(defaultPaymentSettings()), now)
  );
  if (configuredAdminPassword) {
    stmts.push(
      d1.prepare(`INSERT OR IGNORE INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)`)
        .bind('admin_password', JSON.stringify(String(configuredAdminPassword)), now),
      d1.prepare(`INSERT OR IGNORE INTO pins (pin, assigned_to, status, used_by, created_at, used_at, is_system) VALUES (?, NULL, 'AVAILABLE', NULL, ?, NULL, 1)`)
        .bind('PIN-START1', now)
    );
  }
  await d1.batch(stmts);
  _schemaInitializedForBinding.add(d1);
}

function mapMemberRow(r) {
  const extra = safeJsonParse(r.extra_json, {});
  const m = {
    ...extra,
    memberId: r.member_id,
    referralId: r.referral_id,
    name: r.name,
    place: r.place || '',
    mobile: r.mobile,
    email: r.email || '',
    referral: r.referral || 'FIRST MEMBER',
    level: Number(r.level || 1),
    levelMemberId: r.level_member_id || null,
    status: r.status || 'Pending',
    joinedAt: r.joined_at || null,
    registeredAt: r.registered_at || r.joined_at || null,
    upgradeDate: r.upgrade_date || null,
    levelReachedAt: safeJsonParse(r.level_reached_at_json, {}),
    accountHolder: r.account_holder || '',
    bank: r.bank || '',
    account: r.account || '',
    ifsc: r.ifsc || '',
    branch: r.branch || '',
    upi: r.upi || '',
    photo: r.photo || '',
    profileLocked: !!r.profile_locked,
    paymentAccessLocked: !!r.payment_access_locked,
    paymentReviewStatus: r.payment_review_status || '',
    passwordHash: r.password_hash || '',
    mustChangePassword: !!r.must_change_password
  };
  if (r.seniority_test_order !== null && r.seniority_test_order !== undefined) {
    m._seniorityTestOrder = Number(r.seniority_test_order);
  }
  return m;
}

function mapPinRow(r) {
  return {
    pin: r.pin,
    assignedTo: r.assigned_to || null,
    status: r.status || 'AVAILABLE',
    usedBy: r.used_by || null,
    createdAt: r.created_at,
    usedAt: r.used_at || null,
    system: !!r.is_system
  };
}

function mapPasswordResetRow(r) {
  return {
    id: r.id,
    memberId: r.member_id,
    mobile: r.mobile,
    name: r.name,
    status: r.status || 'Pending',
    temporaryPassword: r.temporary_password || undefined,
    createdAt: r.created_at,
    approvedAt: r.approved_at || undefined
  };
}

function mapLtRequestRow(r) {
  const obj = {
    id: r.id,
    memberId: r.member_id,
    from: Number(r.from_level || 1),
    to: Number(r.to_level || 1),
    seniorityLevel: Number(r.seniority_level || 2),
    kind: r.kind || 'LEVEL_UPGRADE',
    status: r.status || 'Requested',
    reservedReceiverId: r.reserved_receiver_id || null,
    reservedPosition: r.reserved_position !== null && r.reserved_position !== undefined ? Number(r.reserved_position) : null,
    reservedAt: r.reserved_at || null,
    date: r.req_date || String(r.created_at || '').slice(0, 10),
    createdAt: r.created_at
  };
  if (r.cycle !== null && r.cycle !== undefined) obj.cycle = Number(r.cycle);
  if (r.upgrade_id) obj.upgradeId = r.upgrade_id;
  if (r.assigned_at) obj.assignedAt = r.assigned_at;
  if (r.completed_at) obj.completedAt = r.completed_at;
  if (r.rejected_at) obj.rejectedAt = r.rejected_at;
  if (r.rejection_reason) obj.rejectionReason = r.rejection_reason;
  if (r.payee) obj.payee = r.payee;
  if (r.payee_id) obj.payeeId = r.payee_id;
  if (r.payee_phone) obj.payeePhone = r.payee_phone;
  if (r.account_holder) obj.accountHolder = r.account_holder;
  if (r.bank) obj.bank = r.bank;
  if (r.account) obj.account = r.account;
  if (r.ifsc) obj.ifsc = r.ifsc;
  if (r.branch) obj.branch = r.branch;
  if (r.upi) obj.upi = r.upi;
  if (r.amount !== null && r.amount !== undefined) obj.amount = Number(r.amount);
  const parts = safeJsonParse(r.payment_parts_json, null);
  if (Array.isArray(parts)) obj.paymentParts = parts;
  const assignedAdmin = safeJsonParse(r.assigned_admin_account_json, null);
  if (assignedAdmin && typeof assignedAdmin === 'object') obj.assignedAdminAccount = assignedAdmin;
  return obj;
}

function mapLtUpgradeRow(r) {
  return {
    id: r.id,
    requestId: r.request_id,
    memberId: r.member_id,
    from: Number(r.from_level || 1),
    to: Number(r.to_level || 1),
    seniorityLevel: Number(r.seniority_level || 2),
    kind: r.kind || 'LEVEL_UPGRADE',
    amount: Number(r.amount || 0),
    payee: r.payee || '',
    payeeId: r.payee_id || '',
    payeePhone: r.payee_phone || '',
    accountHolder: r.account_holder || '',
    bank: r.bank || '',
    account: r.account || '',
    ifsc: r.ifsc || '',
    branch: r.branch || '',
    upi: r.upi || '',
    paymentParts: safeJsonParse(r.payment_parts_json, []),
    detailsSent: !!r.details_sent,
    detailsSentAt: r.details_sent_at || null,
    memberPaid: !!r.member_paid,
    paidAt: r.paid_at || null,
    utr: r.utr || '',
    receiverApproved: !!r.receiver_approved,
    adminApproved: !!r.admin_approved,
    paymentAccessLocked: !!r.payment_access_locked,
    status: r.status || undefined,
    completedAt: r.completed_at || null,
    createdAt: r.created_at
  };
}

function mapLtPaymentRow(r) {
  return {
    id: r.id,
    requestId: r.request_id,
    upgradeId: r.upgrade_id,
    kind: r.kind || 'LEVEL_UPGRADE',
    fromLevel: Number(r.from_level || 1),
    toLevel: Number(r.to_level || 1),
    seniorityLevel: Number(r.seniority_level || 2),
    fromMemberId: r.from_member_id,
    receiverMemberId: r.receiver_member_id,
    payeeId: r.payee_id || r.receiver_member_id,
    from: r.from_name || r.from_member_id,
    to: r.to_name || r.receiver_member_id,
    amount: Number(r.amount || 0),
    utr: r.utr || '',
    screenshot: r.screenshot || null,
    proofRef: r.proof_ref || null,
    parts: safeJsonParse(r.parts_json, []),
    memberPaid: !!r.member_paid,
    memberAccepted: !!r.member_accepted,
    acceptedAt: r.accepted_at || null,
    adminApproved: !!r.admin_approved,
    adminVerifiedAt: r.admin_verified_at || null,
    rejected: !!r.rejected,
    rejectedAt: r.rejected_at || null,
    rejectionReason: r.rejection_reason || '',
    slotReleased: !!r.slot_released,
    paymentAccessLocked: !!r.payment_access_locked,
    _superseded: !!r.superseded,
    status: r.status || 'PENDING',
    submittedAt: r.submitted_at || null,
    detailsSentAt: r.details_sent_at || null,
    expiresAt: r.expires_at || null,
    createdAt: r.created_at
  };
}

function mapEmailLogRow(r) {
  return {
    id: r.id,
    eventType: r.event_type,
    eventKey: r.event_key,
    to: r.recipient_email || '',
    recipientId: r.recipient_id || '',
    subject: r.subject || '',
    bodyPreview: r.body_preview || '',
    eventGenerated: !!r.event_generated,
    liveDelivered: !!r.live_delivered,
    status: r.status || 'PENDING',
    deliveryStatus: r.delivery_status || 'PENDING',
    attempts: Number(r.attempts || 0),
    error: r.error || null,
    metadata: safeJsonParse(r.metadata_json, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

async function loadStateFromD1(d1, configuredAdminPassword = null) {
  await ensureD1SchemaAndBootstrap(d1, configuredAdminPassword);

  const [
    settingsRes,
    membersRes,
    pinsRes,
    messagesRes,
    pwdRes,
    requestsRes,
    upgradesRes,
    paymentsRes,
    emailsRes
  ] = await d1.batch([
    d1.prepare(`SELECT key, value_json FROM system_settings`),
    d1.prepare(`SELECT * FROM members ORDER BY registered_at ASC, member_id ASC`),
    d1.prepare(`SELECT * FROM pins ORDER BY created_at ASC, pin ASC`),
    d1.prepare(`SELECT * FROM messages ORDER BY id ASC`),
    d1.prepare(`SELECT * FROM password_reset_requests ORDER BY created_at ASC`),
    d1.prepare(`SELECT * FROM leveltrack_requests ORDER BY created_at ASC, id ASC`),
    d1.prepare(`SELECT * FROM leveltrack_upgrades ORDER BY created_at ASC, id ASC`),
    d1.prepare(`SELECT * FROM leveltrack_payments ORDER BY created_at ASC, id ASC`),
    d1.prepare(`SELECT * FROM email_logs ORDER BY created_at ASC, id ASC`)
  ]);

  const settingsMap = {};
  for (const row of (settingsRes.results || [])) {
    settingsMap[row.key] = safeJsonParse(row.value_json, null);
  }

  const paymentSettings = settingsMap.payment_settings || defaultPaymentSettings();
  paymentSettings.admins = Array.isArray(paymentSettings.admins) ? paymentSettings.admins : defaultPaymentSettings().admins;
  paymentSettings.trust = paymentSettings.trust || defaultPaymentSettings().trust;
  paymentSettings.adminRotationIndex = Number(paymentSettings.adminRotationIndex || 0);
  paymentSettings.adminRotationByLevel = paymentSettings.adminRotationByLevel || { 4: 0, 5: 0, 6: 0, 7: 0 };
  [4, 5, 6, 7].forEach(l => {
    paymentSettings.adminRotationByLevel[l] = Number(paymentSettings.adminRotationByLevel[l] || 0);
  });

  const allMessages = messagesRes.results || [];
  const mainMessages = [];
  const ltMessages = [];
  for (const row of allMessages) {
    const item = { _dbId: row.id, to: row.recipient, message: row.message, at: row.created_at };
    if (row.channel === 'LEVELTRACK') ltMessages.push(item);
    else mainMessages.push(item);
  }

  const storedAdminPassword = settingsMap.admin_password ? String(settingsMap.admin_password) : (configuredAdminPassword ? String(configuredAdminPassword) : null);

  return {
    adminPassword: storedAdminPassword,
    adminBootstrapCompleted: !!storedAdminPassword,
    paymentSettings,
    members: (membersRes.results || []).map(mapMemberRow),
    pins: (pinsRes.results || []).map(mapPinRow),
    messages: mainMessages,
    leveltrackMessages: ltMessages,
    passwordResetRequests: (pwdRes.results || []).map(mapPasswordResetRow),
    leveltrackRequests: (requestsRes.results || []).map(mapLtRequestRow),
    leveltrackUpgrades: (upgradesRes.results || []).map(mapLtUpgradeRow),
    leveltrackPayments: (paymentsRes.results || []).map(mapLtPaymentRow),
    emailNotificationLog: (emailsRes.results || []).map(mapEmailLogRow)
  };
}

function buildSnapshotMap(state) {
  const map = {
    adminPassword: JSON.stringify(state.adminPassword),
    paymentSettings: JSON.stringify(state.paymentSettings),
    members: new Map(),
    pins: new Map(),
    passwordResetRequests: new Map(),
    leveltrackRequests: new Map(),
    leveltrackUpgrades: new Map(),
    leveltrackPayments: new Map(),
    emailNotificationLog: new Map(),
    messagesCount: (state.messages || []).length,
    ltMessagesCount: (state.leveltrackMessages || []).length
  };
  for (const m of (state.members || [])) map.members.set(m.memberId, JSON.stringify(m));
  for (const p of (state.pins || [])) map.pins.set(p.pin, JSON.stringify(p));
  for (const r of (state.passwordResetRequests || [])) map.passwordResetRequests.set(r.id, JSON.stringify(r));
  for (const r of (state.leveltrackRequests || [])) map.leveltrackRequests.set(r.id, JSON.stringify(r));
  for (const u of (state.leveltrackUpgrades || [])) map.leveltrackUpgrades.set(u.id, JSON.stringify(u));
  for (const p of (state.leveltrackPayments || [])) map.leveltrackPayments.set(p.id, JSON.stringify(p));
  for (const e of (state.emailNotificationLog || [])) map.emailNotificationLog.set(e.eventKey || e.id, JSON.stringify(e));
  return map;
}

function prepareUpsertMember(d1, m) {
  const knownKeys = new Set([
    'memberId', 'referralId', 'name', 'place', 'mobile', 'email', 'referral',
    'level', 'levelMemberId', 'status', 'joinedAt', 'registeredAt', 'upgradeDate',
    'levelReachedAt', 'accountHolder', 'bank', 'account', 'ifsc', 'branch', 'upi',
    'photo', 'profileLocked', 'paymentAccessLocked', 'paymentReviewStatus',
    'passwordHash', 'mustChangePassword', '_seniorityTestOrder'
  ]);
  const extra = {};
  for (const [k, v] of Object.entries(m)) {
    if (!knownKeys.has(k)) extra[k] = v;
  }
  const now = new Date().toISOString();
  return d1.prepare(`
    INSERT INTO members (
      member_id, referral_id, name, place, mobile, email, referral,
      level, level_member_id, status, joined_at, registered_at, upgrade_date,
      level_reached_at_json, account_holder, bank, account, ifsc, branch, upi,
      photo, profile_locked, payment_access_locked, payment_review_status,
      password_hash, must_change_password, seniority_test_order, extra_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      referral_id = excluded.referral_id,
      name = excluded.name,
      place = excluded.place,
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
      photo = excluded.photo,
      profile_locked = excluded.profile_locked,
      payment_access_locked = excluded.payment_access_locked,
      payment_review_status = excluded.payment_review_status,
      password_hash = excluded.password_hash,
      must_change_password = excluded.must_change_password,
      seniority_test_order = excluded.seniority_test_order,
      extra_json = excluded.extra_json
  `).bind(
    String(m.memberId),
    String(m.referralId || `REF-${String(m.memberId).replace(/^B5-/, '').toUpperCase()}`),
    String(m.name || ''),
    String(m.place || ''),
    String(m.mobile || ''),
    String(m.email || m.rEmail || ''),
    String(m.referral || 'FIRST MEMBER'),
    Number(m.level || 1),
    m.levelMemberId ? String(m.levelMemberId) : null,
    String(m.status || 'Pending'),
    m.joinedAt ? String(m.joinedAt) : null,
    String(m.registeredAt || m.joinedAt || now),
    m.upgradeDate ? String(m.upgradeDate) : null,
    JSON.stringify(m.levelReachedAt || {}),
    String(m.accountHolder || ''),
    String(m.bank || ''),
    String(m.account || ''),
    String(m.ifsc || ''),
    String(m.branch || ''),
    String(m.upi || ''),
    String(m.photo || ''),
    m.profileLocked ? 1 : 0,
    m.paymentAccessLocked ? 1 : 0,
    String(m.paymentReviewStatus || ''),
    String(m.passwordHash || ''),
    m.mustChangePassword ? 1 : 0,
    m._seniorityTestOrder !== undefined && m._seniorityTestOrder !== null ? Number(m._seniorityTestOrder) : null,
    JSON.stringify(extra)
  );
}

function prepareUpsertPin(d1, p) {
  return d1.prepare(`
    INSERT INTO pins (pin, assigned_to, status, used_by, created_at, used_at, is_system)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pin) DO UPDATE SET
      assigned_to = excluded.assigned_to,
      status = excluded.status,
      used_by = excluded.used_by,
      used_at = excluded.used_at,
      is_system = excluded.is_system
  `).bind(
    String(p.pin),
    p.assignedTo ? String(p.assignedTo) : null,
    String(p.status || 'AVAILABLE'),
    p.usedBy ? String(p.usedBy) : null,
    String(p.createdAt || new Date().toISOString()),
    p.usedAt ? String(p.usedAt) : null,
    p.system ? 1 : 0
  );
}

function prepareUpsertPasswordReset(d1, r) {
  return d1.prepare(`
    INSERT INTO password_reset_requests (id, member_id, mobile, name, status, temporary_password, created_at, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      temporary_password = excluded.temporary_password,
      approved_at = excluded.approved_at
  `).bind(
    String(r.id),
    String(r.memberId),
    String(r.mobile || ''),
    String(r.name || ''),
    String(r.status || 'Pending'),
    r.temporaryPassword ? String(r.temporaryPassword) : null,
    String(r.createdAt || new Date().toISOString()),
    r.approvedAt ? String(r.approvedAt) : null
  );
}

function prepareUpsertLtRequest(d1, r) {
  return d1.prepare(`
    INSERT INTO leveltrack_requests (
      id, member_id, from_level, to_level, seniority_level, kind, cycle, status,
      upgrade_id, reserved_receiver_id, reserved_position, reserved_at, assigned_at,
      completed_at, rejected_at, rejection_reason, payee, payee_id, payee_phone,
      account_holder, bank, account, ifsc, branch, upi, amount,
      payment_parts_json, assigned_admin_account_json, req_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      from_level = excluded.from_level,
      to_level = excluded.to_level,
      seniority_level = excluded.seniority_level,
      kind = excluded.kind,
      cycle = excluded.cycle,
      status = excluded.status,
      upgrade_id = excluded.upgrade_id,
      reserved_receiver_id = excluded.reserved_receiver_id,
      reserved_position = excluded.reserved_position,
      reserved_at = excluded.reserved_at,
      assigned_at = excluded.assigned_at,
      completed_at = excluded.completed_at,
      rejected_at = excluded.rejected_at,
      rejection_reason = excluded.rejection_reason,
      payee = excluded.payee,
      payee_id = excluded.payee_id,
      payee_phone = excluded.payee_phone,
      account_holder = excluded.account_holder,
      bank = excluded.bank,
      account = excluded.account,
      ifsc = excluded.ifsc,
      branch = excluded.branch,
      upi = excluded.upi,
      amount = excluded.amount,
      payment_parts_json = excluded.payment_parts_json,
      assigned_admin_account_json = excluded.assigned_admin_account_json,
      req_date = excluded.req_date
  `).bind(
    String(r.id),
    String(r.memberId),
    Number(r.from || 1),
    Number(r.to || 1),
    Number(r.kind === 'REFERRAL_UPGRADE' ? 2 : (r.seniorityLevel || r.to || 2)),
    String(r.kind || 'LEVEL_UPGRADE'),
    r.cycle !== undefined && r.cycle !== null ? Number(r.cycle) : null,
    String(r.status || 'Requested'),
    r.upgradeId ? String(r.upgradeId) : null,
    r.reservedReceiverId ? String(r.reservedReceiverId) : null,
    r.reservedPosition !== undefined && r.reservedPosition !== null ? Number(r.reservedPosition) : null,
    r.reservedAt ? String(r.reservedAt) : null,
    r.assignedAt ? String(r.assignedAt) : null,
    r.completedAt ? String(r.completedAt) : null,
    r.rejectedAt ? String(r.rejectedAt) : null,
    r.rejectionReason ? String(r.rejectionReason) : null,
    r.payee ? String(r.payee) : null,
    r.payeeId ? String(r.payeeId) : null,
    r.payeePhone ? String(r.payeePhone) : null,
    r.accountHolder ? String(r.accountHolder) : null,
    r.bank ? String(r.bank) : null,
    r.account ? String(r.account) : null,
    r.ifsc ? String(r.ifsc) : null,
    r.branch ? String(r.branch) : null,
    r.upi ? String(r.upi) : null,
    r.amount !== undefined && r.amount !== null ? Number(r.amount) : null,
    Array.isArray(r.paymentParts) ? JSON.stringify(r.paymentParts) : null,
    r.assignedAdminAccount ? JSON.stringify(r.assignedAdminAccount) : null,
    String(r.date || String(r.createdAt || '').slice(0, 10)),
    String(r.createdAt || new Date().toISOString())
  );
}

function prepareUpsertLtUpgrade(d1, u) {
  return d1.prepare(`
    INSERT INTO leveltrack_upgrades (
      id, request_id, member_id, from_level, to_level, seniority_level, kind, amount,
      payee, payee_id, payee_phone, account_holder, bank, account, ifsc, branch, upi,
      payment_parts_json, details_sent, details_sent_at, member_paid, paid_at, utr,
      receiver_approved, admin_approved, payment_access_locked, status, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      request_id = excluded.request_id,
      from_level = excluded.from_level,
      to_level = excluded.to_level,
      seniority_level = excluded.seniority_level,
      kind = excluded.kind,
      amount = excluded.amount,
      payee = excluded.payee,
      payee_id = excluded.payee_id,
      payee_phone = excluded.payee_phone,
      account_holder = excluded.account_holder,
      bank = excluded.bank,
      account = excluded.account,
      ifsc = excluded.ifsc,
      branch = excluded.branch,
      upi = excluded.upi,
      payment_parts_json = excluded.payment_parts_json,
      details_sent = excluded.details_sent,
      details_sent_at = excluded.details_sent_at,
      member_paid = excluded.member_paid,
      paid_at = excluded.paid_at,
      utr = excluded.utr,
      receiver_approved = excluded.receiver_approved,
      admin_approved = excluded.admin_approved,
      payment_access_locked = excluded.payment_access_locked,
      status = excluded.status,
      completed_at = excluded.completed_at
  `).bind(
    String(u.id),
    String(u.requestId || ''),
    String(u.memberId || ''),
    Number(u.from || 1),
    Number(u.to || 1),
    Number(u.kind === 'REFERRAL_UPGRADE' ? 2 : (u.seniorityLevel || u.to || 2)),
    String(u.kind || 'LEVEL_UPGRADE'),
    Number(u.amount || 0),
    u.payee ? String(u.payee) : null,
    u.payeeId ? String(u.payeeId) : null,
    u.payeePhone ? String(u.payeePhone) : null,
    u.accountHolder ? String(u.accountHolder) : null,
    u.bank ? String(u.bank) : null,
    u.account ? String(u.account) : null,
    u.ifsc ? String(u.ifsc) : null,
    u.branch ? String(u.branch) : null,
    u.upi ? String(u.upi) : null,
    JSON.stringify(u.paymentParts || []),
    u.detailsSent ? 1 : 0,
    u.detailsSentAt ? String(u.detailsSentAt) : null,
    u.memberPaid ? 1 : 0,
    u.paidAt ? String(u.paidAt) : null,
    u.utr ? String(u.utr) : null,
    u.receiverApproved ? 1 : 0,
    u.adminApproved ? 1 : 0,
    u.paymentAccessLocked ? 1 : 0,
    u.status ? String(u.status) : null,
    u.completedAt ? String(u.completedAt) : null,
    String(u.createdAt || new Date().toISOString())
  );
}

function prepareUpsertLtPayment(d1, p) {
  return d1.prepare(`
    INSERT INTO leveltrack_payments (
      id, request_id, upgrade_id, kind, from_level, to_level, seniority_level,
      from_member_id, receiver_member_id, payee_id, from_name, to_name, amount,
      utr, screenshot, proof_ref, parts_json, member_paid, member_accepted, accepted_at,
      admin_approved, admin_verified_at, rejected, rejected_at, rejection_reason,
      slot_released, payment_access_locked, superseded, status, submitted_at,
      details_sent_at, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      request_id = excluded.request_id,
      upgrade_id = excluded.upgrade_id,
      kind = excluded.kind,
      from_level = excluded.from_level,
      to_level = excluded.to_level,
      seniority_level = excluded.seniority_level,
      from_member_id = excluded.from_member_id,
      receiver_member_id = excluded.receiver_member_id,
      payee_id = excluded.payee_id,
      from_name = excluded.from_name,
      to_name = excluded.to_name,
      amount = excluded.amount,
      utr = excluded.utr,
      screenshot = excluded.screenshot,
      proof_ref = excluded.proof_ref,
      parts_json = excluded.parts_json,
      member_paid = excluded.member_paid,
      member_accepted = excluded.member_accepted,
      accepted_at = excluded.accepted_at,
      admin_approved = excluded.admin_approved,
      admin_verified_at = excluded.admin_verified_at,
      rejected = excluded.rejected,
      rejected_at = excluded.rejected_at,
      rejection_reason = excluded.rejection_reason,
      slot_released = excluded.slot_released,
      payment_access_locked = excluded.payment_access_locked,
      superseded = excluded.superseded,
      status = excluded.status,
      submitted_at = excluded.submitted_at,
      details_sent_at = excluded.details_sent_at,
      expires_at = excluded.expires_at
  `).bind(
    String(p.id),
    String(p.requestId || ''),
    String(p.upgradeId || ''),
    String(p.kind || 'LEVEL_UPGRADE'),
    Number(p.fromLevel || p.from || 1),
    Number(p.toLevel || p.to || 1),
    Number(p.kind === 'REFERRAL_UPGRADE' ? 2 : (p.seniorityLevel || p.toLevel || 2)),
    String(p.fromMemberId || ''),
    String(p.receiverMemberId || ''),
    String(p.payeeId || p.receiverMemberId || ''),
    String(p.from || p.fromMemberId || ''),
    String(p.to || p.receiverMemberId || ''),
    Number(p.amount || 0),
    p.utr ? String(p.utr) : null,
    p.screenshot ? String(p.screenshot) : null,
    p.proofRef ? String(p.proofRef) : null,
    JSON.stringify(p.parts || []),
    p.memberPaid ? 1 : 0,
    p.memberAccepted ? 1 : 0,
    p.acceptedAt ? String(p.acceptedAt) : null,
    p.adminApproved ? 1 : 0,
    p.adminVerifiedAt ? String(p.adminVerifiedAt) : null,
    p.rejected ? 1 : 0,
    p.rejectedAt ? String(p.rejectedAt) : null,
    p.rejectionReason ? String(p.rejectionReason) : null,
    p.slotReleased ? 1 : 0,
    p.paymentAccessLocked ? 1 : 0,
    p._superseded ? 1 : 0,
    String(p.status || 'PENDING'),
    p.submittedAt ? String(p.submittedAt) : null,
    p.detailsSentAt ? String(p.detailsSentAt) : null,
    p.expiresAt ? String(p.expiresAt) : null,
    String(p.createdAt || new Date().toISOString())
  );
}

function prepareUpsertPaymentProof(d1, proof) {
  return d1.prepare(`
    INSERT INTO payment_proofs (payment_id, part_type, mime_type, data_uri, utr, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(payment_id, part_type) DO UPDATE SET
      mime_type = excluded.mime_type,
      data_uri = excluded.data_uri,
      utr = excluded.utr,
      submitted_at = excluded.submitted_at
  `).bind(
    String(proof.paymentId),
    String(proof.partType || 'member'),
    String(proof.mimeType || 'image/png'),
    String(proof.dataUri || ''),
    String(proof.utr || ''),
    String(proof.submittedAt || new Date().toISOString())
  );
}

function prepareUpsertEmailLog(d1, e) {
  const now = new Date().toISOString();
  return d1.prepare(`
    INSERT INTO email_logs (
      id, event_type, event_key, recipient_email, recipient_id, subject, body_preview,
      event_generated, live_delivered, status, delivery_status, attempts, error,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO UPDATE SET
      live_delivered = excluded.live_delivered,
      status = excluded.status,
      delivery_status = excluded.delivery_status,
      attempts = excluded.attempts,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).bind(
    String(e.id),
    String(e.eventType || 'GENERAL'),
    String(e.eventKey || `${e.eventType}:${e.id}`),
    String(e.to || ''),
    String(e.recipientId || ''),
    String(e.subject || ''),
    String(e.bodyPreview || ''),
    e.eventGenerated !== false ? 1 : 0,
    e.liveDelivered ? 1 : 0,
    String(e.status || 'PENDING'),
    String(e.deliveryStatus || e.status || 'PENDING'),
    Number(e.attempts || 0),
    e.error ? String(e.error) : null,
    JSON.stringify(e.metadata || {}),
    String(e.createdAt || now),
    String(e.updatedAt || now)
  );
}

async function commitStateToD1(d1, prevMap, nextState, extraProofs = []) {
  const stmts = [];
  const now = new Date().toISOString();

  if (nextState.adminPassword) {
    const nextAdminPwd = JSON.stringify(nextState.adminPassword);
    if (!prevMap || prevMap.adminPassword !== nextAdminPwd) {
      stmts.push(
        d1.prepare(`
          INSERT INTO system_settings (key, value_json, updated_at) VALUES ('admin_password', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
        `).bind(nextAdminPwd, now)
      );
    }
  }

  const nextPaySettings = JSON.stringify(nextState.paymentSettings);
  if (!prevMap || prevMap.paymentSettings !== nextPaySettings) {
    stmts.push(
      d1.prepare(`
        INSERT INTO system_settings (key, value_json, updated_at) VALUES ('payment_settings', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `).bind(nextPaySettings, now)
    );
  }

  for (const m of (nextState.members || [])) {
    const ser = JSON.stringify(m);
    if (!prevMap || prevMap.members.get(m.memberId) !== ser) {
      stmts.push(prepareUpsertMember(d1, m));
    }
  }

  for (const p of (nextState.pins || [])) {
    const ser = JSON.stringify(p);
    if (!prevMap || prevMap.pins.get(p.pin) !== ser) {
      stmts.push(prepareUpsertPin(d1, p));
    }
  }

  for (const msg of (nextState.messages || [])) {
    if (!msg._dbId) {
      stmts.push(
        d1.prepare(`INSERT INTO messages (recipient, channel, message, created_at) VALUES (?, 'MAIN', ?, ?)`)
          .bind(String(msg.to || 'ALL'), String(msg.message || ''), String(msg.at || now))
      );
      msg._dbId = -1;
    }
  }

  for (const msg of (nextState.leveltrackMessages || [])) {
    if (!msg._dbId) {
      stmts.push(
        d1.prepare(`INSERT INTO messages (recipient, channel, message, created_at) VALUES (?, 'LEVELTRACK', ?, ?)`)
          .bind(String(msg.to || 'ADMIN'), String(msg.message || ''), String(msg.at || now))
      );
      msg._dbId = -1;
    }
  }

  for (const r of (nextState.passwordResetRequests || [])) {
    const ser = JSON.stringify(r);
    if (!prevMap || prevMap.passwordResetRequests.get(r.id) !== ser) {
      stmts.push(prepareUpsertPasswordReset(d1, r));
    }
  }

  for (const r of (nextState.leveltrackRequests || [])) {
    const ser = JSON.stringify(r);
    if (!prevMap || prevMap.leveltrackRequests.get(r.id) !== ser) {
      stmts.push(prepareUpsertLtRequest(d1, r));
    }
  }

  for (const u of (nextState.leveltrackUpgrades || [])) {
    const ser = JSON.stringify(u);
    if (!prevMap || prevMap.leveltrackUpgrades.get(u.id) !== ser) {
      stmts.push(prepareUpsertLtUpgrade(d1, u));
    }
  }

  for (const p of (nextState.leveltrackPayments || [])) {
    const ser = JSON.stringify(p);
    if (!prevMap || prevMap.leveltrackPayments.get(p.id) !== ser) {
      stmts.push(prepareUpsertLtPayment(d1, p));
    }
  }

  for (const proof of (extraProofs || [])) {
    stmts.push(prepareUpsertPaymentProof(d1, proof));
  }

  for (const e of (nextState.emailNotificationLog || [])) {
    const key = e.eventKey || e.id;
    const ser = JSON.stringify(e);
    if (!prevMap || prevMap.emailNotificationLog.get(key) !== ser) {
      stmts.push(prepareUpsertEmailLog(d1, e));
    }
  }

  if (stmts.length > 0) {
    await d1.batch(stmts);
  }
  return stmts.length;
}

async function resetD1ToFreshSchema(d1, configuredAdminPassword = null) {
  const now = new Date().toISOString();
  await ensureD1SchemaAndBootstrap(d1, configuredAdminPassword);
  const stmts = [
    d1.prepare(`DELETE FROM payment_proofs`),
    d1.prepare(`DELETE FROM leveltrack_payments`),
    d1.prepare(`DELETE FROM leveltrack_upgrades`),
    d1.prepare(`DELETE FROM leveltrack_requests`),
    d1.prepare(`DELETE FROM password_reset_requests`),
    d1.prepare(`DELETE FROM messages`),
    d1.prepare(`DELETE FROM email_logs`),
    d1.prepare(`DELETE FROM pins`),
    d1.prepare(`DELETE FROM members`),
    d1.prepare(`DELETE FROM system_settings`),
    d1.prepare(`INSERT INTO system_settings (key, value_json, updated_at) VALUES ('payment_settings', ?, ?)`).bind(JSON.stringify(defaultPaymentSettings()), now)
  ];
  if (configuredAdminPassword) {
    stmts.push(
      d1.prepare(`INSERT INTO system_settings (key, value_json, updated_at) VALUES ('admin_password', ?, ?)`).bind(JSON.stringify(String(configuredAdminPassword)), now),
      d1.prepare(`INSERT INTO pins (pin, assigned_to, status, used_by, created_at, used_at, is_system) VALUES ('PIN-START1', NULL, 'AVAILABLE', NULL, ?, NULL, 1)`).bind(now)
    );
  }
  await d1.batch(stmts);
}

async function getProofFromD1(d1, paymentId, partType) {
  const row = await d1.prepare(`SELECT mime_type, data_uri FROM payment_proofs WHERE payment_id = ? AND part_type = ?`)
    .bind(String(paymentId), String(partType || 'member'))
    .first();
  return row || null;
}

module.exports = {
  SCHEMA_STATEMENTS,
  defaultPaymentSettings,
  ensureD1SchemaAndBootstrap,
  loadStateFromD1,
  buildSnapshotMap,
  commitStateToD1,
  resetD1ToFreshSchema,
  getProofFromD1
};
