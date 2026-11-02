# BORNTOWIN5 (B5) — Emerald Sovereign Enterprise Portal (Deployment-Ready Package)

Complete, production-safe source package for **BORNTOWIN5** featuring sequential Level Tracking (`L1 → L7`), immediate seniority slot reservation, persistent receiver & admin payment proof ledgers, independent Admin `A/B/C` account rotation (`L4–L7`), AIC Cloud SMTP email notification engine, and strict User/Admin portal separation with server-side RBAC.

## Quick Start & Commands

```bash
# 1. Install dependencies
npm install

# 2. Run the 28-scenario automated QA & security test suite (isolated local DB)
npm test

# 3. Reset & seed isolated local staging data (tests/local-review-db.json)
npm run test:reset

# 4. Start production/staging server
npm start
```

## Included Files in This Package
- `server.js` — Express + Supabase + AIC Cloud SMTP backend with RBAC, atomic slot reservation, durable proof storage, and 10-workflow email notification engine.
- `login.html` — Dedicated User Portal entry page (no Admin Login button or Admin links).
- `member.html` — Member Sovereign Portal (Dashboard, Profile & Bank Lock, Referral Link, Downline Tree, PIN Wallet, Level Tracking).
- `leveltrack-member.html` — Member Level Upgrade & Persistent Receiver Confirmation Portal.
- `admin.html` — Dedicated Admin Command Center (Registration Review, Member Directory, Broadcast/Direct Messages, PIN Management, Password Reset, Level Tracking).
- `leveltrack-admin.html` — Level Tracking Admin Command Center (Upgrade Approvals, Auto-Seniority Receiver Assignment, Payment Account Management, Separated Current & Completed Seniority Queues, Payment Schedule Reports, Persistent Payment Proof Ledger, and Email Notification Audit Logs).
- `mobile-preview.html` — Multi-viewport (`360px`, `390px`, `430px`) mobile verification workbench.
- `b5-design-system.css` — Emerald Sovereign enterprise design system (`#042619`, `#F6F4EE`, `#C85A17`, `#C59B38`) with responsive stacked mobile card tables.
- `b5-logo.png`, `b5-logo.jpg`, `b5-intro.mp4` — Brand assets.
- `.env.example` — Environment variable template for Supabase and AIC Cloud SMTP (zero live secrets).
- `SUPABASE_SETUP.sql`, `SETUP.txt`, `UPLOAD_INSTRUCTIONS.txt`, `DEPLOYMENT_AND_OPERATIONS_GUIDE.md` — Database compatibility & deployment guides.
- `package.json`, `package-lock.json`, `Dockerfile` — Runtime & container build manifests.
- `tests/phase4-qa-suite.js`, `tests/reset-staging-data.js` — 28-scenario automated QA suite & production-protected staging reset script.

> **Important Production Note**: Database files (`db.json` / `data/db.json`) and live `.env` secrets are intentionally excluded from this package so deploying this ZIP never overwrites your live Supabase `public.app_state` records or local cache. See `DEPLOYMENT_AND_OPERATIONS_GUIDE.md` for full deployment and rollback steps.
