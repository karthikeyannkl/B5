BORNTOWIN5 FINAL PRODUCTION V1

This package consolidates the approved BORNTOWIN5 UI with:
- 3D B5 logo splash before member login
- Password login (no OTP)
- Forgot Password -> Admin approval -> temporary password -> change password
- Registration with password + confirm password; bank details are completed in Profile after registration
- Royal mobile UI, Profile, Referral, PIN, Messages, Level Tracking and Admin modules
- Level payment split rules and seniority/receiver workflow
- PostgreSQL persistence when DATABASE_URL is configured
- Local JSON fallback only for local testing

IMPORTANT DEPLOYMENT RULE
Do not include or upload data/db.json from an old deployment. Production member data must live in the PostgreSQL database referenced by DATABASE_URL. Keep DATABASE_URL unchanged during code-only updates.

AIC setup:
1. Create/provision the PostgreSQL database and copy its connection string.
2. AIC App -> Environment -> add DATABASE_URL with that connection string.
3. Save environment variables.
4. Redeploy the existing BORNTOWIN5 app.
5. Check /api/health; dataStore should say postgresql.
6. Test login, registration, forgot password, profile, referral, PIN, Level Tracking and admin.

No production db.json is included in this ZIP.
