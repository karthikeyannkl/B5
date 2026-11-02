# BORNTOWIN5 (B5) — Fresh Launch Data & Password Security Correction Report

## 1. Executive Summary
This document summarizes the comprehensive corrections applied to the **BORNTOWIN5 (B5)** codebase (`F:\B5 RK`). The system is configured for official launch with:
1. **Exactly ONE Company Account**: `B5-COMPANY` (`BORN TO WIN`), designated as the permanent Level 7 Root, excluded from the seniority queue. As approved by the project owner, the Company ID shares mobile number `9345151709` with RK's accounts.
2. **Exactly 15 Initial Member Accounts**: `B5-001` to `B5-015` (numeric IDs `1` to `15`), distributed strictly across the 4 authorized mobile phone numbers.
3. **Cloudflare Worker Runtime PBKDF2 Password Security**:
   - Replaced plain SHA-256 hashing with `PBKDF2-HMAC-SHA256` using 100,000 iterations, 16-byte cryptographically secure random salts, and 32-byte derived keys (`pbkdf2$sha256$100000$<saltHex>$<hashHex>`).
   - Timing-safe hash comparison (`crypto.timingSafeEqual`) to eliminate timing side-channel attacks.
   - All hardcoded default passwords completely removed from source code, migrations, and documentation.
4. **Secure Individual Password Setup**:
   - Member self-service endpoint (`POST /api/member/setup-password`) verifying Member ID, mobile, and registered email before setting initial password.
   - Admin provisioning endpoint (`POST /api/leveltrack/admin/member-password-setup`) for single or batch password setup.
5. **Strict Company ID vs RK Member Accounts Separation**:
   - Mobile `9345151709` is shared by `B5-COMPANY` and RK's 3 member accounts (`B5-005`, `B5-010`, `B5-015`).
   - Entering mobile `9345151709` + individual password logs strictly into the matching account with zero cross-talk or collisions.
6. **Seniority & Business Rules Integrity**:
   - Positions 1–15 in ALL 7 Levels (Level 1 to Level 7) initialized for the 15 member accounts with `completed: 0`, `status: 'ACTIVE'`, and slots available.
   - Subsequent genuine upgrades receive position 16, 17, 18... sequentially in that level.
   - Public registration lock (HTTP 409 Conflict) strictly preserved for any duplicate mobile signup.
   - 24-hour payment deadlines, Admin A/B/C rotation, Trust allocation, and email alerts 100% preserved.

---

## 2. Before vs. After Security Comparison

| Feature / Requirement | Before Correction | After Correction |
| :--- | :--- | :--- |
| **Password Hashing Algorithm** | Plain SHA-256 (single round unsalted) | **PBKDF2-HMAC-SHA256** (100,000 iterations, 16-byte random salt, 32-byte derived key) |
| **Hash Verification** | Simple string comparison (`cand.passwordHash === suppliedHash`) | **Timing-Safe Equal** (`crypto.timingSafeEqual`) preventing timing attacks |
| **Hardcoded Credentials** | Default passwords hardcoded in source code (`seedLaunchAccounts`) and markdown | **Completely Removed**; unique random salts/hashes generated; accounts require individual password setup |
| **Initial Password Setup** | None (relied on pre-shared hardcoded passwords) | **Secure Self-Service & Admin APIs**: `POST /api/member/setup-password` and `POST /api/leveltrack/admin/member-password-setup` |
| **Shared Mobile 9345151709** | Potential collision between Company and RK accounts | **Strict Separation**: Entering mobile `9345151709` + individual password identifies only the exact matching account (`B5-COMPANY`, `B5-005`, `B5-010`, or `B5-015`) |
| **Database Schema (`members.mobile`)** | `mobile TEXT UNIQUE NOT NULL` (blocked multiple accounts) | `mobile TEXT NOT NULL` with index `idx_members_mobile`; duplicate mobile registration locked at API layer (HTTP 409) |
| **Total Directory Accounts** | Test accounts (`B5-TEST-*`, `B5-ROOT`, etc.) | **Exactly 16 Accounts**: 1 Company ID + 15 Member IDs |
| **Seniority Queues (Levels 1–7)** | Irregular test orders or false completion flags | **Positions 1–15 in all 7 Levels**; `completed: 0`, `status: 'ACTIVE'`, zero fake payments |
| **Subsequent Upgrade Position** | Ambiguous sorting | **Sequential 16+**: Next qualifying member receives position 16, 17, 18... in that specific level |

---

## 3. Account Directory & Configuration Reference

### Company Account (1 Account)
- **Member ID**: `B5-COMPANY` (Aliases: `0`, `B5-000`, `COMPANY`, `BORN TO WIN`)
- **Name**: `BORN TO WIN`
- **Mobile**: `9345151709` *(Approved by owner to share with RK)*
- **Email**: `notifications@borntowin5.com`
- **Referral**: `FIRST MEMBER`
- **Level**: Level 7 (Root)
- **Seniority Queue**: Excluded (`excludeFromSeniorityQueue: true`)
- **Password Status**: Individual password set via `POST /api/member/setup-password` or Admin provisioning
- **Bank Details**: Blank (`accountHolder`, `bank`, `account`, `ifsc`, `branch`, `upi` all empty)

---

### Initial 15 Member Accounts

