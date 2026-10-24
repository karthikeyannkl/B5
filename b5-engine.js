/**
 * BORNTOWIN5 (B5) — Cloudflare Workers + D1 Core Application Engine
 * Database : Cloudflare D1 (`b5-level-tracking`) via `env.DB` binding
 */

const crypto = require('crypto');
const {
  ensureD1SchemaAndBootstrap,
  loadStateFromD1,
  buildSnapshotMap,
  commitStateToD1,
  resetD1ToFreshSchema,
  getProofFromD1
} = require('./d1-repository');

const LEVEL_RULES = {
  1: { upgrade: 1000, member: 1000, trust: 0, admin: 0, required: 3 },
  2: { upgrade: 3000, member: 3000, trust: 0, admin: 0, required: 5 },
  3: { upgrade: 20000, member: 15600, trust: 2400, admin: 2000, required: 7 },
  4: { upgrade: 100000, member: 72000, trust: 16000, admin: 12000, required: 9 },
  5: { upgrade: 200000, member: 148000, trust: 32000, admin: 20000, required: 11 },
  6: { upgrade: 500000, member: 240000, trust: 160000, admin: 100000, required: 13 },
  7: { upgrade: 0, member: 0, trust: 0, admin: 0, required: 13 }
};

const LEVEL_SLOT_CAPACITY = { 2: 5, 3: 10, 4: 10, 5: 5, 6: 5, 7: 5 };
const PAYMENT_DEADLINE_MS = 24 * 60 * 60 * 1000;

const SENIORITY_TEST_IDS = [
  ['KARTHI01', '7000000001'], ['SATHYA02', '7000000002'], ['KARTHI03', '7000000003'], ['SATHYA04', '7000000004'], ['KARTHI05', '7000000005'],
  ['SATHYA06', '7000000006'], ['KARTHI07', '7000000007'], ['SATHYA08', '7000000008'], ['KARTHI09', '7000000009'], ['KARTHI10', '7000000010']
];
const SENIORITY_TEST_REF = 'REF-FC329E';

let _lastMonotonicMs = 0;
function nextMonotonicIso() {
  const now = Math.max(Date.now(), _lastMonotonicMs + 1);
  _lastMonotonicMs = now;
  return new Date(now).toISOString();
}

function makeMemberId() {
  return 'B5-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function referralCode(memberId) {
  return 'REF-' + String(memberId || '').replace(/^B5-/, '').toUpperCase();
}
function makePin() {
  return 'PIN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function hashPassword(v) {
  return crypto.createHash('sha256').update(String(v || '')).digest('hex');
}
function earningsRequired(level) {
  return LEVEL_SLOT_CAPACITY[Number(level)] || 0;
}

function splitRule(from) {
  const r = LEVEL_RULES[Number(from)] || { upgrade: 0, member: 0, trust: 0, admin: 0 };
  const out = [{ type: 'member', label: 'MEMBER / RECEIVER', amount: Number(r.member || r.upgrade || 0) }];
  if (Number(r.trust || 0) > 0) out.push({ type: 'trust', label: 'TRUST', amount: Number(r.trust) });
  if (Number(r.admin || 0) > 0) out.push({ type: 'admin', label: 'ADMIN', amount: Number(r.admin) });
  return { upgrade: Number(r.upgrade || 0), parts: out };
}

function isQualifyingMember(m) {
  if (!m || typeof m !== 'object' || !m.memberId) return false;
  if (m.deleted === true || m.invalid === true) return false;
  const st = String(m.status || 'ACTIVE').trim().toLowerCase();
  if (st === 'rejected' || st === 'deleted' || st === 'invalid' || st === 'cancelled') return false;
  return true;
}

function memberPublic(m) {
  if (!m) return null;
  return {
    memberId: m.memberId,
    referralId: m.referralId || referralCode(m.memberId),
    name: m.name,
    mobile: m.mobile,
    email: m.email || m.rEmail || '',
    status: m.status === 'Rejected' ? 'Rejected' : 'ACTIVE',
    rawStatus: m.status || 'ACTIVE',
    referral: m.referral,
    level: Number(m.level || 1),
    levelMemberId: m.levelMemberId || null,
    joinedAt: m.joinedAt || m.registeredAt || null,
    upgradeDate: m.upgradeDate || null,
    profileLocked: !!m.profileLocked,
    paymentAccessLocked: !!m.paymentAccessLocked,
    isTestAccount: !!(m.isTestAccount || m._seniorityTestOrder)
  };
}

function memberProfile(m) {
  return {
    memberId: m.memberId,
    referralId: m.referralId || referralCode(m.memberId),
    name: m.name || '',
    place: m.place || '',
    mobile: m.mobile || '',
    email: m.email || m.rEmail || '',
    referral: m.referral || 'FIRST MEMBER',
    accountHolder: m.accountHolder || m.name || '',
    bank: m.bank || '',
    account: m.account || '',
    ifsc: m.ifsc || '',
    branch: m.branch || '',
    upi: m.upi || '',
    photo: m.photo || '',
    profileLocked: !!m.profileLocked
  };
}

const activeMutationLocks = new Set();
let _allocationMutex = Promise.resolve();
function withAllocationLock(fn) {
  const run = _allocationMutex.then(fn, fn);
  _allocationMutex = run.catch(() => {});
  return run;
}

let lastD1SaveAt = new Date().toISOString();
let lastD1SaveError = null;

