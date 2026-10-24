# BORNTOWIN5 (B5) — Final Production Deployment & Operations Guide

## 1. Architecture & Compatibility Overview
This package is a drop-in upgrade for the existing **BORNTOWIN5** Node.js (`express` + `nodemailer`) application hosted on **AIC Cloud / Docker / Render** and backed by **Supabase** (`public.app_state`).

- **Zero Schema Changes Required**: Uses the existing `public.app_state` (`id = 1`, `data jsonb`) table in Supabase and automatically initializes new state properties (`adminRotationByLevel`, `emailNotificationLog`, durable proof references) via `ensureDbDefaults(db)` without altering or deleting any existing member, PIN, upgrade, or payment records.
- **Separate Portals & Server-Side RBAC**:
  - **User Portal**: `/login.html`, `/member.html`, `/user/login`, `/user/dashboard` (contains zero Admin Login buttons or Admin links).
  - **Admin Portal**: `/admin.html`, `/admin/login`, `/admin` (protected by HMAC-SHA256 session tokens via `HttpOnly` cookie `b5_admin_token` and `x-admin-token` header; unauthenticated calls return `HTTP 401`, and normal member tokens calling `/api/admin/*` or `/api/leveltrack/admin/*` return `HTTP 403`).
  - **Authorized Proof Image Serving**: `GET /api/leveltrack/proofs/:paymentId/:partType` verifies that the caller is either an authenticated Admin, the payment's sender (`fromMemberId`), or the assigned receiver (`receiverMemberId`), blocking unauthorized callers with `HTTP 401/403`.

---

## 2. Environment Variables Required in Hosting Panel

| Variable Name | Required in Prod | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | `10000` | HTTP server port (`0.0.0.0:10000`) |
| `SUPABASE_URL` | **Yes** | `https://<project-ref>.supabase.co` | Existing Supabase project URL (no `/rest/v1/` suffix) |
| `SUPABASE_SECRET_KEY` | **Yes** | `sb_secret_...` | Existing Supabase backend secret / service role key |
| `SMTP_HOST` | Optional | `mail.aiccloud.in` | Existing AIC Cloud SMTP server host |
| `SMTP_PORT` | Optional | `587` | Existing AIC Cloud SMTP port (STARTTLS) |
| `SMTP_USER` | Optional | `notifications@borntowin5.com` | Existing SMTP username |
| `SMTP_PASS` | **Yes (for live email)** | `<smtp-password>` | Existing AIC Cloud SMTP password |
| `EMAIL_FROM` | Optional | `notifications@borntowin5.com` | Sender address for transactional notifications |
| `B5_ADMIN_CONTACT_EMAIL` | Optional | `notifications@borntowin5.com` | Admin alert recipient email address |
| `B5_LOCAL_TEST_ONLY` | **No (`0` in Prod)** | `0` | Must be `0` or omitted in production so Supabase is used |
| `B5_SENIORITY_TEST_MODE` | **No (`0` in Prod)** | `0` | Must be `0` or omitted in production |

---

## 3. Step-by-Step Deployment Instructions

### Step 1 — Pre-Deploy Backup
1. Before uploading the new package, export a backup of the current `public.app_state` row (`id = 1`) from the Supabase dashboard or keep your existing `data/db.json` snapshot.

### Step 2 — Upload / Replace Source Files
1. Extract `BORNTOWIN5-Complete-Deployment-Ready.zip` into your existing project repository or AIC Cloud deployment folder.
2. Core active files replaced/updated:
   - `server.js`
   - `member.html`
   - `admin.html`
   - `login.html`
   - `leveltrack-member.html`
   - `leveltrack-admin.html`
   - `b5-design-system.css`
   - `package.json`
   - `Dockerfile`
3. Do **not** overwrite or delete your production `data/db.json` cache or Supabase `public.app_state` table.

### Step 3 — Build & Start Commands
- **Install / Build Command**:
  ```bash
  npm install
  ```
- **Start Command**:
  ```bash
  npm start
  ```
  *(which executes `node server.js`)*

### Step 4 — Post-Deploy Health Check
1. Open `/api/db-status` in your browser:
   ```json
   {
     "ok": true,
     "persistence": "supabase-api",
     "members": 95,
     "lastSaveAt": "...",
     "pendingRetry": false
   }
   ```
2. Sign in to the **Admin Portal** (`/admin.html` or `/admin/login`), open **Level Tracking → Email Logs** (`✉ Email Logs`), and confirm the banner displays:
   `● AIC Cloud SMTP Active (mail.aiccloud.in:587)` (when `SMTP_PASS` is configured in production).
3. Sign in to the **User Portal** (`/login.html` or `/member.html`) with an existing member account and verify dashboard, direct referrals, and upgrade history.

---

## 4. Rollback Procedure
If you ever need to revert to the previous version:
1. Restore `server.js`, `member.html`, `admin.html`, `login.html`, `leveltrack-member.html`, and `leveltrack-admin.html` from the immutable pre-final backup directory (`_backups/B5-pre-phase3-2026-10-23_190903/` or `_backups/B5-pre-final-packaging-2026-10-24_190500/`).
2. Restart the service (`npm start`). Because the data structure in `public.app_state` is 100% backward-compatible, no database rollback is required.