| B5 ID | Canonical ID | Member Name | Approved Mobile | Registered Email | Initial Seniority (Levels 1–7) | Password Setup Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | `B5-001` | SATHYA | `9600680468` | sweetsathya62@gmail.com | Position 1 | Individual PBKDF2 Setup |
| **2** | `B5-002` | ELANGO | `7867014621` | kalaikalaielango@gmail.com | Position 2 | Individual PBKDF2 Setup |
| **3** | `B5-003` | KARTHIKEYAN | `9790151709` | dorakarthi51@gmail.com | Position 3 | Individual PBKDF2 Setup |
| **4** | `B5-004` | ELANGO | `7867014621` | kalaikalaielango@gmail.com | Position 4 | Individual PBKDF2 Setup |
| **5** | `B5-005` | RK | `9345151709` | ksp.nkl@gmail.com | Position 5 | Individual PBKDF2 Setup |
| **6** | `B5-006` | SATHYA | `9600680468` | sweetsathya62@gmail.com | Position 6 | Individual PBKDF2 Setup |
| **7** | `B5-007` | ELANGO | `7867014621` | kalaikalaielango@gmail.com | Position 7 | Individual PBKDF2 Setup |
| **8** | `B5-008` | KARTHIKEYAN | `9790151709` | dorakarthi51@gmail.com | Position 8 | Individual PBKDF2 Setup |
| **9** | `B5-009` | ELANGO | `7867014621` | kalaikalaielango@gmail.com | Position 9 | Individual PBKDF2 Setup |
| **10** | `B5-010` | RK | `9345151709` | ksp.nkl@gmail.com | Position 10 | Individual PBKDF2 Setup |
| **11** | `B5-011` | SATHYA | `9600680468` | sweetsathya62@gmail.com | Position 11 | Individual PBKDF2 Setup |
| **12** | `B5-012` | ELANGO | `7867014621` | kalaikalaielango@gmail.com | Position 12 | Individual PBKDF2 Setup |
| **13** | `B5-013` | KARTHIKEYAN | `9790151709` | dorakarthi51@gmail.com | Position 13 | Individual PBKDF2 Setup |
| **14** | `B5-014` | ELANGO | `7867014621` | kalaikalaielango@gmail.com | Position 14 | Individual PBKDF2 Setup |
| **15** | `B5-015` | RK | `9345151709` | ksp.nkl@gmail.com | Position 15 | Individual PBKDF2 Setup |

---

## 4. Mobile Number Distribution
- **SATHYA** (`9600680468`): 3 Accounts (`B5-001`, `B5-006`, `B5-011`)
- **ELANGO** (`7867014621`): 6 Accounts (`B5-002`, `B5-004`, `B5-007`, `B5-009`, `B5-012`, `B5-014`)
- **KARTHIKEYAN** (`9790151709`): 3 Accounts (`B5-003`, `B5-008`, `B5-013`)
- **RK** (`9345151709`): 3 Accounts (`B5-005`, `B5-010`, `B5-015`) + 1 Company Account (`B5-COMPANY`) = 4 Accounts.
- **Total Accounts**: 15 Member Accounts + 1 Company Account = 16 Accounts.

---

## 5. Automated Verification Results (100% Pass)

### A. Fresh Launch Verification Suite (`node tests/verify-launch-accounts.js`)
- ✅ **PASS [T-LAUNCH-01]** 1 Company ID + 15 Member IDs Verified (total=16, companyId=B5-COMPANY, membersCount=15)
- ✅ **PASS [T-LAUNCH-02]** 4 Approved Mobile Numbers Distribution Verified (Sathya=3, Elango=6, Karthikeyan=3, RK=3)
- ✅ **PASS [T-LAUNCH-03]** Blank Bank Details for Admin Configuration (All bank/UPI fields empty)
- ✅ **PASS [T-LAUNCH-04]** PBKDF2 Password Hashing Architecture Verified (16 unique salted PBKDF2 hashes, 100,000 iters, timing-safe equal)
- ✅ **PASS [T-LAUNCH-05]** Secure Individual Password Setup Verified (Self-service validation + Admin batch setup verified)
- ✅ **PASS [T-LAUNCH-06]** Multiple Member Login Verified Across All 15 Accounts (Each mobile + password opens exact account)
- ✅ **PASS [T-LAUNCH-07]** Strict Company ID vs RK Separation on Mobile 9345151709 (Zero collision between B5-COMPANY and B5-005/010/015)
- ✅ **PASS [T-LAUNCH-08]** Direct Member ID Login Verified (Login via "1", "B5-COMPANY", "B5-015" opens exact account)
- ✅ **PASS [T-LAUNCH-09]** Public Registration Lock Verified (Public duplicate mobile rejected with HTTP 409 Conflict)
- ✅ **PASS [T-LAUNCH-10]** Level 1–7 Seniority Sequences Verified (Positions 1–15 in all 7 levels, completed=0, status=ACTIVE)
- ✅ **PASS [T-LAUNCH-11]** Seniority 16 Sequence Verified (Next qualifying upgrade receives position 16 independently)
- ✅ **PASS [T-LAUNCH-12]** Zero Operational Test Data Remaining (payments=0, upgrades=0, requests=0, rotationIndex=0)

### B. QA & Security Test Suite (`npm test`)
- ✅ ALL 28 / 28 QA Scenarios Passed (100%)

### C. Isolated Test Dataset Suite (`npm run test:43`)
- ✅ ALL 10 / 10 Scenarios Passed (100%)