function createSessionContext(db, env = {}, smtpSender = null) {
  const adminContactEmail = env.B5_ADMIN_CONTACT_EMAIL || env.ADMIN_EMAIL || env.SMTP_USER || 'notifications@borntowin5.com';
  const smtpConfigured = !!(env.SMTP_PASS || smtpSender);
  const authSecret = env.B5_AUTH_SECRET || crypto.createHash('sha256').update('B5-SOVEREIGN-AUTH-KEY:' + (env.D1_AUTH_SALT || 'CLOUDFLARE-D1')).digest('hex');
  const seniorityTestMode = String(env.B5_SENIORITY_TEST_MODE || '') === '1';

  function createAuthToken(payload) {
    const data = { ...payload, iat: Date.now() };
    if (data.role === 'admin') {
      data.pwdSig = hashPassword(db.adminPassword || 'ADMIN').slice(0, 16);
    }
    const b64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', authSecret).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  }

  function verifyAuthToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expected = crypto.createHmac('sha256', authSecret).update(b64).digest('base64url');
    if (sig !== expected) return null;
    try {
      const data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
      if (data.role === 'admin' && data.pwdSig !== hashPassword(db.adminPassword || 'ADMIN').slice(0, 16)) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function dispatchEmailNotification({ eventType = 'GENERAL', eventKey = '', to = '', recipientId = '', subject = '', text = '', html = '', metadata = {} }) {
    try {
      db.emailNotificationLog = Array.isArray(db.emailNotificationLog) ? db.emailNotificationLog : [];
      if (eventKey) {
        const existing = db.emailNotificationLog.find(x => x.eventKey === eventKey && (x.status === 'SENT' || x.status === 'SKIPPED_NO_SMTP' || x.status === 'PENDING'));
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const entry = {
        id: 'EML-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        eventType,
        eventKey: eventKey || `${eventType}:${recipientId || to}:${Date.now()}`,
        to: String(to || '').trim(),
        recipientId: String(recipientId || ''),
        subject: String(subject || ''),
        bodyPreview: String(text || '').slice(0, 240),
        eventGenerated: true,
        liveDelivered: false,
        status: 'PENDING',
        deliveryStatus: 'PENDING',
        attempts: 0,
        error: null,
        createdAt: now,
        updatedAt: now,
        metadata: metadata || {}
      };
      db.emailNotificationLog.push(entry);
      if (!entry.to) {
        entry.status = 'SKIPPED_NO_RECIPIENT';
        entry.deliveryStatus = 'SKIPPED_NO_RECIPIENT';
        entry.error = 'Recipient email address is empty';
        entry.updatedAt = new Date().toISOString();
        return entry;
      }
      if (String(entry.to).toLowerCase().endsWith('@simulate-smtp-fail.test')) {
        entry.status = 'FAILED';
        entry.deliveryStatus = 'FAILED';
        entry.liveDelivered = false;
        entry.attempts = 2;
        entry.error = 'Simulated SMTP transport error (non-fatal; core D1 transaction preserved)';
        entry.updatedAt = new Date().toISOString();
        return entry;
      }
      if (!smtpConfigured || typeof smtpSender !== 'function') {
        entry.status = 'SKIPPED_NO_SMTP';
        entry.deliveryStatus = 'SKIPPED_NO_SMTP';
        entry.attempts = 1;
        entry.error = 'SMTP_PASS is not configured (event generated & logged in Cloudflare D1)';
        entry.updatedAt = new Date().toISOString();
        return entry;
      }
      entry.attempts = 1;
      entry.status = 'SENT';
      entry.deliveryStatus = 'SENT';
      entry.liveDelivered = true;
      return entry;
    } catch (e) {
      return null;
    }
  }

  function notifyMemberEmail(member, subject, text, opts = {}) {
    const to = member && (member.email || member.rEmail);
    return dispatchEmailNotification({
      eventType: opts.eventType || 'MEMBER_NOTIFICATION',
      eventKey: opts.eventKey || '',
      to: to || '',
      recipientId: (member && member.memberId) || opts.recipientId || '',
      subject,
      text,
      metadata: opts.metadata || {}
    });
  }

  function notifyAdminEmail(subject, text, opts = {}) {
    return dispatchEmailNotification({
      eventType: opts.eventType || 'ADMIN_NOTIFICATION',
      eventKey: opts.eventKey || '',
      to: adminContactEmail,
      recipientId: 'ADMIN',
      subject,
      text,
      metadata: opts.metadata || {}
    });
  }

  function ltMember(id) {
    return db.members.find(m => m.memberId === id) || null;
  }

  function findMember(q) {
    const s = String(q || '').toLowerCase();
    return db.members.filter(m => (m.name + ' ' + m.memberId + ' ' + m.mobile).toLowerCase().includes(s));
  }

  function direct(id) {
    if (!id) return [];
    const seenIds = new Set();
    const seenMobiles = new Set();
    const out = [];
    for (const m of db.members) {
      if (!isQualifyingMember(m)) continue;
      if (m.referral !== id) continue;
      if (m.memberId === id) continue;
      if (seenIds.has(m.memberId)) continue;
      const mob = String(m.mobile || '').trim();
      if (mob && seenMobiles.has(mob)) continue;
      seenIds.add(m.memberId);
      if (mob) seenMobiles.add(mob);
      out.push(m);
    }
    return out;
  }

  function descendants(rootId) {
    const levels = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    let current = [rootId];
    const visited = new Set([rootId]);
    for (let l = 1; l <= 7; l++) {
      const nextMembers = [];
      for (const pid of current) {
        for (const m of direct(pid)) {
          if (!visited.has(m.memberId)) {
            visited.add(m.memberId);
            nextMembers.push(m);
          }
        }
      }
      levels[l] = nextMembers;
      current = nextMembers.map(m => m.memberId);
      if (!current.length) break;
    }
    return levels;
  }

  function tree(rootId) {
    const root = ltMember(rootId);
    if (!root) return { name: 'நீங்கள்', id: 'Not Registered', children: [] };
    const visited = new Set([rootId]);
    const kids = (id) => direct(id)
      .filter(m => {
        if (visited.has(m.memberId)) return false;
        visited.add(m.memberId);
        return true;
      })
      .map(m => ({
        name: m.name,
        id: m.memberId,
        status: m.status,
        level: Number(m.level || 1),
        children: kids(m.memberId)
      }));
    return { name: root.name, id: root.memberId, status: root.status, level: Number(root.level || 1), children: kids(root.memberId) };
  }

  function wallet(memberId) {
    const ps = db.pins.filter(p => p.assignedTo === memberId);
    return {
      received: ps.length,
      used: ps.filter(p => p.status === 'USED').length,
      available: ps.filter(p => p.status === 'AVAILABLE').length,
      pins: ps.slice(-50)
    };
  }

  function downlineCount(id) {
    let count = 0;
    const queue = [id];
    const seen = new Set([id]);
    while (queue.length) {
      const cur = queue.shift();
      for (const m of direct(cur)) {
        if (!seen.has(m.memberId)) {
          seen.add(m.memberId);
          count++;
          queue.push(m.memberId);
        }
      }
    }
    return count;
  }

  function ltTree(id) {
    const root = ltMember(id);
    if (!root) return null;
    const seen = new Set([root.memberId]);
    const make = m => ({
      memberId: m.memberId,
      name: m.name,
      mobile: m.mobile,
      status: m.status,
      level: Number(m.level || 1),
      levelMemberId: m.levelMemberId || null,
      children: direct(m.memberId)
        .filter(c => {
          if (seen.has(c.memberId)) return false;
          seen.add(c.memberId);
          return true;
        })
        .map(make)
    });
    return make(root);
  }

  function nextLevelMemberId(level) {
    const prefix = 'L' + level + '-';
    const nums = db.members
      .map(m => String(m.levelMemberId || ''))
      .filter(x => x.startsWith(prefix))
      .map(x => Number(x.slice(prefix.length)))
      .filter(Number.isFinite);
    return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
  }

  function activeAdminAccounts() {
    return (db.paymentSettings.admins || []).filter(x => x.active !== false);
  }

  function allocateAdminAccount(level) {
    const a = activeAdminAccounts();
    if (!a.length) return null;
    const l = Number(level || 0);
    if ([4, 5, 6, 7].includes(l)) {
      db.paymentSettings.adminRotationByLevel = db.paymentSettings.adminRotationByLevel || { 4: 0, 5: 0, 6: 0, 7: 0 };
      const idx = Number(db.paymentSettings.adminRotationByLevel[l] || 0) % a.length;
      const chosen = a[idx];
      db.paymentSettings.adminRotationByLevel[l] = (idx + 1) % a.length;
      return { ...chosen };
    }
    const idx = Number(db.paymentSettings.adminRotationIndex || 0) % a.length;
    const chosen = a[idx];
    db.paymentSettings.adminRotationIndex = (idx + 1) % a.length;
    return { ...chosen };
  }

  function allocateAdminAccountForRequest(r) {
    if (r && r.assignedAdminAccount && r.assignedAdminAccount.id) {
      return { ...r.assignedAdminAccount };
    }
    const level = Number(r?.to || 0);
    const chosen = allocateAdminAccount(level);
    if (r && chosen) r.assignedAdminAccount = { ...chosen };
    return chosen;
  }

  function latestPaymentForUpgrade(upgradeId) {
    return (
      db.leveltrackPayments
        .filter(x => x.upgradeId === upgradeId && !x._superseded)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] ||
      db.leveltrackPayments
        .filter(x => x.upgradeId === upgradeId)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] ||
      null
    );
  }

  function paymentDeadlineAt(p) {
    if (!p) return null;
    if (p.expiresAt) return p.expiresAt;
    const start = Date.parse(p.detailsSentAt || p.createdAt || '');
    return Number.isFinite(start) ? new Date(start + PAYMENT_DEADLINE_MS).toISOString() : null;
  }

  function paymentIsExpired(p) {
    if (!p || p.adminApproved || p.memberPaid || p.slotReleased || p.rejected || p.status === 'REJECTED' || p.status === 'RELEASED' || p.status === 'REASSIGNED') return false;
    const d = Date.parse(paymentDeadlineAt(p) || '');
    return Number.isFinite(d) && Date.now() >= d;
  }

  function paymentPublic(p) {
    if (!p) return p;
    const u = db.leveltrackUpgrades.find(x => x.id === p.upgradeId) || null;
    const req = db.leveltrackRequests.find(x => x.id === (p.requestId || u?.requestId)) || null;
    const sender = ltMember(p.fromMemberId) || null;
    const receiver = ltMember(p.receiverMemberId) || null;
    const memberPart = (p.parts || []).find(x => x.type === 'member') || null;
    const expiresAt = paymentDeadlineAt(p);
    const expired = paymentIsExpired(p);
    const isRejected = !!(p.rejected || p.status === 'REJECTED');
    const kind = p.kind || u?.kind || req?.kind || 'LEVEL_UPGRADE';
    const fromLevel = Number(p.fromLevel ?? u?.from ?? req?.from ?? 1);
    const toLevel = Number(p.toLevel ?? u?.to ?? req?.to ?? 2);
    const seniorityLevel = kind === 'REFERRAL_UPGRADE' ? 2 : Number(p.seniorityLevel || u?.seniorityLevel || req?.seniorityLevel || toLevel || 2);
    const screenshot = memberPart?.screenshot || p.screenshot || null;
    const proofRef = memberPart?.proofRef || p.proofRef || (screenshot ? `/api/leveltrack/proofs/${encodeURIComponent(p.id)}/member` : null);
    const verificationStatus = isRejected ? 'REJECTED' : (p.adminApproved ? 'APPROVED' : (p.memberAccepted ? 'RECEIVER_CONFIRMED' : (p.memberPaid ? 'PROOF_SUBMITTED' : 'ASSIGNED')));
    const approvalStatus = isRejected ? 'REJECTED' : (p.adminApproved ? 'APPROVED' : 'PENDING');
    return {
      ...p,
      paymentId: p.id,
      requestId: p.requestId || u?.requestId || req?.id || '',
      upgradeId: p.upgradeId || u?.id || '',
      senderMemberId: p.fromMemberId,
      fromMemberId: p.fromMemberId,
      senderName: sender?.name || p.from || p.fromMemberId,
      senderMobile: sender?.mobile || '',
      receiverMemberId: p.receiverMemberId,
      payeeId: p.payeeId || p.receiverMemberId,
      receiverName: receiver?.name || p.to || p.receiverMemberId,
      kind,
      from: fromLevel,
      to: toLevel,
      fromLevel,
      toLevel,
      seniorityLevel,
      receiverAmount: Number(memberPart?.amount || p.amount || 0),
      utr: memberPart?.utr || p.utr || '',
      screenshot,
      proofRef,
      submittedAt: p.submittedAt || memberPart?.submittedAt || null,
      verificationStatus,
      approvalStatus,
      rejected: isRejected,
      rejectedAt: p.rejectedAt || null,
      rejectionReason: p.rejectionReason || '',
      expiresAt,
      expired,
      locked: !!p.paymentAccessLocked || expired,
      isTestPayment: !!(p.isTestPayment || sender?.isTestAccount || receiver?.isTestAccount),
      adminContactEmail
    };
  }

  function seniorityQueue(level, options = {}) {
    const target = Number(level);
    const ignoreRequestId = options && options.ignoreRequestId ? String(options.ignoreRequestId) : '';
    const validMembers = db.members.filter(isQualifyingMember);
    const firstMember = [...validMembers].sort((a, b) => String(a.joinedAt || a.registeredAt || a.createdAt || '').localeCompare(String(b.joinedAt || b.registeredAt || b.createdAt || '')))[0] || null;
    const seenIds = new Set();
    const eligible = [];
    for (const m of validMembers) {
      if (seenIds.has(m.memberId)) continue;
      const reached = m.levelReachedAt && m.levelReachedAt[target];
      if (!!reached || Number(m.level || 1) >= target) {
        seenIds.add(m.memberId);
        eligible.push(m);
      }
    }
    if (firstMember && target >= 2 && !seenIds.has(firstMember.memberId)) {
      seenIds.add(firstMember.memberId);
      eligible.push(firstMember);
    }
    eligible.sort((a, b) => {
      if (seniorityTestMode || a._seniorityTestOrder || b._seniorityTestOrder) {
        const ao = Number(a._seniorityTestOrder || 999999);
        const bo = Number(b._seniorityTestOrder || 999999);
        if (ao !== bo) return ao - bo;
      }
      if (firstMember && a.memberId === firstMember.memberId && b.memberId !== firstMember.memberId && !a._seniorityTestOrder && !b._seniorityTestOrder) return -1;
      if (firstMember && b.memberId === firstMember.memberId && a.memberId !== firstMember.memberId && !a._seniorityTestOrder && !b._seniorityTestOrder) return 1;
      const at = (m) => String((m.levelReachedAt && m.levelReachedAt[target]) || m.upgradeDate || m.joinedAt || m.registeredAt || m.createdAt || '');
      const cmp = at(a).localeCompare(at(b));
      return cmp !== 0 ? cmp : String(a.memberId || '').localeCompare(String(b.memberId || ''));
    });

    return eligible.map((m, i) => {
      const countedUpgradeIds = new Set();
      const allocatedRequests = [];
      const completedPayments = db.leveltrackPayments.filter(p => {
        if (p.receiverMemberId !== m.memberId || !p.adminApproved || !p.memberAccepted || p.rejected || p.status === 'REJECTED') return false;
        const u = db.leveltrackUpgrades.find(x => x.id === p.upgradeId);
        if (!u || !u.adminApproved) return false;
        const paymentLevel = u.kind === 'REFERRAL_UPGRADE' ? 2 : Number(p.seniorityLevel || u.seniorityLevel || u.to || 0);
        if (paymentLevel !== target) return false;
        if (countedUpgradeIds.has(u.id)) return false;
        countedUpgradeIds.add(u.id);
        allocatedRequests.push({
          requestId: String(p.requestId || u.requestId || ''),
          paymentId: p.id,
          payerMemberId: p.fromMemberId,
          payerName: p.from || p.fromMemberId,
          kind: u.kind || 'LEVEL_UPGRADE',
          amount: Number(p.amount || u.amount || 0),
          stage: 'APPROVED'
        });
        return true;
      });
      const completed = completedPayments.length;
      const required = earningsRequired(target);
      const reservedRequestIds = new Set();
      const activeAssignedPayments = db.leveltrackPayments.filter(p => {
        const pLevel = p.kind === 'REFERRAL_UPGRADE' ? 2 : Number(p.seniorityLevel || 2);
        if (p.receiverMemberId !== m.memberId || pLevel !== target) return false;
        if (p.adminApproved || p.slotReleased || p.rejected || p.status === 'REJECTED' || p.status === 'RELEASED' || p.status === 'REASSIGNED' || p.paymentAccessLocked || p._superseded) return false;
        const u = db.leveltrackUpgrades.find(x => x.id === p.upgradeId);
        if (!u || u.adminApproved) return false;
        const reqId = String(p.requestId || u.requestId || '');
        if (ignoreRequestId && reqId === ignoreRequestId) return false;
        const latest = latestPaymentForUpgrade(p.upgradeId);
        if (!latest || latest.id !== p.id) return false;
        if (reqId) {
          if (reservedRequestIds.has(reqId)) return false;
          reservedRequestIds.add(reqId);
        }
        allocatedRequests.push({
          requestId: reqId,
          paymentId: p.id,
          payerMemberId: p.fromMemberId,
          payerName: p.from || p.fromMemberId,
          kind: p.kind || u.kind || 'LEVEL_UPGRADE',
          amount: Number(p.amount || u.amount || 0),
          stage: p.memberAccepted ? 'RECEIVER_CONFIRMED' : (p.memberPaid ? 'PROOF_SUBMITTED' : 'ASSIGNED')
        });
        return true;
      }).length;
      const preReservedRequests = db.leveltrackRequests.filter(r => {
        if (!r || r.status !== 'Requested') return false;
        if (ignoreRequestId && r.id === ignoreRequestId) return false;
        if (r.reservedReceiverId !== m.memberId) return false;
        const rLevel = r.kind === 'REFERRAL_UPGRADE' ? 2 : Number(r.seniorityLevel || r.to || 2);
        if (rLevel !== target) return false;
        if (reservedRequestIds.has(r.id)) return false;
        reservedRequestIds.add(r.id);
        const payer = ltMember(r.memberId);
        allocatedRequests.push({
          requestId: r.id,
          paymentId: '',
          payerMemberId: r.memberId,
          payerName: payer?.name || r.memberId,
          kind: r.kind || 'LEVEL_UPGRADE',
          amount: r.kind === 'REFERRAL_UPGRADE' ? 1000 : Number(LEVEL_RULES[r.from]?.upgrade || 0),
          stage: 'RESERVED'
        });
        return true;
      }).length;
      const reserved = activeAssignedPayments + preReservedRequests;
      const occupied = completed + reserved;
      const availableSlots = Math.max(0, required - occupied);
      const isCompleted = completed >= required;
      return {
        position: i + 1,
        memberId: m.memberId,
        name: m.name,
        mobile: m.mobile,
        levelMemberId: m.levelMemberId || null,
        reachedAt: (m.levelReachedAt && m.levelReachedAt[target]) || m.joinedAt || m.registeredAt || m.createdAt || null,
        completed,
        reserved,
        occupied,
        required,
        availableSlots,
        isCompleted,
        queueSection: isCompleted ? 'COMPLETED' : 'CURRENT',
        status: isCompleted ? 'COMPLETED' : (occupied >= required ? 'RESERVED' : 'ACTIVE'),
        allocatedRequests
      };
    });
  }

  function nextSeniorReceiver(level, excludeMemberIds = '', options = {}) {
    const excluded = new Set(
      (Array.isArray(excludeMemberIds) ? excludeMemberIds : String(excludeMemberIds || '').split(','))
        .map(x => String(x || '').trim())
        .filter(Boolean)
    );
    const reqId = options && options.requestId ? String(options.requestId) : '';
    const queue = seniorityQueue(level, { ignoreRequestId: reqId });
    if (reqId) {
      const reqObj = db.leveltrackRequests.find(x => x.id === reqId);
      if (reqObj && reqObj.reservedReceiverId && !excluded.has(reqObj.reservedReceiverId)) {
        const reservedRow = queue.find(x => x.memberId === reqObj.reservedReceiverId && x.availableSlots > 0);
        if (reservedRow) return reservedRow;
      }
    }
    return queue.find(x => x.availableSlots > 0 && !excluded.has(x.memberId)) || null;
  }

  function completedReferralUpgrades(memberId) {
    return db.leveltrackUpgrades.filter(u => u.memberId === memberId && u.kind === 'REFERRAL_UPGRADE' && u.adminApproved).length;
  }

  function pendingLeveltrackRequest(memberId) {
    return db.leveltrackRequests.find(r => r.memberId === memberId && !['Completed', 'Released', 'Blacklisted', 'Rejected'].includes(r.status)) || null;
  }

  function referralUpgradeState(m) {
    const refs = direct(m.memberId).length;
    const availableBatches = refs < 3 ? 0 : 1 + Math.floor((refs - 3) / 2);
    const completed = completedReferralUpgrades(m.memberId);
    const currentLevel = Math.max(1, Number(m.level || 1));
    const requiredExtraBeforeNextLevel = Math.max(0, currentLevel - 1);
    return {
      refs,
      availableBatches,
      completed,
      currentLevel,
      requiredExtraBeforeNextLevel,
      extraAvailable: Math.max(0, availableBatches - 1) > completed && completed < requiredExtraBeforeNextLevel
    };
  }

  function nextMemberAction(m) {
    if (m.paymentAccessLocked) return { type: 'NONE', paymentAccessLocked: true };
    const pending = pendingLeveltrackRequest(m.memberId);
    if (pending) return { type: pending.kind === 'REFERRAL_UPGRADE' ? 'REFERRAL_UPGRADE' : 'LEVEL_UPGRADE', request: pending };
    if (Number(m.level || 1) >= 7) return { type: 'NONE' };
    const st = referralUpgradeState(m);
    if (st.extraAvailable) return { type: 'REFERRAL_UPGRADE', cycle: st.completed + 1, seniorityLevel: 2 };
    const need = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11, 6: 13 }[st.currentLevel] || 0;
    if (st.refs >= need && st.completed >= st.requiredExtraBeforeNextLevel) return { type: 'LEVEL_UPGRADE', from: st.currentLevel, to: st.currentLevel + 1 };
    return { type: 'NONE' };
  }

  function ltHistory(memberId) {
    return db.leveltrackUpgrades
      .filter(u => u.memberId === memberId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(u => {
        const p = latestPaymentForUpgrade(u.id);
        const req = db.leveltrackRequests.find(r => r.id === u.requestId);
        const expired = p ? paymentIsExpired(p) : false;
        let statusLabel = 'Pending';
        if (u.adminApproved || p?.adminApproved) statusLabel = 'Approved';
        else if (p?.rejected || p?.status === 'REJECTED' || req?.status === 'Rejected') statusLabel = 'Rejected';
        else if (req?.status === 'Blacklisted') statusLabel = 'Blacklisted';
        else if (req?.status === 'Released' || p?.status === 'RELEASED') statusLabel = 'Released';
        else if (p?.status === 'REASSIGNED') statusLabel = 'Reassigned';
        else if (expired || p?.paymentAccessLocked) statusLabel = 'Expired';
        else if (p?.memberAccepted || u.receiverApproved) statusLabel = 'Receiver Confirmed';
        else if (p?.memberPaid || u.memberPaid) statusLabel = 'Proof Submitted';
        else if (req?.status === 'Assigned') statusLabel = 'Assigned';
        return {
          id: u.id,
          requestId: u.requestId,
          paymentId: p?.id || '',
          kind: u.kind || 'LEVEL_UPGRADE',
          seniorityLevel: u.kind === 'REFERRAL_UPGRADE' ? 2 : (u.seniorityLevel || u.to),
          from: u.from,
          to: u.to,
          amount: u.amount,
          utr: u.utr || p?.utr || '',
          memberId: u.memberId,
          payeeId: u.payeeId || p?.receiverMemberId || '',
          payee: u.payee || p?.to || '',
          memberPaid: !!u.memberPaid,
          receiverApproved: !!u.receiverApproved,
          adminApproved: !!u.adminApproved,
          statusLabel,
          date: u.completedAt || u.createdAt
        };
      });
  }

  function ltDashboard(memberId) {
    const m = ltMember(memberId);
    if (!m) return null;
    if (!m.level) m.level = 1;
    if (m.status === 'Verified' && !m.levelMemberId) m.levelMemberId = nextLevelMemberId(m.level);
    const requests = db.leveltrackRequests.filter(r => r.memberId === memberId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const pendingRequest = pendingLeveltrackRequest(memberId);
    let upgrade = (pendingRequest && db.leveltrackUpgrades.find(u => u.requestId === pendingRequest.id)) || null;
    if (upgrade && pendingRequest) upgrade = { ...pendingRequest, ...upgrade };
    if (!upgrade && pendingRequest && pendingRequest.status === 'Assigned') upgrade = { ...pendingRequest };
    if (upgrade && String(upgrade.status || '').toLowerCase() === 'assigned') {
      const saved = latestPaymentForUpgrade(upgrade.id);
      upgrade = {
        ...pendingRequest,
        ...upgrade,
        payment: saved
          ? paymentPublic(saved)
          : {
              payee: upgrade.payee || '',
              payeeId: upgrade.payeeId || '',
              payeePhone: upgrade.payeePhone || '',
              accountHolder: upgrade.accountHolder || '',
              bank: upgrade.bank || '',
              account: upgrade.account || '',
              ifsc: upgrade.ifsc || '',
              branch: upgrade.branch || '',
              upi: upgrade.upi || '',
              amount: upgrade.amount || 0,
              parts: upgrade.paymentParts || []
            }
      };
    }
    const action = nextMemberAction(m);
    const payments = db.leveltrackPayments.filter(p => p.receiverMemberId === memberId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const incomingPayments = payments
      .filter(p => p.memberPaid === true && !p.adminApproved && !p.rejected && p.status !== 'REJECTED' && !p.slotReleased && p.status !== 'RELEASED' && p.status !== 'REASSIGNED' && !p._superseded)
      .map(paymentPublic);
    const receiverPayments = payments
      .filter(p => p.memberPaid === true || p.memberAccepted === true || p.adminApproved === true || p.rejected === true || p.status === 'REJECTED')
      .map(paymentPublic);
    const earnings = Object.keys(LEVEL_SLOT_CAPACITY).map(l => {
      const level = Number(l);
      const seenUpgrades = new Set();
      const completed = payments.filter(p => {
        const u = db.leveltrackUpgrades.find(x => x.id === p.upgradeId);
        if (!u || !p.memberAccepted || !p.adminApproved || !u.adminApproved || p.rejected || p.status === 'REJECTED') return false;
        const paymentLevel = u.kind === 'REFERRAL_UPGRADE' ? 2 : Number(p.seniorityLevel || u.seniorityLevel || u.to || 0);
        if (paymentLevel !== level) return false;
        if (seenUpgrades.has(u.id)) return false;
        seenUpgrades.add(u.id);
        return true;
      }).length;
      return { level, required: LEVEL_SLOT_CAPACITY[level], completed };
    });
    const directReferrals = direct(memberId).length;
    const requiredDirectReferrals = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11, 6: 13 }[Number(m.level || 1)] || 0;
    const msgs = [
      ...db.messages.filter(x => x.to === memberId || x.to === 'ALL'),
      ...db.leveltrackMessages.filter(x => x.to === memberId)
    ]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .map(x => ({ message: x.message, at: x.at }));
    return {
      member: memberPublic(m),
      directReferrals,
      directReferralCount: directReferrals,
      totalDownline: downlineCount(memberId),
      tree: ltTree(memberId),
      upgrade,
      requests,
      incomingPayments,
      receiverPayments,
      history: ltHistory(memberId),
      earnings,
      seniority: seniorityQueue(Number(m.level || 1)).find(x => x.memberId === memberId) || null,
      requiredDirectReferrals,
      referralUpgradeState: referralUpgradeState(m),
      messages: msgs,
      action
    };
  }

  function buildAdminDashboardPayload() {
    const levels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    db.members.forEach(m => {
      const l = Math.min(7, Math.max(1, Number(m.level || 1)));
      levels[l]++;
    });
    const requests = db.leveltrackRequests
      .map(r => ({
        ...r,
        seniorityLevel: r.kind === 'REFERRAL_UPGRADE' ? 2 : (r.seniorityLevel || r.to),
        directReferralCount: direct(r.memberId).length
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const upgrades = db.leveltrackUpgrades
      .map(u => ({
        ...u,
        seniorityLevel: u.kind === 'REFERRAL_UPGRADE' ? 2 : (u.seniorityLevel || u.to)
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const payments = db.leveltrackPayments
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(paymentPublic);
    const seniority = {
      2: seniorityQueue(2),
      3: seniorityQueue(3),
      4: seniorityQueue(4),
      5: seniorityQueue(5),
      6: seniorityQueue(6),
      7: seniorityQueue(7)
    };
    const seniorityCurrent = {};
    const seniorityCompleted = {};
    [2, 3, 4, 5, 6, 7].forEach(l => {
      seniorityCurrent[l] = (seniority[l] || []).filter(x => x.status !== 'COMPLETED');
      seniorityCompleted[l] = (seniority[l] || []).filter(x => x.status === 'COMPLETED');
    });
    return {
      levels,
      slotCapacities: LEVEL_SLOT_CAPACITY,
      members: db.members.map(memberPublic),
      requests,
      upgrades,
      payments,
      paymentSettings: db.paymentSettings,
      seniority,
      seniorityCurrent,
      seniorityCompleted,
      emailNotifications: {
        smtpConfigured,
        count: (db.emailNotificationLog || []).length,
        recent: (db.emailNotificationLog || []).slice(-25).reverse()
      },
      persistence: {
        ok: true,
        mode: 'cloudflare-d1',
        database: 'b5-level-tracking',
        d1Binding: 'DB',
        lastSaveAt: lastD1SaveAt,
        lastSaveError: lastD1SaveError,
        pendingRetry: false
      }
    };
  }

  function seedSeniorityTestDataIntoState() {
    let root = db.members.find(m => String(m.referralId || '').toUpperCase() === SENIORITY_TEST_REF);
    if (!root) {
      root = {
        memberId: 'B5-FC329E',
        referralId: SENIORITY_TEST_REF,
        name: 'Seniority Test Root',
        mobile: '7999999999',
        email: '',
        status: 'ACTIVE',
        referral: 'FIRST MEMBER',
        level: 1,
        levelMemberId: 'L1-TEST-ROOT',
        joinedAt: '2000-01-01T00:00:00.000Z',
        registeredAt: '2000-01-01T00:00:00.000Z',
        levelReachedAt: {
          2: '2000-01-01T00:00:00.000Z',
          3: '2000-01-01T00:00:00.000Z',
          4: '2000-01-01T00:00:00.000Z',
          5: '2000-01-01T00:00:00.000Z',
          6: '2000-01-01T00:00:00.000Z',
          7: '2000-01-01T00:00:00.000Z'
        },
        passwordHash: hashPassword('B5@123456'),
        place: 'TEST',
        accountHolder: 'Seniority Test Root',
        bank: 'TEST BANK',
        account: 'TEST-ROOT',
        ifsc: 'TEST0000001',
        branch: 'TEST',
        upi: 'testroot@upi',
        profileLocked: true,
        isTestAccount: true,
        testTag: 'SAFE_TEST_MODE'
      };
      db.members.push(root);
    } else {
      root.isTestAccount = true;
      root.testTag = 'SAFE_TEST_MODE';
    }
    const rootId = root.memberId;
    SENIORITY_TEST_IDS.forEach(([memberId, mobile], i) => {
      let m = db.members.find(x => x.memberId === memberId);
      const stamp = `2000-01-02T00:00:${String(i).padStart(2, '0')}.000Z`;
      const reached = {};
      for (let l = 2; l <= 7; l++) reached[l] = stamp;
      if (!m) {
        m = {
          memberId,
          mobile,
          name: memberId,
          referral: rootId,
          referralId: referralCode(memberId),
          status: 'ACTIVE',
          level: 1,
          levelMemberId: `L1-TEST-${String(i + 1).padStart(2, '0')}`,
          joinedAt: stamp,
          registeredAt: stamp,
          levelReachedAt: reached,
          passwordHash: hashPassword('B5@123456'),
          place: 'TEST',
          accountHolder: memberId,
          bank: 'TEST BANK',
          account: `TEST-${String(i + 1).padStart(4, '0')}`,
          ifsc: 'TEST0000001',
          branch: 'TEST',
          upi: `${memberId.toLowerCase()}@upi`,
          profileLocked: true,
          _seniorityTestOrder: i + 1,
          isTestAccount: true,
          testTag: 'SAFE_TEST_MODE'
        };
        db.members.push(m);
      } else {
        m.status = 'ACTIVE';
        m.referral = m.referral || rootId;
        m.level = 1;
        m.levelReachedAt = { ...(m.levelReachedAt || {}), ...reached };
        m._seniorityTestOrder = i + 1;
        m.isTestAccount = true;
        m.testTag = 'SAFE_TEST_MODE';
      }
    });
    const testTrees = [
      { memberId: 'B5-MOBTEST01', referralId: 'REF-MOBTEST01', name: 'Mobile Test Parent 1', mobile: '7888888801', prefix: 'M1T' },
      { memberId: 'B5-MOBTEST02', referralId: 'REF-MOBTEST02', name: 'Mobile Test Parent 2', mobile: '7888888802', prefix: 'M2T' }
    ];
    testTrees.forEach((t, ti) => {
      let r = db.members.find(m => m.memberId === t.memberId || String(m.referralId || '').toUpperCase() === t.referralId);
      if (!r) {
        r = {
          memberId: t.memberId,
          referralId: t.referralId,
          name: t.name,
          mobile: t.mobile,
          email: '',
          status: 'ACTIVE',
          referral: 'FIRST MEMBER',
          level: 1,
          levelMemberId: `L1-MOBTEST-${ti + 1}`,
          joinedAt: `2026-01-01T00:00:0${ti}.000Z`,
          registeredAt: `2026-01-01T00:00:0${ti}.000Z`,
          passwordHash: hashPassword('B5@123456'),
          place: 'TEST',
          accountHolder: t.name,
          bank: 'TEST BANK',
          account: `TEST-MOBILE-${ti + 1}`,
          ifsc: 'TEST0000001',
          branch: 'TEST',
          upi: `${t.prefix.toLowerCase()}@upi`,
          profileLocked: true,
          isTestAccount: true,
          testTag: 'SAFE_TEST_MODE'
        };
        db.members.push(r);
      } else {
        r.isTestAccount = true;
        r.testTag = 'SAFE_TEST_MODE';
      }
      for (let i = 1; i <= 13; i++) {
        const memberId = `${t.prefix}${String(i).padStart(2, '0')}`;
        const mobile = String(7300000000 + ti * 100 + i);
        const stamp = `2026-01-0${ti + 1}T00:${String(i).padStart(2, '0')}:00.000Z`;
        let child = db.members.find(m => m.memberId === memberId || m.mobile === mobile);
        if (!child) {
          child = {
            memberId,
            mobile,
            name: `${t.prefix} Referral ${String(i).padStart(2, '0')}`,
            email: '',
            status: 'ACTIVE',
            referral: r.memberId,
            referralId: referralCode(memberId),
            level: 1,
            levelMemberId: `L1-${t.prefix}-${String(i).padStart(3, '0')}`,
            joinedAt: stamp,
            registeredAt: stamp,
            passwordHash: hashPassword('B5@123456'),
            place: 'TEST',
            accountHolder: `${t.prefix} Referral ${i}`,
            bank: 'TEST BANK',
            account: `TEST-${t.prefix}-${String(i).padStart(2, '0')}`,
            ifsc: 'TEST0000001',
            branch: 'TEST',
            upi: `${memberId.toLowerCase()}@upi`,
            profileLocked: true,
            isTestAccount: true,
            testTag: 'SAFE_TEST_MODE'
          };
          db.members.push(child);
        } else {
          child.isTestAccount = true;
          child.testTag = 'SAFE_TEST_MODE';
        }
      }
    });
  }

  return {
    db,
    smtpConfigured,
    adminContactEmail,
    createAuthToken,
    verifyAuthToken,
    dispatchEmailNotification,
    notifyMemberEmail,
    notifyAdminEmail,
    ltMember,
    findMember,
    direct,
    descendants,
    tree,
    wallet,
    downlineCount,
    ltTree,
    nextLevelMemberId,
    activeAdminAccounts,
    allocateAdminAccount,
    allocateAdminAccountForRequest,
    latestPaymentForUpgrade,
    paymentDeadlineAt,
    paymentIsExpired,
    paymentPublic,
    seniorityQueue,
    nextSeniorReceiver,
    completedReferralUpgrades,
    pendingLeveltrackRequest,
    referralUpgradeState,
    nextMemberAction,
    ltHistory,
    ltDashboard,
    buildAdminDashboardPayload,
    seedSeniorityTestDataIntoState
  };
}

function parseCookiesHeader(cookieHeader) {
  const out = {};
  const raw = String(cookieHeader || '');
  raw.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

function extractAuthContext(headers, query, verifyAuthToken) {
  const cookies = parseCookiesHeader(headers['cookie'] || '');
  const bearer = String(headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const qToken = String(query.authToken || '').trim();
  const adminCandidates = [headers['x-admin-token'], bearer, qToken, cookies.b5_admin_token].filter(Boolean);
  let isAdmin = false;
  let memberId = null;
  for (const tok of adminCandidates) {
    const decoded = verifyAuthToken(String(tok));
    if (decoded?.role === 'admin') {
      isAdmin = true;
      break;
    }
    if (decoded?.role === 'member' && decoded.memberId && !memberId) {
      memberId = decoded.memberId;
    }
  }
  const memberCandidates = [headers['x-member-token'], bearer, qToken, cookies.b5_member_token].filter(Boolean);
  for (const tok of memberCandidates) {
    const decoded = verifyAuthToken(String(tok));
    if (decoded?.role === 'member' && decoded.memberId && !memberId) {
      memberId = decoded.memberId;
    }
    if (decoded?.role === 'admin') isAdmin = true;
  }
  return { isAdmin, memberId };
}

function matchRoute(pattern, pathname) {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = pathname.split('/').filter(Boolean);
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) {
      params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
    } else if (pParts[i] !== uParts[i]) {
      return null;
    }
  }
  return params;
}

function isBlockedInternalPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  return (
    p.startsWith('/data/') ||
    p.startsWith('/proofs/') ||
    p.startsWith('/tests/') ||
    p.startsWith('/_backups/') ||
    p.startsWith('/migrations/') ||
    p.startsWith('/src/') ||
    p === '/db.json' ||
    p.startsWith('/.env') ||
    p.startsWith('/.dev.vars') ||
    p === '/server.js' ||
    p === '/wrangler.toml' ||
    p.endsWith('.bak') ||
    p.endsWith('.bak2') ||
    p.endsWith('.sql')
  );
}

/**
 * Handles any API request against Cloudflare D1 (`env.DB`)
 * Returns { status, headers, body, isBinary }
 */
async function handleApiRequest({ method, pathname, query = {}, headers = {}, body = {}, env = {}, smtpSender = null }) {
  const d1 = env.DB;
  if (!d1) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Cloudflare D1 database binding (env.DB -> b5-level-tracking) is missing.' }
    };
  }

  const configuredAdminPwd = env.B5_ADMIN_PASSWORD || (String(env.B5_LOCAL_TEST_ONLY || '') === '1' ? 'ADMIN' : null);
  const state = await loadStateFromD1(d1, configuredAdminPwd);
  const prevMap = buildSnapshotMap(state);
  const ctx = createSessionContext(state, env, smtpSender);
  const extraProofs = [];

  async function saveChanges() {
    try {
      await commitStateToD1(d1, prevMap, state, extraProofs);
      lastD1SaveAt = new Date().toISOString();
      lastD1SaveError = null;
    } catch (e) {
      lastD1SaveError = e.message;
      throw e;
    }
  }

  const auth = extractAuthContext(headers, query, ctx.verifyAuthToken);
  const respHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  function json(status, payload, extraH = {}) {
    return { status, headers: { ...respHeaders, ...extraH }, body: payload };
  }

  // Admin RBAC check for /api/admin/* and /api/leveltrack/admin/*
  const publicAdminRoutes = new Set(['/api/admin/login', '/api/admin/logout', '/api/admin/bootstrap-status', '/api/admin/bootstrap']);
  if (pathname.startsWith('/api/admin/') || pathname.startsWith('/api/leveltrack/admin/')) {
    if (!publicAdminRoutes.has(pathname)) {
      if (!auth.isAdmin) {
        if (auth.memberId) {
          return json(403, { error: 'Forbidden: Admin role required. Member accounts cannot access administrative APIs.' });
        }
        return json(401, { error: 'Admin authentication required. Please sign in to the Admin Portal.' });
      }
    }
  }

  // First-Admin Bootstrap Procedure (No Hardcoded Public Credentials)
  if (method === 'GET' && pathname === '/api/admin/bootstrap-status') {
    return json(200, {
      ok: true,
      bootstrapRequired: !state.adminPassword,
      tokenRequired: !!env.B5_ADMIN_BOOTSTRAP_TOKEN,
      database: 'b5-level-tracking',
      d1Binding: 'DB'
    });
  }

  if (method === 'POST' && pathname === '/api/admin/bootstrap') {
    if (state.adminPassword) {
      return json(409, { error: 'First-admin bootstrap has already been completed. Use the normal Admin Login or Change Password flow.' });
    }
    if (env.B5_ADMIN_BOOTSTRAP_TOKEN && String(body.bootstrapToken || '').trim() !== String(env.B5_ADMIN_BOOTSTRAP_TOKEN)) {
      return json(403, { error: 'Invalid B5_ADMIN_BOOTSTRAP_TOKEN.' });
    }
    const newPassword = String(body.newPassword || body.password || '').trim();
    const confirmPassword = body.confirmPassword !== undefined ? String(body.confirmPassword || '').trim() : newPassword;
    if (newPassword.length < 4) {
      return json(400, { error: 'Initial Admin password must be at least 4 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return json(400, { error: 'Password confirmation does not match.' });
    }
    state.adminPassword = newPassword;
    state.adminBootstrapCompleted = true;
    const now = new Date().toISOString();
    if (!state.pins.some(x => x.status === 'AVAILABLE')) {
      state.pins.push({ pin: 'PIN-START1', assignedTo: null, status: 'AVAILABLE', usedBy: null, createdAt: now, system: true });
    }
    const adminToken = ctx.createAuthToken({ role: 'admin' });
    await saveChanges();
    return json(200, {
      ok: true,
      bootstrapCompleted: true,
      role: 'admin',
      adminToken,
      rootPin: 'PIN-START1'
    }, {
      'Set-Cookie': `b5_admin_token=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; SameSite=Lax`
    });
  }

  // 1. Health & D1 Persistence Status
  if (method === 'GET' && pathname === '/api/db-status') {
    return json(200, {
      ok: true,
      persistence: 'cloudflare-d1',
      database: 'b5-level-tracking',
      d1Binding: 'DB',
      bootstrapRequired: !state.adminPassword,
      members: state.members.length,
      pins: state.pins.length,
      requests: state.leveltrackRequests.length,
      upgrades: state.leveltrackUpgrades.length,
      payments: state.leveltrackPayments.length,
      lastSaveAt: lastD1SaveAt,
      pendingRetry: false
    });
  }

  // 2. Payment Proof Image Serving from D1
  const proofParams = method === 'GET' && matchRoute('/api/leveltrack/proofs/:paymentId/:partType', pathname);
  if (proofParams) {
    const pid = String(proofParams.paymentId || '').trim();
    const ptype = String(proofParams.partType || 'member').trim();
    const p = state.leveltrackPayments.find(x => x.id === pid);
    if (!auth.isAdmin && !auth.memberId) {
      return json(401, { error: 'Authentication required to view payment proof.' });
    }
    if (!auth.isAdmin) {
      const authorizedMember = p && (auth.memberId === p.fromMemberId || auth.memberId === p.receiverMemberId || auth.memberId === p.payeeId);
      if (!authorizedMember) {
        return json(403, { error: 'Forbidden: Only the payer, assigned receiver, or Admin may view this payment proof.' });
      }
    }
    const d1Proof = await getProofFromD1(d1, pid, ptype);
    const part = p ? (p.parts || []).find(x => x.type === ptype) : null;
    const rawDataUri = d1Proof?.data_uri || part?.screenshot || p?.screenshot || '';
    const m = String(rawDataUri).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      return {
        status: 200,
        isBinary: true,
        headers: {
          'Content-Type': m[1],
          'Cache-Control': 'private, max-age=3600'
        },
        body: buf
      };
    }
    return json(404, { error: 'Payment proof image not found in Cloudflare D1' });
  }

  // 3. Admin Auth & Portal APIs
  if (method === 'POST' && pathname === '/api/admin/login') {
    if (!state.adminPassword) {
      return json(403, { error: 'First-admin bootstrap is required before logging in. Complete setup via First-Time Admin Bootstrap.', bootstrapRequired: true });
    }
    if (String(body.password || '') !== state.adminPassword) {
      return json(401, { error: 'Incorrect password' });
    }
    const adminToken = ctx.createAuthToken({ role: 'admin' });
    ctx.notifyAdminEmail(
      'BORNTOWIN5 - Admin Login Security Alert',
      `Admin portal login succeeded at ${new Date().toISOString()}.`,
      { eventType: 'LOGIN_SECURITY', eventKey: `ADMIN_LOGIN:${new Date().toISOString().slice(0, 16)}` }
    );
    await saveChanges();
    return json(200, { ok: true, role: 'admin', adminToken }, {
      'Set-Cookie': `b5_admin_token=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; SameSite=Lax`
    });
  }

  if (method === 'POST' && pathname === '/api/admin/logout') {
    return json(200, { ok: true }, {
      'Set-Cookie': 'b5_admin_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    });
  }

  if (method === 'GET' && pathname === '/api/admin/session') {
    return json(200, { ok: true, role: 'admin' });
  }

  if (method === 'POST' && pathname === '/api/admin/password') {
    if (String(body.oldPassword || '') !== state.adminPassword) {
      return json(401, { error: 'Current password is incorrect' });
    }
    const nextPwd = String(body.newPassword || '').trim();
    if (nextPwd.length < 4) {
      return json(400, { error: 'New password must be at least 4 characters' });
    }
    state.adminPassword = nextPwd;
    const adminToken = ctx.createAuthToken({ role: 'admin' });
    await saveChanges();
    return json(200, { ok: true, adminToken }, {
      'Set-Cookie': `b5_admin_token=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; SameSite=Lax`
    });
  }

  if (method === 'GET' && pathname === '/api/admin/dashboard') {
    const today = new Date().toISOString().slice(0, 10);
    const total = state.members.length;
    const pending = state.members.filter(m => m.status === 'Pending').length;
    const verified = state.members.filter(m => m.status === 'Verified').length;
    const todayMembers = state.members.filter(m => String(m.registeredAt || m.joinedAt || '').slice(0, 10) === today);
    const report = state.members.map(m => {
      const w = ctx.wallet(m.memberId);
      return { name: m.name, memberId: m.memberId, received: w.received, used: w.used, available: w.available };
    });
    const sent = state.pins.filter(p => p.assignedTo).length;
    const used = state.pins.filter(p => p.status === 'USED').length;
    const leaders = new Set(state.pins.filter(p => p.assignedTo).map(p => p.assignedTo)).size;
    return json(200, {
      total,
      pending,
      verified,
      todayRegistrations: todayMembers.length,
      members: state.members.map(memberPublic),
      pinSummary: { sent, used, leaders },
      pinReport: report,
      persistence: { mode: 'cloudflare-d1', database: 'b5-level-tracking', d1Binding: 'DB' }
    });
  }

  if (method === 'GET' && pathname === '/api/admin/members') {
    return json(200, { members: ctx.findMember(query.q).map(memberPublic) });
  }

  const adminMemberDetailsParams = method === 'GET' && matchRoute('/api/admin/member-details/:id', pathname);
  if (adminMemberDetailsParams) {
    const m = state.members.find(x => x.memberId === adminMemberDetailsParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    const visited = new Set([m.memberId]);
    const kids = (id) => state.members
      .filter(x => x.referral === id)
      .filter(x => {
        if (visited.has(x.memberId)) return false;
        visited.add(x.memberId);
        return true;
      })
      .map(x => ({
        memberId: x.memberId,
        name: x.name,
        mobile: x.mobile,
        status: x.status,
        level: Number(x.level || 1),
        levelMemberId: x.levelMemberId || null,
        children: kids(x.memberId)
      }));
    return json(200, {
      member: memberPublic(m),
      details: m,
      referralTree: {
        memberId: m.memberId,
        name: m.name,
        mobile: m.mobile,
        status: m.status,
        level: Number(m.level || 1),
        levelMemberId: m.levelMemberId || null,
        children: kids(m.memberId)
      },
      directReferrals: ctx.direct(m.memberId).length,
      totalDownline: ctx.downlineCount(m.memberId)
    });
  }

  if (method === 'GET' && pathname === '/api/admin/password-reset-requests') {
    return json(200, {
      requests: state.passwordResetRequests
        .filter(x => x.status === 'Pending')
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    });
  }

  const pwdResetApproveParams = method === 'POST' && matchRoute('/api/admin/password-reset/:id', pathname);
  if (pwdResetApproveParams) {
    const r = state.passwordResetRequests.find(x => x.id === pwdResetApproveParams.id);
    if (!r) return json(404, { error: 'Reset request not found' });
    const m = state.members.find(x => x.memberId === r.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    let temp = String(body.temporaryPassword || '');
    if (temp.length < 6) temp = 'B5@' + crypto.randomBytes(3).toString('hex');
    m.passwordHash = hashPassword(temp);
    m.mustChangePassword = true;
    r.status = 'Approved';
    r.approvedAt = new Date().toISOString();
    r.temporaryPassword = temp;
    state.messages.push({
      to: m.memberId,
      message: 'Admin approved your password reset. Temporary password: ' + temp + '. Login and change your password.',
      at: new Date().toISOString()
    });
    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Password Reset Approved',
      `Hello ${m.name},\n\nAdmin approved your password reset request.\nTemporary password: ${temp}\nPlease sign in and change your password immediately.`,
      { eventType: 'LOGIN_SECURITY', eventKey: `PWD_RESET_APPROVED:${r.id}` }
    );
    await saveChanges();
    return json(200, { ok: true, temporaryPassword: temp, member: memberPublic(m) });
  }

  if (method === 'POST' && pathname === '/api/admin/member-status') {
    const m = state.members.find(x => x.memberId === body.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    const allowedStatuses = ['Pending', 'Verified', 'ACTIVE', 'Rejected'];
    const nextStatus = String(body.status || '').trim();
    if (!allowedStatuses.includes(nextStatus)) {
      return json(400, { error: 'Invalid member status' });
    }
    m.status = nextStatus;
    if (nextStatus === 'Verified') {
      if (!m.level) m.level = 1;
      if (!m.levelMemberId) m.levelMemberId = ctx.nextLevelMemberId(m.level);
      if (!m.joinedAt) m.joinedAt = nextMonotonicIso();
    }
    await saveChanges();
    return json(200, { ok: true, member: memberPublic(m) });
  }

  if (method === 'POST' && pathname === '/api/admin/message') {
    const msgText = String(body.message || '').trim();
    if (!msgText) return json(400, { error: 'Message cannot be empty' });
    const now = new Date().toISOString();
    if (body.to === 'all') {
      state.messages.push({ to: 'ALL', message: msgText, at: now });
      ctx.notifyAdminEmail(
        'BORNTOWIN5 - Admin Broadcast Announcement',
        `Broadcast Announcement to ALL members:\n\n${msgText}`,
        { eventType: 'ADMIN_ANNOUNCEMENT', eventKey: `ADMIN_MSG_ALL:${now}`, metadata: { to: 'ALL', message: msgText } }
      );
    } else {
      const targetMember = state.members.find(m => m.memberId === body.memberId);
      if (!targetMember) return json(404, { error: 'Member not found' });
      state.messages.push({ to: targetMember.memberId, message: msgText, at: now });
      ctx.notifyMemberEmail(
        targetMember,
        'BORNTOWIN5 - Official Admin Message',
        `Hello ${targetMember.name},\n\nMessage from BORNTOWIN5 Admin:\n${msgText}`,
        { eventType: 'ADMIN_ANNOUNCEMENT', eventKey: `ADMIN_MSG:${targetMember.memberId}:${now}`, metadata: { to: targetMember.memberId, message: msgText } }
      );
    }
    await saveChanges();
    return json(200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/admin/pins/generate') {
    const m = state.members.find(x => x.memberId === body.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    const n = Math.min(500, Math.max(1, Number(body.quantity) || 1));
    const out = [];
    for (let i = 0; i < n; i++) {
      let p = makePin();
      while (state.pins.some(x => x.pin === p)) p = makePin();
      const row = { pin: p, assignedTo: m.memberId, status: 'AVAILABLE', usedBy: null, createdAt: new Date().toISOString() };
      state.pins.push(row);
      out.push(row);
    }
    await saveChanges();
    const w = ctx.wallet(m.memberId);
    return json(200, { pins: out, member: memberPublic(m), available: w.available, used: w.used });
  }

  const adminMemberProfileParams = method === 'POST' && matchRoute('/api/admin/member-profile/:id', pathname);
  if (adminMemberProfileParams) {
    const m = state.members.find(x => x.memberId === adminMemberProfileParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    for (const k of ['name', 'place', 'accountHolder', 'bank', 'account', 'ifsc', 'branch', 'upi']) {
      if (body[k] !== undefined) m[k] = String(body[k]).trim();
    }
    if (!m.name || !m.place || !m.accountHolder || !m.bank || !m.account || !m.ifsc || !m.branch || !m.upi) {
      return json(400, { error: 'Please complete all profile and bank details' });
    }
    m.profileLocked = true;
    await saveChanges();
    return json(200, { ok: true, member: memberPublic(m), profile: memberProfile(m) });
  }

  // 4. Member Auth & Portal APIs
  const referralInfoParams = method === 'GET' && matchRoute('/api/member/referral-info/:id', pathname);
  if (referralInfoParams) {
    const id = String(referralInfoParams.id || '').trim().toUpperCase();
    if (!id || id === 'FIRST MEMBER') return json(200, { valid: id === 'FIRST MEMBER', member: null });
    const m = state.members.find(x => String(x.memberId || '').toUpperCase() === id || String(x.referralId || '').toUpperCase() === id || referralCode(x.memberId) === id);
    if (!m || m.status === 'Rejected') return json(404, { valid: false, error: 'Referral ID not found' });
    return json(200, {
      valid: true,
      member: {
        memberId: m.memberId,
        referralId: m.referralId || referralCode(m.memberId),
        name: m.name,
        mobile: m.mobile,
        level: Number(m.level || 1)
      }
    });
  }

  if (method === 'POST' && pathname === '/api/member/login') {
    const m = state.members.find(x => x.mobile === String(body.mobile || '').trim());
    if (!m) return json(404, { error: 'Member not found. Please register first.' });
    const supplied = String(body.password || '');
    if (!m.passwordHash) return json(401, { error: 'Password not set. Please use Forgot Password and contact Admin.' });
    if (hashPassword(supplied) !== m.passwordHash) return json(401, { error: 'Incorrect password' });
    const memberToken = ctx.createAuthToken({ role: 'member', memberId: m.memberId });
    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Login Security Alert',
      `Hello ${m.name},\n\nYour BORNTOWIN5 account (${m.memberId}) was signed in at ${new Date().toISOString()}.`,
      { eventType: 'LOGIN_SECURITY', eventKey: `MEMBER_LOGIN:${m.memberId}:${new Date().toISOString().slice(0, 16)}` }
    );
    await saveChanges();
    return json(200, { member: { ...memberPublic(m), mustChangePassword: !!m.mustChangePassword }, memberToken }, {
      'Set-Cookie': `b5_member_token=${encodeURIComponent(memberToken)}; Path=/; HttpOnly; SameSite=Lax`
    });
  }

  if (method === 'POST' && pathname === '/api/member/logout') {
    return json(200, { ok: true }, {
      'Set-Cookie': 'b5_member_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    });
  }

  if (method === 'POST' && pathname === '/api/member/forgot-password') {
    const mobile = String(body.mobile || '').trim();
    const m = state.members.find(x => x.mobile === mobile);
    if (!m) return json(404, { error: 'Mobile number not found' });
    const pending = state.passwordResetRequests.find(x => x.memberId === m.memberId && x.status === 'Pending');
    if (pending) return json(200, { ok: true, message: 'Password reset request already sent to Admin.' });
    const prId = 'PR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    state.passwordResetRequests.push({
      id: prId,
      memberId: m.memberId,
      mobile: m.mobile,
      name: m.name,
      status: 'Pending',
      createdAt: new Date().toISOString()
    });
    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Password Reset Requested',
      `Hello ${m.name},\n\nA password reset was requested for your account (${m.memberId}). Admin will review your request shortly.`,
      { eventType: 'LOGIN_SECURITY', eventKey: `PWD_RESET_REQ:${prId}` }
    );
    await saveChanges();
    return json(200, { ok: true, message: 'Password reset request sent to Admin. Please contact Admin after approval.' });
  }

  const memberPwdParams = method === 'POST' && matchRoute('/api/member/password/:id', pathname);
  if (memberPwdParams) {
    const m = state.members.find(x => x.memberId === memberPwdParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    if (!m.passwordHash || hashPassword(body.oldPassword) !== m.passwordHash) {
      return json(401, { error: 'Current password is incorrect' });
    }
    const np = String(body.newPassword || '');
    if (np.length < 6) return json(400, { error: 'New password must be at least 6 characters' });
    m.passwordHash = hashPassword(np);
    m.mustChangePassword = false;
    await saveChanges();
    return json(200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/member/check-pin') {
    const p = String(body.pin || '').toUpperCase().trim();
    if (!state.pins.some(x => x.pin === p && x.status === 'AVAILABLE')) {
      return json(400, { error: 'Invalid or unavailable Joining PIN' });
    }
    return json(200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/member/register') {
    const b = body || {};
    const name = String(b.name || '').trim();
    if (!name) return json(400, { error: 'Full name is required' });
    const mobile = String(b.mobile || '').trim();
    if (!/^\d{10}$/.test(mobile)) return json(400, { error: 'Mobile number must be 10 digits' });
    if (state.members.some(m => m.mobile === mobile)) return json(409, { error: 'Mobile number already registered' });
    const suppliedPwd = String(b.password || '');
    if (suppliedPwd.length < 4) return json(400, { error: 'Password must be at least 4 characters' });
    const p = String(b.pin || '').toUpperCase().trim();
    const pr = state.pins.find(x => x.pin === p && x.status === 'AVAILABLE');
    if (!pr) return json(400, { error: 'Invalid or unavailable Joining PIN' });

    let parentId = 'FIRST MEMBER';
    if (String(b.referral || 'FIRST MEMBER').toUpperCase().trim() !== 'FIRST MEMBER') {
      const ref = String(b.referral || '').trim().toUpperCase();
      const parent = state.members.find(x => String(x.memberId || '').toUpperCase() === ref || String(x.referralId || '').toUpperCase() === ref || referralCode(x.memberId) === ref);
      if (!parent || parent.status === 'Rejected') return json(400, { error: 'Invalid Referral ID' });
      parentId = parent.memberId;
    }

    const memberId = makeMemberId();
    const nowIso = nextMonotonicIso();
    // Strictly sanitize user input so callers can never inject level, status, seniority, or payment fields
    const m = {
      memberId,
      referralId: referralCode(memberId),
      name,
      place: String(b.place || '').trim(),
      mobile,
      email: String(b.email || b.rEmail || '').trim(),
      referral: parentId,
      level: 1,
      levelMemberId: null,
      status: 'Pending',
      joinedAt: null,
      registeredAt: nowIso,
      upgradeDate: null,
      levelReachedAt: {},
      accountHolder: String(b.accountHolder || '').trim(),
      bank: String(b.bank || '').trim(),
      account: String(b.account || '').trim(),
      ifsc: String(b.ifsc || '').trim(),
      branch: String(b.branch || '').trim(),
      upi: String(b.upi || '').trim(),
      photo: String(b.photo || '').slice(0, 1200000),
      profileLocked: false,
      paymentAccessLocked: false,
      paymentReviewStatus: '',
      passwordHash: hashPassword(suppliedPwd),
      mustChangePassword: false
    };
    state.members.push(m);
    pr.status = 'USED';
    pr.usedBy = m.memberId;
    pr.usedAt = new Date().toISOString();

    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Registration Successful',
      `Hello ${m.name},\n\nYour BORNTOWIN5 registration was successful.\nMember ID: ${m.memberId}\nMobile: ${m.mobile}\n\nThank you for joining BORNTOWIN5.`,
      { eventType: 'REGISTRATION_CONFIRMATION', eventKey: `REGISTER:${m.memberId}`, metadata: { memberId: m.memberId, mobile: m.mobile } }
    );
    const memberToken = ctx.createAuthToken({ role: 'member', memberId: m.memberId });
    await saveChanges();
    return json(200, { member: memberPublic(m), memberToken }, {
      'Set-Cookie': `b5_member_token=${encodeURIComponent(memberToken)}; Path=/; HttpOnly; SameSite=Lax`
    });
  }

  const getProfileParams = method === 'GET' && matchRoute('/api/member/profile/:id', pathname);
  if (getProfileParams) {
    const m = state.members.find(x => x.memberId === getProfileParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    return json(200, { profile: memberProfile(m) });
  }

  const postProfileParams = method === 'POST' && matchRoute('/api/member/profile/:id', pathname);
  if (postProfileParams) {
    const m = state.members.find(x => x.memberId === postProfileParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    if (m.profileLocked) return json(403, { error: 'Profile is locked. Please contact Admin for changes.' });
    const b = body || {};
    // Only allow profile & bank fields; never allow modifying level, status, seniority, or referral
    for (const k of ['name', 'place', 'accountHolder', 'bank', 'account', 'ifsc', 'branch', 'upi']) {
      if (b[k] !== undefined) m[k] = String(b[k]).trim();
    }
    if (b.photo !== undefined) {
      const photo = String(b.photo);
      if (photo.length > 1200000) return json(400, { error: 'Profile photo is too large' });
      m.photo = photo;
    }
    if (!m.name || !m.place || !m.accountHolder || !m.bank || !m.account || !m.ifsc || !m.branch || !m.upi) {
      return json(400, { error: 'Please complete all profile and bank details' });
    }
    m.profileLocked = true;
    await saveChanges();
    return json(200, { ok: true, member: memberPublic(m), profile: memberProfile(m) });
  }

  const memberDashParams = method === 'GET' && matchRoute('/api/member/dashboard/:id', pathname);
  if (memberDashParams) {
    const m = state.members.find(x => x.memberId === memberDashParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    const lv = ctx.descendants(m.memberId);
    const w = ctx.wallet(m.memberId);
    const levels = {};
    for (let i = 1; i <= 7; i++) levels[i] = lv[i].map(memberPublic);
    const messages = [
      ...state.messages.filter(x => x.to === m.memberId || x.to === 'ALL'),
      ...state.leveltrackMessages.filter(x => x.to === m.memberId)
    ]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 10)
      .map(x => ({ to: x.to, message: x.message, at: x.at }));
    return json(200, {
      member: memberPublic(m),
      profile: memberProfile(m),
      levels,
      tree: ctx.tree(m.memberId),
      wallet: w,
      messages
    });
  }

  const memberLevelParams = method === 'GET' && matchRoute('/api/member/level/:id/:level', pathname);
  if (memberLevelParams) {
    const m = state.members.find(x => x.memberId === memberLevelParams.id);
    const l = Number(memberLevelParams.level);
    if (!m || l < 1 || l > 7) return json(404, { error: 'Not found' });
    const lv = ctx.descendants(m.memberId);
    return json(200, { members: lv[l].map(memberPublic) });
  }

  if (method === 'POST' && pathname === '/api/member/use-pin') {
    const p = state.pins.find(x => x.assignedTo === body.memberId && x.status === 'AVAILABLE');
    if (!p) return json(400, { error: 'No available PIN' });
    p.status = 'USED';
    p.usedBy = body.memberId;
    p.usedAt = new Date().toISOString();
    await saveChanges();
    return json(200, { wallet: ctx.wallet(body.memberId) });
  }

  // 5. LevelTrack Admin APIs
  if (method === 'POST' && pathname === '/api/leveltrack/admin/staging-reset') {
    const isLocalTest = String(env.B5_LOCAL_TEST_ONLY || '') === '1';
    const isProdEnv = String(env.NODE_ENV || '').toLowerCase() === 'production';
    if (!isLocalTest || isProdEnv) {
      return json(403, { error: 'FORBIDDEN: Staging test-data reset is strictly disabled in production or on primary D1 instances.' });
    }
    await resetD1ToFreshSchema(d1, configuredAdminPwd);
    const freshState = await loadStateFromD1(d1, configuredAdminPwd);
    const freshMap = buildSnapshotMap(freshState);
    const freshCtx = createSessionContext(freshState, env, smtpSender);
    if (String(env.B5_SENIORITY_TEST_MODE || '') === '1') {
      freshCtx.seedSeniorityTestDataIntoState();
      await commitStateToD1(d1, freshMap, freshState, []);
    }
    return json(200, { ok: true, message: 'Isolated local D1 staging database reset.', members: freshState.members.length, testSeeded: String(env.B5_SENIORITY_TEST_MODE || '') === '1' });
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/email-log') {
    const logs = Array.isArray(state.emailNotificationLog) ? state.emailNotificationLog : [];
    return json(200, { ok: true, smtpConfigured: ctx.smtpConfigured, count: logs.length, logs: logs.slice().reverse() });
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/dashboard') {
    return json(200, ctx.buildAdminDashboardPayload());
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/status') {
    const activeRequests = state.leveltrackRequests.filter(r => r.status !== 'Completed');
    const sigParts = activeRequests.map(r => {
      const u = state.leveltrackUpgrades.find(x => x.requestId === r.id);
      const p = u ? ctx.latestPaymentForUpgrade(u.id) : null;
      const exp = p ? ctx.paymentIsExpired(p) : false;
      return `${r.id}:${r.status}:${u?.id || ''}:${!!u?.memberPaid}:${!!p?.memberAccepted}:${!!u?.adminApproved}:${exp ? 1 : 0}`;
    });
    return json(200, {
      ok: true,
      d1Enabled: true,
      database: 'b5-level-tracking',
      d1Binding: 'DB',
      members: state.members.length,
      signature: `${state.members.length}|${state.leveltrackRequests.length}|${state.leveltrackUpgrades.filter(u => u.adminApproved).length}|${sigParts.join(',')}`,
      activeRequests: activeRequests.length,
      persistence: {
        ok: true,
        mode: 'cloudflare-d1',
        database: 'b5-level-tracking',
        d1Binding: 'DB',
        lastSaveAt: lastD1SaveAt,
        pendingRetry: false
      }
    });
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/members') {
    return json(200, { members: ctx.findMember(query.q).map(memberPublic) });
  }

  const ltAdminMemberDetailsParams = method === 'GET' && matchRoute('/api/leveltrack/admin/member-details/:id', pathname);
  if (ltAdminMemberDetailsParams) {
    const m = ctx.ltMember(ltAdminMemberDetailsParams.id);
    if (!m) return json(404, { error: 'Member not found' });
    return json(200, {
      member: {
        ...memberPublic(m),
        accountHolder: m.accountHolder || m.name || '',
        account: m.account || '',
        ifsc: m.ifsc || '',
        bank: m.bank || '',
        branch: m.branch || '',
        upi: m.upi || ''
      },
      directReferrals: ctx.direct(m.memberId).length,
      totalDownline: ctx.downlineCount(m.memberId),
      tree: ctx.ltTree(m.memberId)
    });
  }

  const nextReceiverParams = method === 'GET' && matchRoute('/api/leveltrack/admin/next-receiver/:level', pathname);
  if (nextReceiverParams) {
    const level = Number(nextReceiverParams.level);
    if (![2, 3, 4, 5, 6, 7].includes(level)) return json(400, { error: 'Invalid target level' });
    const receiver = ctx.nextSeniorReceiver(level, String(query.excludeMemberId || ''), { requestId: String(query.requestId || '') });
    return json(200, { receiver: receiver || null });
  }

  const assignReqParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/assign', pathname);
  if (assignReqParams) {
    return withAllocationLock(async () => {
      const freshState = await loadStateFromD1(d1, configuredAdminPwd);
      const freshMap = buildSnapshotMap(freshState);
      const freshCtx = createSessionContext(freshState, env, smtpSender);

      const r = freshState.leveltrackRequests.find(x => x.id === assignReqParams.id);
      if (!r) return json(404, { error: 'Upgrade request not found' });
      if (r.status === 'Assigned') {
        const u = freshState.leveltrackUpgrades.find(x => x.requestId === r.id);
        const payment = u ? freshCtx.latestPaymentForUpgrade(u.id) : null;
        if (u && payment) return json(200, { ok: true, alreadyAssigned: true, request: r, upgrade: u, payment: freshCtx.paymentPublic(payment) });
        return json(409, { error: 'Request is marked Assigned but its payment record is missing. Please refresh Admin and retry.' });
      }
      if (r.status !== 'Requested') return json(400, { error: 'Request is not pending' });
      const m = freshCtx.ltMember(r.memberId);
      if (!m) return json(404, { error: 'Member not found' });
      if (m.paymentAccessLocked) return json(423, { error: 'Member payment access is locked pending Admin review.' });
      const isReferral = r.kind === 'REFERRAL_UPGRADE';
      const targetLevel = isReferral ? 2 : Number(r.to);
      const amount = isReferral ? 1000 : Number(LEVEL_RULES[r.from]?.upgrade || 0);
      if (!amount) return json(400, { error: 'Upgrade amount not configured' });
      const autoReceiver = freshCtx.nextSeniorReceiver(targetLevel, m.memberId, { requestId: r.id });
      const receiver = autoReceiver ? freshCtx.ltMember(autoReceiver.memberId) : null;
      if (!receiver) return json(400, { error: 'No eligible seniority receiver with available slot capacity is available for this level.' });
      const sr = isReferral ? { upgrade: amount, parts: [{ type: 'member', label: 'MEMBER / RECEIVER', amount }] } : splitRule(r.from);
      const parts = sr.parts.map(x => ({ ...x }));
      const rec = parts.find(x => x.type === 'member');
      if (rec) {
        rec.accountDetails = {
          name: receiver.name,
          memberId: receiver.memberId,
          mobile: receiver.mobile,
          accountHolder: receiver.accountHolder || receiver.name || '',
          bank: receiver.bank || '',
          account: receiver.account || '',
          ifsc: receiver.ifsc || '',
          branch: receiver.branch || '',
          upi: receiver.upi || ''
        };
      }
      const tr = parts.find(x => x.type === 'trust');
      if (tr) tr.accountDetails = { ...freshState.paymentSettings.trust };
      const ap = parts.findIndex(x => x.type === 'admin');
      if (ap >= 0) {
        const aa = freshCtx.allocateAdminAccountForRequest(r);
        if (!aa) return json(400, { error: 'No active Admin account configured' });
        parts[ap].accountDetails = aa;
        parts[ap].adminAccountId = aa.id;
      }
      const now = nextMonotonicIso();
      let u = freshState.leveltrackUpgrades.find(x => x.requestId === r.id);
      if (!u) {
        u = {
          id: 'LTU-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
          requestId: r.id,
          memberId: m.memberId,
          from: r.from,
          to: r.to,
          kind: r.kind || 'LEVEL_UPGRADE',
          seniorityLevel: targetLevel,
          createdAt: now
        };
        freshState.leveltrackUpgrades.push(u);
      }
      Object.assign(r, {
        status: 'Assigned',
        upgradeId: u.id,
        reservedReceiverId: receiver.memberId,
        reservedPosition: autoReceiver.position,
        assignedAt: now,
        seniorityLevel: targetLevel,
        payee: receiver.name || '',
        accountHolder: receiver.accountHolder || receiver.name || '',
        payeeId: receiver.memberId,
        payeePhone: receiver.mobile || '',
        amount,
        account: receiver.account || '',
        bank: receiver.bank || '',
        ifsc: receiver.ifsc || '',
        branch: receiver.branch || '',
        upi: receiver.upi || '',
        paymentParts: parts
      });
      Object.assign(u, {
        amount,
        kind: r.kind || 'LEVEL_UPGRADE',
        seniorityLevel: targetLevel,
        payee: r.payee,
        accountHolder: r.accountHolder,
        payeeId: r.payeeId,
        payeePhone: r.payeePhone,
        account: r.account,
        bank: r.bank,
        ifsc: r.ifsc,
        branch: r.branch,
        upi: r.upi,
        paymentParts: parts,
        detailsSent: true,
        detailsSentAt: now
      });
      for (const prev of freshState.leveltrackPayments) {
        if (prev.upgradeId === u.id && !prev.adminApproved) {
          prev._superseded = true;
          if (prev.status === 'PENDING') prev.status = 'REASSIGNED';
        }
      }
      const payment = {
        id: 'LTP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        requestId: r.id,
        upgradeId: u.id,
        kind: r.kind || 'LEVEL_UPGRADE',
        fromLevel: r.from,
        toLevel: r.to,
        seniorityLevel: targetLevel,
        fromMemberId: m.memberId,
        receiverMemberId: receiver.memberId,
        payeeId: receiver.memberId,
        from: m.name,
        to: receiver.name,
        amount,
        parts: parts.map(x => ({ ...x, status: 'PENDING', utr: '', screenshot: null, proofRef: null })),
        memberPaid: false,
        memberAccepted: false,
        adminApproved: false,
        createdAt: now,
        detailsSentAt: now,
        expiresAt: new Date(Date.now() + PAYMENT_DEADLINE_MS).toISOString(),
        status: 'PENDING'
      };
      freshState.leveltrackPayments.push(payment);
      freshState.leveltrackMessages.push({
        to: m.memberId,
        message: r.kind === 'REFERRAL_UPGRADE'
          ? `Upgrade payment details sent. Seniority Level L2. Total ₹${amount.toLocaleString()}.`
          : `Payment details sent for L${r.from} → L${r.to}. Total ₹${amount.toLocaleString()}.`,
        at: now
      });
      freshCtx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - Upgrade Payment Details Assigned',
        `Hello ${m.name},\n\nAdmin has assigned payment details for your ${r.kind === 'REFERRAL_UPGRADE' ? 'Advanced Referral Upgrade (Seniority L2)' : 'Level ' + r.from + ' to Level ' + r.to + ' upgrade'}.\nRequest ID: ${r.id}\nPayment ID: ${payment.id}\nTotal amount: ₹${amount.toLocaleString()}\nPlease sign in to view the verified payment instructions.`,
        { eventType: 'PAYMENT_DETAILS_ASSIGNED_PAYER', eventKey: `ASSIGN_PAYER:${r.id}:${payment.id}`, metadata: { requestId: r.id, paymentId: payment.id, memberId: m.memberId } }
      );
      freshCtx.notifyMemberEmail(
        receiver,
        'BORNTOWIN5 - Incoming Payment Assigned',
        `Hello ${receiver.name},\n\nA payment request has been assigned to you from member ${m.memberId} (${m.name}).\nRequest ID: ${r.id}\nPayment ID: ${payment.id}\nPlease sign in to the Receiver page to review payment proof when submitted.`,
        { eventType: 'PAYMENT_ASSIGNED_RECEIVER', eventKey: `ASSIGN_RECEIVER:${r.id}:${payment.id}`, metadata: { requestId: r.id, paymentId: payment.id, receiverMemberId: receiver.memberId } }
      );
      await commitStateToD1(d1, freshMap, freshState, []);
      lastD1SaveAt = new Date().toISOString();
      return json(200, { ok: true, request: r, upgrade: u, payment: freshCtx.paymentPublic(payment) });
    });
  }

  const resendReqParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/resend-details', pathname);
  if (resendReqParams) {
    const r = state.leveltrackRequests.find(x => x.id === resendReqParams.id);
    if (!r) return json(404, { error: 'Upgrade request not found' });
    if (r.status !== 'Assigned') return json(400, { error: 'Payment details have not been assigned for this request yet.' });
    const u = state.leveltrackUpgrades.find(x => x.requestId === r.id);
    const p = u ? ctx.latestPaymentForUpgrade(u.id) : null;
    if (!u || !p) return json(400, { error: 'Payment details record not found for this request.' });
    if (ctx.paymentIsExpired(p)) return json(409, { error: 'Payment details expired. Use RESTORE & REASSIGN or EXTEND 24 HOURS from Admin review options.' });
    const m = ctx.ltMember(r.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    const amount = Number(u.amount || r.amount || p.amount || 0);
    const message = r.kind === 'REFERRAL_UPGRADE'
      ? `Upgrade payment details sent again. Seniority Level L2. Total ₹${amount.toLocaleString()}.`
      : `Payment details sent again for L${r.from} → L${r.to}. Total ₹${amount.toLocaleString()}.`;
    state.leveltrackMessages.push({ to: m.memberId, message, at: new Date().toISOString() });
    p.detailsSentAt = new Date().toISOString();
    p.expiresAt = new Date(Date.now() + PAYMENT_DEADLINE_MS).toISOString();
    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Upgrade Payment Details Resent',
      `Hello ${m.name},\n\nAdmin has resent payment details for your request ${r.id} (Payment ID: ${p.id}).`,
      { eventType: 'PAYMENT_DETAILS_ASSIGNED_PAYER', eventKey: `RESEND_PAYER:${r.id}:${Date.now()}`, metadata: { requestId: r.id, paymentId: p.id } }
    );
    await saveChanges();
    return json(200, { ok: true, message: 'Payment details sent again to the member.', request: r, upgrade: u, payment: ctx.paymentPublic(p) });
  }

  const extendDeadlineParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/extend-deadline', pathname);
  if (extendDeadlineParams) {
    return withAllocationLock(async () => {
      const r = state.leveltrackRequests.find(x => x.id === extendDeadlineParams.id);
      if (!r) return json(404, { error: 'Upgrade request not found' });
      const u = state.leveltrackUpgrades.find(x => x.requestId === r.id);
      const p = u ? ctx.latestPaymentForUpgrade(u.id) : null;
      if (!u || !p) return json(404, { error: 'Payment assignment not found' });
      if (p.memberPaid || p.adminApproved) return json(409, { error: 'Payment proof already submitted or approved; deadline cannot be extended.' });
      const now = new Date().toISOString();
      p.detailsSentAt = now;
      p.expiresAt = new Date(Date.now() + PAYMENT_DEADLINE_MS).toISOString();
      p.paymentAccessLocked = false;
      p.status = 'PENDING';
      u.paymentAccessLocked = false;
      r.status = 'Assigned';
      const m = ctx.ltMember(r.memberId);
      if (m) {
        m.paymentAccessLocked = false;
        state.leveltrackMessages.push({ to: m.memberId, message: `Your 24-hour payment deadline for request ${r.id} has been extended until ${p.expiresAt}.`, at: now });
        ctx.notifyMemberEmail(
          m,
          'BORNTOWIN5 - 24-Hour Payment Deadline Reminder & Extension',
          `Hello ${m.name},\n\nYour 24-hour payment deadline for request ${r.id} (Payment ID: ${p.id}) has been extended by 24 hours until ${p.expiresAt}.\nPlease submit your payment proof before the deadline expires.`,
          { eventType: 'DEADLINE_REMINDER', eventKey: `DEADLINE_EXTEND:${r.id}:${now}`, metadata: { requestId: r.id, paymentId: p.id, expiresAt: p.expiresAt } }
        );
      }
      await saveChanges();
      return json(200, { ok: true, message: 'Payment deadline extended by 24 hours.', payment: ctx.paymentPublic(p) });
    });
  }

  const deadlineReminderParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/deadline-reminder', pathname);
  if (deadlineReminderParams) {
    const r = state.leveltrackRequests.find(x => x.id === deadlineReminderParams.id);
    if (!r) return json(404, { error: 'Upgrade request not found' });
    const u = state.leveltrackUpgrades.find(x => x.requestId === r.id);
    const p = u ? ctx.latestPaymentForUpgrade(u.id) : null;
    const m = ctx.ltMember(r.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    const now = new Date().toISOString();
    const exp = p ? ctx.paymentDeadlineAt(p) : null;
    state.leveltrackMessages.push({ to: m.memberId, message: `Reminder: Please complete your upgrade payment for request ${r.id}${exp ? ' before ' + exp : ''}.`, at: now });
    const entry = ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - 24-Hour Payment Deadline Reminder',
      `Hello ${m.name},\n\nThis is a reminder to submit your upgrade payment proof for request ${r.id}${p ? ' (Payment ID: ' + p.id + ')' : ''}${exp ? ' before the 24-hour deadline at ' + exp : ''}.`,
      { eventType: 'DEADLINE_REMINDER', eventKey: `DEADLINE_REMINDER:${r.id}:${now}`, metadata: { requestId: r.id, paymentId: p?.id || '', expiresAt: exp } }
    );
    await saveChanges();
    return json(200, { ok: true, emailLog: entry });
  }

  const releaseSlotParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/release-slot', pathname);
  if (releaseSlotParams) {
    return withAllocationLock(async () => {
      const r = state.leveltrackRequests.find(x => x.id === releaseSlotParams.id);
      if (!r) return json(404, { error: 'Upgrade request not found' });
      const u = state.leveltrackUpgrades.find(x => x.requestId === r.id);
      const p = u ? ctx.latestPaymentForUpgrade(u.id) : null;
      if (p?.adminApproved) return json(409, { error: 'Approved payment cannot be released.' });
      if (p) {
        p.slotReleased = true;
        p.status = 'RELEASED';
        p.paymentAccessLocked = true;
      }
      if (u) u.paymentAccessLocked = true;
      r.status = 'Released';
      r.reservedReceiverId = null;
      const m = ctx.ltMember(r.memberId);
      if (m) {
        m.paymentAccessLocked = true;
        m.paymentReviewStatus = 'ADMIN_REVIEW';
        ctx.notifyMemberEmail(
          m,
          'BORNTOWIN5 - Upgrade Request Released for Review',
          `Hello ${m.name},\n\nYour upgrade request (${r.id}) slot was released pending Admin review.`,
          { eventType: 'UPGRADE_REQUEST_STATUS', eventKey: `REQ_RELEASED:${r.id}`, metadata: { requestId: r.id, status: 'Released' } }
        );
      }
      await saveChanges();
      return json(200, { ok: true, message: 'Seniority slot released. Request history preserved.' });
    });
  }

  const blacklistParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/blacklist-member', pathname);
  if (blacklistParams) {
    return withAllocationLock(async () => {
      const r = state.leveltrackRequests.find(x => x.id === blacklistParams.id);
      if (!r) return json(404, { error: 'Upgrade request not found' });
      const u = state.leveltrackUpgrades.find(x => x.requestId === r.id);
      const p = u ? ctx.latestPaymentForUpgrade(u.id) : null;
      const m = ctx.ltMember(r.memberId);
      if (!m) return json(404, { error: 'Member not found' });
      if (p?.adminApproved) return json(409, { error: 'Approved payment cannot be blacklisted.' });
      m.paymentAccessLocked = true;
      m.paymentReviewStatus = 'ADMIN_REVIEW';
      if (p) {
        p.paymentAccessLocked = true;
        p.slotReleased = true;
        p.status = 'REVIEW_LOCKED';
      }
      if (u) u.paymentAccessLocked = true;
      r.status = 'Blacklisted';
      r.reservedReceiverId = null;
      state.leveltrackMessages.push({ to: m.memberId, message: 'Your payment access is locked pending Admin review. Please contact Admin before proceeding.', at: new Date().toISOString() });
      ctx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - Payment Access Locked for Review',
        `Hello ${m.name},\n\nYour upgrade request (${r.id}) and payment access have been locked for Admin review.`,
        { eventType: 'UPGRADE_REQUEST_STATUS', eventKey: `REQ_BLACKLISTED:${r.id}`, metadata: { requestId: r.id, status: 'Blacklisted' } }
      );
      await saveChanges();
      return json(200, { ok: true, message: 'Member payment access locked for Admin review.' });
    });
  }

  const restoreReassignParams = method === 'POST' && matchRoute('/api/leveltrack/admin/requests/:id/restore-reassign', pathname);
  if (restoreReassignParams) {
    return withAllocationLock(async () => {
      const freshState = await loadStateFromD1(d1, configuredAdminPwd);
      const freshMap = buildSnapshotMap(freshState);
      const freshCtx = createSessionContext(freshState, env, smtpSender);

      const r = freshState.leveltrackRequests.find(x => x.id === restoreReassignParams.id);
      if (!r) return json(404, { error: 'Upgrade request not found' });
      const u = freshState.leveltrackUpgrades.find(x => x.requestId === r.id);
      const old = u ? freshCtx.latestPaymentForUpgrade(u.id) : null;
      const m = freshCtx.ltMember(r.memberId);
      if (!u || !old || !m) return json(404, { error: 'Request, upgrade or payment assignment not found' });
      if (old.adminApproved) return json(409, { error: 'Approved payment cannot be reassigned.' });
      old.slotReleased = true;
      old.status = 'REASSIGNED';
      old.paymentAccessLocked = true;
      old._superseded = true;
      r.reservedReceiverId = null;
      const level = r.kind === 'REFERRAL_UPGRADE' ? 2 : Number(old.seniorityLevel || u.seniorityLevel || r.to || 2);
      const receiverRow = freshCtx.nextSeniorReceiver(level, [old.receiverMemberId, m.memberId], { requestId: r.id }) || freshCtx.nextSeniorReceiver(level, m.memberId, { requestId: r.id });
      const receiver = receiverRow ? freshCtx.ltMember(receiverRow.memberId) : null;
      if (!receiver) {
        old.slotReleased = false;
        old.status = 'PENDING';
        old.paymentAccessLocked = false;
        old._superseded = false;
        return json(409, { error: 'No other eligible senior receiver is available for this level.' });
      }
      const now = nextMonotonicIso();
      const parts = (old.parts || []).map(x => ({ ...x, utr: '', screenshot: null, proofRef: null, submittedAt: null, status: 'PENDING' }));
      const memberPart = parts.find(x => x.type === 'member');
      if (memberPart) {
        memberPart.accountDetails = {
          name: receiver.name,
          memberId: receiver.memberId,
          mobile: receiver.mobile,
          accountHolder: receiver.accountHolder || receiver.name || '',
          bank: receiver.bank || '',
          account: receiver.account || '',
          ifsc: receiver.ifsc || '',
          branch: receiver.branch || '',
          upi: receiver.upi || ''
        };
      }
      const adminPart = parts.find(x => x.type === 'admin');
      if (adminPart) {
        const aa = freshCtx.allocateAdminAccountForRequest(r);
        if (aa) {
          adminPart.accountDetails = aa;
          adminPart.adminAccountId = aa.id;
        }
      }
      Object.assign(r, {
        status: 'Assigned',
        upgradeId: u.id,
        reservedReceiverId: receiver.memberId,
        reservedPosition: receiverRow.position,
        assignedAt: now,
        seniorityLevel: level,
        payee: receiver.name || '',
        accountHolder: receiver.accountHolder || receiver.name || '',
        payeeId: receiver.memberId,
        payeePhone: receiver.mobile || '',
        account: receiver.account || '',
        bank: receiver.bank || '',
        ifsc: receiver.ifsc || '',
        branch: receiver.branch || '',
        upi: receiver.upi || '',
        paymentParts: parts
      });
      Object.assign(u, {
        detailsSent: true,
        detailsSentAt: now,
        seniorityLevel: level,
        payee: receiver.name || '',
        accountHolder: receiver.accountHolder || receiver.name || '',
        payeeId: receiver.memberId,
        payeePhone: receiver.mobile || '',
        account: receiver.account || '',
        bank: receiver.bank || '',
        ifsc: receiver.ifsc || '',
        branch: receiver.branch || '',
        upi: receiver.upi || '',
        paymentParts: parts,
        paymentAccessLocked: false
      });
      const np = {
        ...old,
        id: 'LTP-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        requestId: r.id,
        to: receiver.name,
        receiverMemberId: receiver.memberId,
        payeeId: receiver.memberId,
        parts,
        memberPaid: false,
        memberAccepted: false,
        adminApproved: false,
        rejected: false,
        rejectedAt: null,
        rejectionReason: '',
        _superseded: false,
        createdAt: now,
        detailsSentAt: now,
        expiresAt: new Date(Date.now() + PAYMENT_DEADLINE_MS).toISOString(),
        status: 'PENDING',
        paymentAccessLocked: false,
        slotReleased: false,
        acceptedAt: null,
        submittedAt: null,
        utr: ''
      };
      freshState.leveltrackPayments.push(np);
      m.paymentAccessLocked = false;
      m.paymentReviewStatus = '';
      freshState.leveltrackMessages.push({ to: m.memberId, message: 'Admin restored your payment access and issued new receiver details. New 24-hour deadline starts now.', at: now });
      freshCtx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - New Payment Details Assigned',
        `Hello ${m.name},\n\nAdmin restored your payment access and assigned receiver details (Payment ID: ${np.id}).`,
        { eventType: 'PAYMENT_DETAILS_ASSIGNED_PAYER', eventKey: `REASSIGN_PAYER:${r.id}:${np.id}`, metadata: { requestId: r.id, paymentId: np.id } }
      );
      freshCtx.notifyMemberEmail(
        receiver,
        'BORNTOWIN5 - Incoming Payment Assigned',
        `Hello ${receiver.name},\n\nA payment request (${r.id}, Payment ID: ${np.id}) has been assigned to you from member ${m.memberId}.`,
        { eventType: 'PAYMENT_ASSIGNED_RECEIVER', eventKey: `REASSIGN_RECEIVER:${r.id}:${np.id}`, metadata: { requestId: r.id, paymentId: np.id } }
      );
      await commitStateToD1(d1, freshMap, freshState, []);
      lastD1SaveAt = new Date().toISOString();
      return json(200, { ok: true, message: 'New receiver details assigned with a fresh 24-hour deadline.', request: r, upgrade: u, payment: freshCtx.paymentPublic(np) });
    });
  }

  async function executeAdminApprovalForPayment(u, p, reqBody = {}) {
    const m = ctx.ltMember(u.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    if (reqBody.requestId && String(reqBody.requestId) !== String(u.requestId || p.requestId || '')) {
      return json(409, { error: 'Request ID mismatch for selected payment' });
    }
    if (reqBody.paymentId && String(reqBody.paymentId) !== String(p.id)) {
      return json(409, { error: 'Payment ID mismatch for selected upgrade' });
    }
    if (p.rejected || p.status === 'REJECTED') {
      return json(409, { error: 'Rejected payment cannot be approved' });
    }
    if (u.adminApproved && p.adminApproved) {
      return json(200, { ok: true, alreadyApproved: true, newLevel: Number(m.level || 1), member: memberPublic(m), upgrade: u, payment: ctx.paymentPublic(p) });
    }
    if (Number(m.level || 1) !== Number(u.from || 1)) return json(400, { error: 'Member level changed already' });
    const allPaid = (p.parts || []).every(x => ['SUBMITTED', 'CONFIRMED', 'APPROVED'].includes(x.status));
    if (!u.memberPaid || !allPaid || !p.memberAccepted) return json(400, { error: 'All payment proofs and receiver confirmation are required' });
    const approvedAt = nextMonotonicIso();
    p.parts = (p.parts || []).map(x => ({ ...x, status: 'APPROVED', adminApprovedAt: approvedAt }));
    p.adminApproved = true;
    p.adminVerifiedAt = approvedAt;
    p.status = 'APPROVED';
    u.receiverApproved = true;
    u.adminApproved = true;
    u.completedAt = approvedAt;
    u.status = 'Completed';
    const r = state.leveltrackRequests.find(x => x.id === u.requestId);
    if (r) {
      r.status = 'Completed';
      r.completedAt = approvedAt;
    }
    const receiver = ctx.ltMember(p.receiverMemberId);
    if (u.kind === 'REFERRAL_UPGRADE') {
      u.seniorityLevel = 2;
      p.seniorityLevel = 2;
      state.leveltrackMessages.push({ to: m.memberId, message: 'Upgrade completed. Your next Level Upgrade is now available when unlocked.', at: approvedAt });
      ctx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - Upgrade Request Approved',
        `Hello ${m.name},\n\nAdmin has approved your Advanced Referral Upgrade (Request ID: ${u.requestId}, Payment ID: ${p.id}). Your next upgrade is now unlocked.`,
        { eventType: 'FINAL_PAYMENT_APPROVED', eventKey: `FINAL_APPROVE_SENDER:${p.id}`, metadata: { requestId: u.requestId, paymentId: p.id, upgradeId: u.id } }
      );
      ctx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - Upgrade Request Status: Approved',
        `Hello ${m.name},\n\nYour upgrade request ${u.requestId} has been approved.`,
        { eventType: 'UPGRADE_REQUEST_STATUS', eventKey: `REQ_STATUS_APPROVED:${u.requestId}`, metadata: { requestId: u.requestId, status: 'Approved' } }
      );
      if (receiver) {
        ctx.notifyMemberEmail(
          receiver,
          'BORNTOWIN5 - Incoming Payment Final Approved',
          `Hello ${receiver.name},\n\nAdmin has finalized approval for incoming payment ${p.id} from ${m.memberId} (${m.name}).`,
          { eventType: 'FINAL_PAYMENT_APPROVED', eventKey: `FINAL_APPROVE_RECEIVER:${p.id}`, metadata: { requestId: u.requestId, paymentId: p.id, receiverMemberId: receiver.memberId } }
        );
      }
      await saveChanges();
      return json(200, { ok: true, newLevel: Number(m.level || 1), member: memberPublic(m), upgrade: u, payment: ctx.paymentPublic(p) });
    }
    m.level = Number(u.to);
    m.levelMemberId = ctx.nextLevelMemberId(m.level);
    m.levelReachedAt = { ...(m.levelReachedAt || {}), [String(u.to)]: approvedAt };
    m.upgradeDate = approvedAt;
    m.status = 'Verified';
    state.leveltrackMessages.push({ to: m.memberId, message: `Admin approved payment. Level upgrade completed. You are now Level ${m.level}.`, at: approvedAt });
    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Level Upgrade Completed',
      `Hello ${m.name},\n\nAdmin has approved your payment (Payment ID: ${p.id}, Request ID: ${u.requestId}). Your level upgrade is complete.\nCurrent level: ${m.level}\nMember ID: ${m.memberId}`,
      { eventType: 'FINAL_PAYMENT_APPROVED', eventKey: `FINAL_APPROVE_SENDER:${p.id}`, metadata: { requestId: u.requestId, paymentId: p.id, newLevel: m.level } }
    );
    ctx.notifyMemberEmail(
      m,
      'BORNTOWIN5 - Upgrade Request Status: Approved',
      `Hello ${m.name},\n\nYour Level ${u.from} → Level ${u.to} upgrade request (${u.requestId}) has been approved.`,
      { eventType: 'UPGRADE_REQUEST_STATUS', eventKey: `REQ_STATUS_APPROVED:${u.requestId}`, metadata: { requestId: u.requestId, status: 'Approved', newLevel: m.level } }
    );
    if (receiver) {
      ctx.notifyMemberEmail(
        receiver,
        'BORNTOWIN5 - Incoming Payment Final Approved',
        `Hello ${receiver.name},\n\nAdmin has finalized approval for incoming payment ${p.id} from ${m.memberId} (${m.name}).`,
        { eventType: 'FINAL_PAYMENT_APPROVED', eventKey: `FINAL_APPROVE_RECEIVER:${p.id}`, metadata: { requestId: u.requestId, paymentId: p.id, receiverMemberId: receiver.memberId } }
      );
    }
    await saveChanges();
    return json(200, { ok: true, newLevel: Number(m.level || 1), member: memberPublic(m), upgrade: u, payment: ctx.paymentPublic(p) });
  }

  const approveByUpgradeParams = method === 'POST' && matchRoute('/api/leveltrack/admin/payments/by-upgrade/:id/approve', pathname);
  if (approveByUpgradeParams) {
    const u = state.leveltrackUpgrades.find(x => x.id === approveByUpgradeParams.id);
    if (!u) return json(404, { error: 'Upgrade not found' });
    const p = body && body.paymentId
      ? state.leveltrackPayments.find(x => x.id === body.paymentId && x.upgradeId === u.id)
      : ctx.latestPaymentForUpgrade(u.id);
    if (!p) return json(400, { error: 'Payment not found' });
    const lockKey = `APPROVE:${u.id}:${p.id}`;
    if (activeMutationLocks.has(lockKey)) return json(409, { error: 'Approval already in progress for this payment' });
    activeMutationLocks.add(lockKey);
    try {
      return await executeAdminApprovalForPayment(u, p, body || {});
    } finally {
      activeMutationLocks.delete(lockKey);
    }
  }

  const approvePaymentParams = method === 'POST' && matchRoute('/api/leveltrack/admin/payments/:id/approve', pathname);
  if (approvePaymentParams) {
    const p = state.leveltrackPayments.find(x => x.id === approvePaymentParams.id);
    if (!p) return json(404, { error: 'Payment not found' });
    const u = state.leveltrackUpgrades.find(x => x.id === p.upgradeId);
    if (!u) return json(404, { error: 'Upgrade not found' });
    const lockKey = `APPROVE:${u.id}:${p.id}`;
    if (activeMutationLocks.has(lockKey)) return json(409, { error: 'Approval already in progress for this payment' });
    activeMutationLocks.add(lockKey);
    try {
      return await executeAdminApprovalForPayment(u, p, { ...(body || {}), paymentId: p.id });
    } finally {
      activeMutationLocks.delete(lockKey);
    }
  }

  const rejectPaymentParams = method === 'POST' && matchRoute('/api/leveltrack/admin/payments/:id/reject', pathname);
  if (rejectPaymentParams) {
    const p = state.leveltrackPayments.find(x => x.id === rejectPaymentParams.id);
    if (!p) return json(404, { error: 'Payment not found' });
    const u = state.leveltrackUpgrades.find(x => x.id === p.upgradeId);
    const r = state.leveltrackRequests.find(x => x.id === (p.requestId || u?.requestId));
    if (body?.requestId && r && String(body.requestId) !== String(r.id)) {
      return json(409, { error: 'Request ID mismatch for selected payment' });
    }
    if (p.adminApproved) return json(409, { error: 'Approved payment cannot be rejected' });
    const now = nextMonotonicIso();
    const reason = String(body?.reason || 'Payment proof rejected by Admin').trim();
    p.rejected = true;
    p.status = 'REJECTED';
    p.rejectedAt = now;
    p.rejectionReason = reason;
    p.slotReleased = true;
    p.parts = (p.parts || []).map(x => ({ ...x, status: 'REJECTED' }));
    if (u) u.status = 'Rejected';
    if (r) {
      r.status = 'Rejected';
      r.rejectedAt = now;
      r.rejectionReason = reason;
      r.reservedReceiverId = null;
    }
    const payer = ctx.ltMember(p.fromMemberId);
    if (payer) {
      state.leveltrackMessages.push({ to: payer.memberId, message: `Your payment (${p.id}) for request ${r?.id || u?.requestId || ''} was rejected: ${reason}`, at: now });
      ctx.notifyMemberEmail(
        payer,
        'BORNTOWIN5 - Upgrade Payment Rejected',
        `Hello ${payer.name},\n\nYour submitted payment (${p.id}) for request ${r?.id || u?.requestId || ''} was rejected.\nReason: ${reason}`,
        { eventType: 'UPGRADE_REQUEST_STATUS', eventKey: `REQ_REJECTED:${p.id}`, metadata: { requestId: r?.id || '', paymentId: p.id, status: 'Rejected', reason } }
      );
    }
    await saveChanges();
    return json(200, { ok: true, payment: ctx.paymentPublic(p), request: r || null, upgrade: u || null });
  }

  const verifyPaymentParams = method === 'POST' && matchRoute('/api/leveltrack/admin/payments/:id/verify', pathname);
  if (verifyPaymentParams) {
    const p = state.leveltrackPayments.find(x => x.id === verifyPaymentParams.id);
    if (!p) return json(404, { error: 'Payment not found' });
    if (!p.memberAccepted) return json(400, { error: 'Receiver has not accepted the payment' });
    p.adminApproved = true;
    p.adminVerifiedAt = nextMonotonicIso();
    const u = state.leveltrackUpgrades.find(x => x.id === p.upgradeId);
    if (u) u.receiverApproved = true;
    await saveChanges();
    return json(200, { ok: true, payment: ctx.paymentPublic(p) });
  }

  const finalApproveParams = method === 'POST' && matchRoute('/api/leveltrack/admin/upgrades/:id/final-approve', pathname);
  if (finalApproveParams) {
    const u = state.leveltrackUpgrades.find(x => x.id === finalApproveParams.id);
    if (!u) return json(404, { error: 'Upgrade not found' });
    const p = ctx.latestPaymentForUpgrade(u.id);
    if (!u.memberPaid || !u.receiverApproved || !p?.adminApproved) return json(400, { error: 'Payment must be paid, accepted and admin verified first' });
    const m = ctx.ltMember(u.memberId);
    if (!m) return json(404, { error: 'Member not found' });
    if (u.adminApproved) return json(200, { ok: true, alreadyApproved: true, newLevel: Number(m.level || 1), member: memberPublic(m), upgrade: u });
    if (Number(m.level || 1) !== Number(u.from || 1)) return json(400, { error: 'Member level changed already' });
    const approvedAt = nextMonotonicIso();
    u.adminApproved = true;
    u.completedAt = approvedAt;
    u.status = 'Completed';
    const r = state.leveltrackRequests.find(x => x.id === u.requestId);
    if (r) {
      r.status = 'Completed';
      r.completedAt = approvedAt;
    }
    if (u.kind === 'REFERRAL_UPGRADE') {
      state.leveltrackMessages.push({ to: m.memberId, message: 'Upgrade completed. Your next Level Upgrade is now available when unlocked.', at: approvedAt });
      await saveChanges();
      return json(200, { ok: true, newLevel: Number(m.level || 1), member: memberPublic(m), upgrade: u });
    }
    m.level = Number(u.to);
    m.levelMemberId = ctx.nextLevelMemberId(m.level);
    m.levelReachedAt = { ...(m.levelReachedAt || {}), [String(u.to)]: approvedAt };
    m.upgradeDate = approvedAt;
    m.status = 'Verified';
    state.leveltrackMessages.push({ to: m.memberId, message: `Level upgrade completed. You are now Level ${m.level}.`, at: approvedAt });
    await saveChanges();
    return json(200, { ok: true, newLevel: Number(m.level || 1), member: memberPublic(m), upgrade: u });
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/payment-settings') {
    return json(200, { paymentSettings: state.paymentSettings, levels: LEVEL_RULES, slotCapacities: LEVEL_SLOT_CAPACITY });
  }

  if (method === 'POST' && pathname === '/api/leveltrack/admin/payment-settings') {
    const b = body || {};
    if (Array.isArray(b.admins)) {
      state.paymentSettings.admins = b.admins.map((x, i) => ({
        id: x.id || String.fromCharCode(65 + i),
        name: x.name || `Admin ${String.fromCharCode(65 + i)}`,
        accountHolder: x.accountHolder || '',
        bank: x.bank || '',
        account: x.account || '',
        ifsc: x.ifsc || '',
        upi: x.upi || '',
        active: x.active !== false
      }));
    }
    if (b.trust) state.paymentSettings.trust = { ...state.paymentSettings.trust, ...b.trust };
    if (Number.isInteger(b.adminRotationIndex)) state.paymentSettings.adminRotationIndex = Math.max(0, b.adminRotationIndex);
    await saveChanges();
    return json(200, { ok: true, paymentSettings: state.paymentSettings });
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/payment-report') {
    const from = String(query.from || '');
    const to = String(query.to || from || '');
    const q = String(query.q || '').trim().toLowerCase();
    const level = String(query.level || '').trim();
    const rows = [];
    for (const p of state.leveltrackPayments) {
      const u = state.leveltrackUpgrades.find(x => x.id === p.upgradeId);
      if (!u) continue;
      const dt = String(p.submittedAt || u.completedAt || p.createdAt || '').slice(0, 10);
      if (from && dt < from) continue;
      if (to && dt > to) continue;
      if (level && String(u.from) !== level) continue;
      if (q && !(`${p.fromMemberId} ${p.receiverMemberId} ${u.payee || ''}`).toLowerCase().includes(q)) continue;
      rows.push({
        paymentId: p.id,
        requestId: p.requestId || u.requestId || '',
        date: dt,
        level: u.kind === 'REFERRAL_UPGRADE' ? 'UPGRADE • L2' : `L${u.from} → L${u.to}`,
        payerMemberId: p.fromMemberId,
        receiverMemberId: p.receiverMemberId,
        total: p.amount,
        status: p.rejected || p.status === 'REJECTED' ? 'Rejected' : (p.adminApproved ? 'Approved' : p.memberAccepted ? 'Receiver Confirmed' : p.memberPaid ? 'Proof Submitted' : 'Pending'),
        parts: (p.parts || []).map(x => ({
          type: x.type,
          label: x.label,
          amount: x.amount,
          account: x.accountDetails?.account || '',
          accountName: x.accountDetails?.name || x.accountDetails?.accountHolder || '',
          status: x.status,
          utr: x.utr || '',
          screenshot: !!x.screenshot
        }))
      });
    }
    const totals = { member: 0, trust: 0, admin: 0, total: 0 };
    const adminByAccount = {};
    let trustTotal = 0;
    rows.forEach(r =>
      r.parts.forEach(x => {
        totals[x.type] = (totals[x.type] || 0) + Number(x.amount || 0);
        totals.total += Number(x.amount || 0);
        if (x.type === 'admin') {
          const key = x.accountName || x.account || 'Admin';
          adminByAccount[key] = (adminByAccount[key] || 0) + Number(x.amount || 0);
        }
        if (x.type === 'trust') trustTotal += Number(x.amount || 0);
      })
    );
    return json(200, { from, to, count: rows.length, totals, adminByAccount, trustTotal, rows });
  }

  if (method === 'GET' && pathname === '/api/leveltrack/admin/daily-report') {
    const date = String(query.date || new Date().toISOString().slice(0, 10));
    const upgrades = state.leveltrackUpgrades
      .filter(u => u.adminApproved && String(u.completedAt || '').slice(0, 10) === date)
      .map(u => ({
        from: u.from,
        to: u.to,
        kind: u.kind || 'LEVEL_UPGRADE',
        seniorityLevel: u.kind === 'REFERRAL_UPGRADE' ? 2 : (u.seniorityLevel || u.to),
        amount: u.amount,
        date: String(u.completedAt).slice(0, 10),
        member: memberPublic(ctx.ltMember(u.memberId))
      }));
    return json(200, { date, count: upgrades.length, upgrades });
  }

  // 6. LevelTrack Member APIs
  const ltMemberDashParams = method === 'GET' && matchRoute('/api/leveltrack/member/dashboard/:id', pathname);
  if (ltMemberDashParams) {
    const d = ctx.ltDashboard(ltMemberDashParams.id);
    if (!d) return json(404, { error: 'Member not found' });
    return json(200, d);
  }

  if (method === 'POST' && pathname === '/api/leveltrack/member/upgrade-request') {
    return withAllocationLock(async () => {
      const freshState = await loadStateFromD1(d1, configuredAdminPwd);
      const freshMap = buildSnapshotMap(freshState);
      const freshCtx = createSessionContext(freshState, env, smtpSender);

      const m = freshCtx.ltMember(body.memberId);
      if (!m) return json(404, { error: 'Member not found' });
      if (m.paymentAccessLocked) return json(423, { error: 'Your payment access is locked pending Admin review.' });
      const pending = freshCtx.pendingLeveltrackRequest(m.memberId);
      if (pending) return json(400, { error: 'Upgrade request already pending' });
      const action = freshCtx.nextMemberAction(m);
      if (action.type !== 'LEVEL_UPGRADE') {
        return json(400, { error: action.type === 'REFERRAL_UPGRADE' ? 'Complete the current Upgrade first.' : 'The next level upgrade is not unlocked yet.' });
      }
      const from = Number(m.level || 1);
      const to = from + 1;
      if (from >= 7) return json(400, { error: 'Level 7 is the final level' });
      const need = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11, 6: 13 }[from] || 0;
      if (freshCtx.direct(m.memberId).length < need) {
        return json(400, { error: `Need ${need} direct referrals for Level ${from} → Level ${to}.` });
      }
      const reserved = freshCtx.nextSeniorReceiver(to, m.memberId);
      const now = nextMonotonicIso();
      const r = {
        id: 'LTR-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        memberId: m.memberId,
        from,
        to,
        seniorityLevel: to,
        kind: 'LEVEL_UPGRADE',
        status: 'Requested',
        reservedReceiverId: reserved?.memberId || null,
        reservedPosition: reserved?.position || null,
        reservedAt: reserved ? now : null,
        date: now.slice(0, 10),
        createdAt: now
      };
      freshState.leveltrackRequests.push(r);
      freshState.leveltrackMessages.push({ to: 'ADMIN', message: `New LevelTrack upgrade request: ${m.name} — L${from} → L${to}.`, at: now });
      freshCtx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - Upgrade Request Received',
        `Hello ${m.name},\n\nYour upgrade request (${r.from} → ${r.to}) has been received and is waiting for Admin processing.\nRequest ID: ${r.id}`,
        { eventType: 'UPGRADE_REQUEST_SUBMITTED', eventKey: `REQ_SUBMIT:${r.id}`, metadata: { requestId: r.id, memberId: m.memberId, from, to } }
      );
      freshCtx.notifyAdminEmail(
        'BORNTOWIN5 - New Upgrade Request Submitted',
        `Member ${m.name} (${m.memberId}) submitted Level ${from} → Level ${to} upgrade request (${r.id}).`,
        { eventType: 'UPGRADE_REQUEST_SUBMITTED', eventKey: `REQ_SUBMIT_ADMIN:${r.id}`, metadata: { requestId: r.id, memberId: m.memberId } }
      );
      await commitStateToD1(d1, freshMap, freshState, []);
      lastD1SaveAt = new Date().toISOString();
      return json(200, { ok: true, request: r });
    });
  }

  if (method === 'POST' && pathname === '/api/leveltrack/member/referral-upgrade-request') {
    return withAllocationLock(async () => {
      const freshState = await loadStateFromD1(d1, configuredAdminPwd);
      const freshMap = buildSnapshotMap(freshState);
      const freshCtx = createSessionContext(freshState, env, smtpSender);

      const m = freshCtx.ltMember(body.memberId);
      if (!m) return json(404, { error: 'Member not found' });
      if (m.paymentAccessLocked) return json(423, { error: 'Your payment access is locked pending Admin review.' });
      const pending = freshCtx.pendingLeveltrackRequest(m.memberId);
      if (pending) return json(400, { error: 'Upgrade request already pending' });
      const action = freshCtx.nextMemberAction(m);
      if (action.type !== 'REFERRAL_UPGRADE') return json(400, { error: 'The additional Upgrade is not unlocked yet.' });
      const reserved = freshCtx.nextSeniorReceiver(2, m.memberId);
      const now = nextMonotonicIso();
      const r = {
        id: 'LTR-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        memberId: m.memberId,
        from: Number(m.level || 1),
        to: Number(m.level || 1),
        kind: 'REFERRAL_UPGRADE',
        cycle: Number(action.cycle || 1),
        seniorityLevel: 2,
        status: 'Requested',
        reservedReceiverId: reserved?.memberId || null,
        reservedPosition: reserved?.position || null,
        reservedAt: reserved ? now : null,
        date: now.slice(0, 10),
        createdAt: now
      };
      freshState.leveltrackRequests.push(r);
      freshState.leveltrackMessages.push({ to: 'ADMIN', message: `New Advanced Referral Upgrade: ${m.name} — cycle ${r.cycle}, Seniority L2.`, at: now });
      freshCtx.notifyMemberEmail(
        m,
        'BORNTOWIN5 - Upgrade Request Received',
        `Hello ${m.name},\n\nYour Advanced Referral Upgrade request (cycle ${r.cycle}, Seniority L2) has been received and is waiting for Admin processing.\nRequest ID: ${r.id}`,
        { eventType: 'UPGRADE_REQUEST_SUBMITTED', eventKey: `REQ_SUBMIT:${r.id}`, metadata: { requestId: r.id, memberId: m.memberId, kind: 'REFERRAL_UPGRADE' } }
      );
      freshCtx.notifyAdminEmail(
        'BORNTOWIN5 - New Additional Referral Upgrade Request',
        `Member ${m.name} (${m.memberId}) submitted Additional Referral Upgrade request (${r.id}, Seniority L2).`,
        { eventType: 'UPGRADE_REQUEST_SUBMITTED', eventKey: `REQ_SUBMIT_ADMIN:${r.id}`, metadata: { requestId: r.id, memberId: m.memberId } }
      );
      await commitStateToD1(d1, freshMap, freshState, []);
      lastD1SaveAt = new Date().toISOString();
      return json(200, { ok: true, request: r });
    });
  }

  const payUpgradeParams = method === 'POST' && matchRoute('/api/leveltrack/member/upgrade/:id/pay', pathname);
  if (payUpgradeParams) {
    const u = state.leveltrackUpgrades.find(x => x.id === payUpgradeParams.id);
    if (!u) return json(404, { error: 'Upgrade not found' });
    if (u.memberId !== body.memberId) return json(403, { error: 'Not your upgrade' });
    const p = ctx.latestPaymentForUpgrade(u.id);
    if (!p) return json(404, { error: 'Payment instructions not found' });
    if (ctx.ltMember(u.memberId)?.paymentAccessLocked || u.paymentAccessLocked || p.paymentAccessLocked || ctx.paymentIsExpired(p)) {
      return json(410, { error: 'Payment details expired and are locked. Please contact Admin; only new Admin-issued payment details can be used.' });
    }
    const proofs = Array.isArray(body.parts) ? body.parts : [];
    if (!proofs.length) return json(400, { error: 'Payment proof required' });
    const now = nextMonotonicIso();
    for (const proof of proofs) {
      const part = p.parts.find(x => x.type === proof.type);
      if (!part) continue;
      const utr = String(proof.utr || '').trim();
      if (!utr) return json(400, { error: `UTR required for ${part.label}` });
      if (!proof.screenshot) return json(400, { error: `Screenshot required for ${part.label}` });
      const rawUri = String(proof.screenshot).trim();
      const m = rawUri.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      const mimeType = m ? m[1] : 'image/png';
      const proofRef = `/api/leveltrack/proofs/${encodeURIComponent(p.id)}/${encodeURIComponent(part.type)}`;
      extraProofs.push({
        paymentId: p.id,
        partType: part.type,
        mimeType,
        dataUri: rawUri,
        utr,
        submittedAt: now
      });
      part.utr = utr;
      part.screenshot = rawUri;
      part.proofRef = proofRef;
      part.submittedAt = now;
      part.status = 'SUBMITTED';
    }
    const all = p.parts.every(x => ['SUBMITTED', 'CONFIRMED', 'APPROVED'].includes(x.status));
    if (!all) return json(400, { error: 'Upload payment proof for every payment section' });
    const memberPart = p.parts.find(x => x.type === 'member') || p.parts[0];
    u.memberPaid = true;
    u.utr = memberPart?.utr || '';
    u.paidAt = now;
    p.utr = u.utr;
    p.screenshot = memberPart?.screenshot || null;
    p.proofRef = memberPart?.proofRef || null;
    p.memberPaid = true;
    p.submittedAt = now;
    state.leveltrackMessages.push({
      to: u.payeeId,
      message: `Payment proofs submitted for ${u.kind === 'REFERRAL_UPGRADE' ? 'Additional Upgrade (L2)' : `L${u.from} → L${u.to}`}. Please confirm the receiver payment.`,
      at: now
    });
    const payer = ctx.ltMember(u.memberId);
    const receiver = ctx.ltMember(p.receiverMemberId);
    ctx.notifyMemberEmail(
      receiver,
      'BORNTOWIN5 - Payment Proof Submitted',
      `Hello ${receiver?.name || p.receiverMemberId},\n\nMember ${payer?.name || u.memberId} (${u.memberId}) has submitted payment proof (UTR: ${p.utr}, Payment ID: ${p.id}) for ${u.kind === 'REFERRAL_UPGRADE' ? 'Advanced Referral Upgrade' : 'Level ' + u.from + ' to Level ' + u.to}.\nPlease sign in to the Receiver page to verify the payment.`,
      { eventType: 'PAYMENT_PROOF_SUBMITTED', eventKey: `PROOF_RECEIVER:${p.id}:${p.utr}`, metadata: { paymentId: p.id, requestId: u.requestId, receiverMemberId: p.receiverMemberId } }
    );
    ctx.notifyAdminEmail(
      'BORNTOWIN5 - Payment Proof Submitted for Review',
      `Member ${payer?.name || u.memberId} (${u.memberId}) submitted payment proof (UTR: ${p.utr}, Payment ID: ${p.id}, Request ID: ${u.requestId}).`,
      { eventType: 'PAYMENT_PROOF_SUBMITTED', eventKey: `PROOF_ADMIN:${p.id}:${p.utr}`, metadata: { paymentId: p.id, requestId: u.requestId, payerMemberId: u.memberId } }
    );
    await saveChanges();
    return json(200, { ok: true, upgrade: u, payment: ctx.paymentPublic(p) });
  }

  const incomingAcceptParams = method === 'POST' && matchRoute('/api/leveltrack/member/incoming/:id/accept', pathname);
  if (incomingAcceptParams) {
    const p = state.leveltrackPayments.find(x => x.id === incomingAcceptParams.id);
    if (!p) return json(404, { error: 'Payment not found' });
    if (p.receiverMemberId !== body.memberId) return json(403, { error: 'Not your payment' });
    if (body.requestId && p.requestId && String(body.requestId) !== String(p.requestId)) {
      return json(409, { error: 'Request ID mismatch for selected payment' });
    }
    if (p.rejected || p.status === 'REJECTED') return json(409, { error: 'Rejected payment cannot be confirmed' });
    if (!p.memberPaid) return json(400, { error: 'Member has not submitted payment proof yet' });
    const lockKey = `REC_ACCEPT:${p.id}`;
    if (activeMutationLocks.has(lockKey)) return json(409, { error: 'Confirmation already in progress' });
    activeMutationLocks.add(lockKey);
    try {
      if (p.memberAccepted) return json(200, { ok: true, alreadyAccepted: true, payment: ctx.paymentPublic(p) });
      p.memberAccepted = true;
      p.acceptedAt = nextMonotonicIso();
      const mp = (p.parts || []).find(x => x.type === 'member');
      if (mp && mp.status !== 'APPROVED') mp.status = 'CONFIRMED';
      const u = state.leveltrackUpgrades.find(x => x.id === p.upgradeId);
      if (u) u.receiverApproved = true;
      const payer = ctx.ltMember(p.fromMemberId);
      ctx.notifyMemberEmail(
        payer,
        'BORNTOWIN5 - Receiver Confirmed Payment',
        `Hello ${payer?.name || p.fromMemberId},\n\nThe receiver (${p.receiverMemberId}) has confirmed receiving your payment (${p.id}). Your upgrade is now waiting for Admin final approval.`,
        { eventType: 'RECEIVER_CONFIRMED_PAYMENT', eventKey: `REC_CONFIRM:${p.id}`, metadata: { paymentId: p.id, requestId: p.requestId || u?.requestId || '' } }
      );
      await saveChanges();
      return json(200, { ok: true, payment: ctx.paymentPublic(p) });
    } finally {
      activeMutationLocks.delete(lockKey);
    }
  }

  const incomingRejectParams = method === 'POST' && matchRoute('/api/leveltrack/member/incoming/:id/reject', pathname);
  if (incomingRejectParams) {
    const p = state.leveltrackPayments.find(x => x.id === incomingRejectParams.id);
    if (!p) return json(404, { error: 'Payment not found' });
    if (p.receiverMemberId !== body.memberId) return json(403, { error: 'Not your payment' });
    if (body.requestId && p.requestId && String(body.requestId) !== String(p.requestId)) {
      return json(409, { error: 'Request ID mismatch for selected payment' });
    }
    if (p.adminApproved) return json(409, { error: 'Approved payment cannot be rejected' });
    const now = nextMonotonicIso();
    const reason = String(body.reason || 'Payment proof rejected by receiver').trim();
    p.rejected = true;
    p.status = 'REJECTED';
    p.rejectedAt = now;
    p.rejectionReason = reason;
    p.slotReleased = true;
    const mp = (p.parts || []).find(x => x.type === 'member');
    if (mp) mp.status = 'REJECTED';
    const u = state.leveltrackUpgrades.find(x => x.id === p.upgradeId);
    if (u) u.status = 'Rejected';
    const r = state.leveltrackRequests.find(x => x.id === (p.requestId || u?.requestId));
    if (r) {
      r.status = 'Rejected';
      r.rejectedAt = now;
      r.rejectionReason = reason;
      r.reservedReceiverId = null;
    }
    const payer = ctx.ltMember(p.fromMemberId);
    if (payer) {
      state.leveltrackMessages.push({ to: payer.memberId, message: `Receiver (${p.receiverMemberId}) rejected payment proof (${p.id}): ${reason}`, at: now });
      ctx.notifyMemberEmail(
        payer,
        'BORNTOWIN5 - Payment Proof Rejected by Receiver',
        `Hello ${payer.name},\n\nReceiver ${p.receiverMemberId} rejected payment proof ${p.id} for request ${r?.id || ''}.\nReason: ${reason}`,
        { eventType: 'UPGRADE_REQUEST_STATUS', eventKey: `REC_REJECT:${p.id}`, metadata: { paymentId: p.id, requestId: r?.id || '', status: 'Rejected', reason } }
      );
    }
    await saveChanges();
    return json(200, { ok: true, payment: ctx.paymentPublic(p) });
  }

  const ltMsgParams = method === 'GET' && (matchRoute('/api/leveltrack/member/messages/:id', pathname) || matchRoute('/api/member/messages/:id', pathname));
  if (ltMsgParams) {
    const msgs = [
      ...state.messages.filter(x => x.to === ltMsgParams.id || x.to === 'ALL').map(x => ({ message: x.message, at: x.at })),
      ...state.leveltrackMessages.filter(x => x.to === ltMsgParams.id).map(x => ({ message: x.message, at: x.at }))
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json(200, { messages: msgs });
  }

  return json(404, { error: `API endpoint not found: ${method} ${pathname}` });
}

module.exports = {
  LEVEL_RULES,
  LEVEL_SLOT_CAPACITY,
  PAYMENT_DEADLINE_MS,
  isBlockedInternalPath,
  handleApiRequest
};
