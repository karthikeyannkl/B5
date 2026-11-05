# BORNTOWIN5 (B5) — Fresh Launch Upload & Deployment Instructions

## 1. Safety Safeguards Confirmed
- No production database records were deleted or modified during testing.
- All testing was executed on isolated staging databases and memory bindings.
- Production Cloudflare D1 migrations require explicit execution using the commands below.
- **Do NOT execute live database reset or production deployment without explicit project owner approval.**

---

## 2. Included Files in Fresh Launch Update
The package contains only the modified and required files:
1. `src/b5-engine.js` — Core business logic with PBKDF2-HMAC-SHA256 password hashing (100k iters), mandatory `B5-XXXXX` 5-digit Member ID generation (`makeMemberId`), timing-safe comparison, secure password setup APIs, multi-account login matching, Level 1–7 seniority positioning (1–15), and sequential 16+ seniority allocation.
2. `b5-engine.js` — Synchronized root backend engine (100% byte-for-byte identical to `src/b5-engine.js`).
3. `src/d1-repository.js` — Cloudflare D1 database repository with durable proof storage and multi-account support.
4. `d1-repository.js` — Synchronized root D1 repository (100% byte-for-byte identical to `src/d1-repository.js`).
5. `migrations/0003_allow_multiple_accounts_and_fresh_launch.sql` — Clean D1 migration that drops table-level unique on `members.mobile`, resets operational tables and rotation counters, and provisions `B5-COMPANY` + the 15 approved members with mandatory `B5-XXXXX` 5-digit IDs, PBKDF2 hashes, and `must_change_password = 1`.
6. `scripts/fresh-launch-reset.js` — Node.js script to initialize fresh launch state with automatic backup.
7. `tests/verify-launch-accounts.js` — Automated 16-point test suite for pre-deployment verification.
8. `CHANGELOG_FRESH_LAUNCH.md` — Complete credential, format, and before/after change report.
9. `UPLOAD_INSTRUCTIONS_FRESH_LAUNCH.md` — This deployment guide.

---

## 3. Password Setup Workflows

### Method 1: Member Self-Service Password Setup
Members can configure their individual password upon first login:
```bash
curl -X POST https://www.borntowin5.com/api/member/setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "memberId": "B5-64847",
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
    "memberId": "B5-64847",
    "name": "SATHYA",
    "mobile": "9600680468",
    "level": 1
  }
}
```

### Method 2: Admin Batch Password Provisioning
Admins can provision passwords for all 15 members and the Company Account in one authenticated request:
```bash
curl -X POST https://www.borntowin5.com/api/leveltrack/admin/member-password-setup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "passwords": {
      "B5-COMPANY": "<SecureCompanyPassword>",
      "B5-64847": "<SecurePassword1>",
      "B5-39246": "<SecurePassword2>",
      "B5-88384": "<SecurePassword3>",
      "B5-12971": "<SecurePassword4>",
      "B5-90143": "<SecurePassword5>",
      "B5-54017": "<SecurePassword6>",
      "B5-96920": "<SecurePassword7>",
      "B5-37039": "<SecurePassword8>",
      "B5-17004": "<SecurePassword9>",
      "B5-35655": "<SecurePassword10>",
      "B5-71226": "<SecurePassword11>",
      "B5-31508": "<SecurePassword12>",
      "B5-82715": "<SecurePassword13>",
      "B5-40331": "<SecurePassword14>",
      "B5-75949": "<SecurePassword15>"
    }
  }'
```
*Response:*
```json
{
  "ok": true,
  "message": "Password configured for 16 account(s).",
  "count": 16,
  "updated": ["B5-COMPANY", "B5-64847", "B5-39246", "B5-88384", "..."]
}
```

---

## 4. Production Deployment Sequence (When Approved)

When explicit approval is given to execute against the live Cloudflare production environment:

1. **Verify Wrangler CLI authentication**:
   ```bash
   npx wrangler whoami
   ```

2. **Verify live database binding**:
   ```bash
   npx wrangler d1 info b5-level-tracking
   ```

3. **Apply migration 0003 against remote production D1**:
   ```bash
   npx wrangler d1 migrations apply b5-level-tracking --remote
   ```

4. **Deploy the updated Cloudflare Worker**:
   ```bash
   npx wrangler deploy
   ```

5. **Execute Read-Only Live Verification Query**:
   ```bash
   npx wrangler d1 execute b5-level-tracking --remote --command="SELECT member_id, name, mobile, level, status FROM members ORDER BY member_id;"
   ```
   *Expected Result*: Exactly 16 rows (`B5-COMPANY` + 15 `B5-XXXXX` members).
