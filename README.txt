BORNTOWIN5 – EXPLICIT POSTGRES AUTH TEST

Purpose: diagnose Neon authentication without resetting, deleting, or recreating any database data.

This build parses DATABASE_URL and passes host/user/database/password explicitly to node-postgres.
It disables channel binding and uses SSL with certificate verification disabled, matching the previous test.
It runs a SELECT current_user/current_database authentication test before the normal app_state initialization.

Do NOT reset the Neon password again. Do NOT delete/recreate the Neon database or branch.

Expected useful log:
DATABASE AUTH TEST: SUCCESS ...

If it still says:
DATABASE AUTH TEST: FAILED password authentication failed for user "neondb_owner"
then the PostgreSQL server itself is rejecting the credential supplied by AIC, and we should investigate the credential/role value rather than changing application code or data.
