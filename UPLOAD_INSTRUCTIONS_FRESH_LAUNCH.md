# BORNTOWIN5 (B5) — Fresh Launch Upload & Deployment Instructions

## 1. Safety Safeguards Confirmed
- No production database records were deleted or modified during testing.
- All testing was executed on isolated staging databases and memory bindings.
- Production Cloudflare D1 migrations require explicit execution using the commands below.
- **Do NOT execute live database reset or production deployment without explicit project owner approval.**

---

## 2. Included Files in Fresh Launch Update
The package contains only the modified and required files:
1. `src/b5-engine.js` — Core business logic with PBKDF2-HMAC-SHA256 password hashing (100k iters), timing-safe comparison, secure password setup APIs, multi-account login matching, Level 1–7 seniority positioning (1–15), and sequential 16+ seniority allocation.
2. `b5-engine.js` — Synchronized root backend engine (100% byte-for-byte identical to `src/b5-engine.js`).
3. `src/d1-repository.js` — Cloudflare D1 database repository with durable proof storage and multi-account support.
4. `d1-repository.js` — Synchronized root D1 repository (100% byte-for-byte identical to `src/d1-repository.js`).
5. `migrations/0003_allow_multiple_accounts_and_fresh_launch.sql` — Clean D1 migration that drops table-level unique on `members.mobile`, resets operational tables and rotation counters, and provisions `B5-COMPANY` + the 15 approved members with PBKDF2 hashes and `must_change_password = 1`.
6. `scripts/fresh-launch-reset.js` — Node.js script to initialize fresh launch state with automatic backup.
7. `tests/verify-launch-accounts.js` — Automated 12-point test suite for pre-deployment verification.
8. `CHANGELOG_FRESH_LAUNCH.md` — Complete credential and change report.
9. `UPLOAD_INSTRUCTIONS_FRESH_LAUNCH.md` — This deployment guide.

---

## 3. Password Setup Workflows

### Method 1: Member Self-Service Password Setup
Members can configure their individual password upon first login:
```bash
curl -X POST https://your-domain.com/api/member/setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "B5-001",
    "mobile": "9600680468",
    "email": "sweetsathya62@gmail.com",
    "newPassword": "YourSecurePassword#1",
    "confirmPassword": "YourSecurePassword#1"
  }'
```
*Response:*
```json
{
  "ok": true,
  "message": "Password configured successfully. You may now log in.",
  "member": {
    "memberId": "B5-001",
    "name": "SATHYA",
    "mobile": "9600680468",
    "level": 7
  }
}
```

### Method 2: Admin Batch Password Provisioning
Admins can provision passwords for all 15 members and the Company Account in one authenticated request:
```bash
curl -X POST https://your-domain.com/api/leveltrack/admin/member-password-setup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "passwords": {
      "B5-COMPANY": "<SecureCompanyPassword>",
      "B5-001": "<SecurePassword1>",
      "B5-002": "<SecurePassword2>",
      "B5-003": "<SecurePassword3>",
      "B5-004": "<SecurePassword4>",
      "B5-005": "<SecurePassword5>",
      "B5-006": "<SecurePassword6>",
      "B5-007": "<SecurePassword7>",
      "B5-008": "<SecurePassword8>",
      "B5-009": "<SecurePassword9>",
      "B5-010": "<SecurePassword10>",
      "B5-011": "<SecurePassword11>",
      "B5-012": "<SecurePassword12>",
      "B5-013": "<SecurePassword13>",
      "B5-014": "<SecurePassword14>",
      "B5-015": "<SecurePassword15>"
    }
  }'
```
*Response:*
```json
{
  "ok": true,
  "message": "Password configured for 16 account(s).",
  "count": 16,
  "updated": ["B5-COMPANY", "B5-001", "B5-002", "B5-003", "..."]
}
```

---

## 4. Deployment Instructions

### Option A: Cloudflare D1 SQL Migration (Production Cloudflare Worker)

1. **Verify Wrangler CLI authentication**:
   ```bash
   npx wrangler whoami
   ```

2. **Execute migration on Remote Cloudflare D1 (When approved)**:
   ```bash
   npx wrangler d1 execute b5-level-tracking --remote --file=migrations/0003_allow_multiple_accounts_and_fresh_launch.sql
   ```

3. **Deploy Updated Worker Code**:
   ```bash
   npx wrangler deploy
   ```

---

### Option B: Verification Testing
Before going live, run the full verification suites:
```bash
node tests/verify-launch-accounts.js
npm run test:43
npm test
```
All suites must output **100% PASS**.

---

## 5. Multiple Account Login Behavior
- **Mobile `9345151709`**:
  - Entering Company Password -> logs into `B5-COMPANY` (`BORN TO WIN`, Level 7 Root).
  - Entering RK #5 Password -> logs into `B5-005` (`RK`).
  - Entering RK #10 Password -> logs into `B5-010` (`RK`).
  - Entering RK #15 Password -> logs into `B5-015` (`RK`).
- **Direct Login by Member ID**:
  - Entering `B5-COMPANY` or `0` + password -> logs into `B5-COMPANY`.
  - Entering `1` or `B5-001` + password -> logs into `B5-001`.
  - Entering `5` or `B5-005` + password -> logs into `B5-005`.
  - Entering `15` or `B5-015` + password -> logs into `B5-015`.
- **Public Signups**:
  - Any public registration attempting to reuse an existing mobile number receives **HTTP 409 Conflict** (`Mobile number already registered`).
