BORNTOWIN5 Neon SSL Fix

Replace ONLY server.js in GitHub with this file.
Keep the existing package.json (it already includes pg).

This correction fixes the Neon/node-postgres SSL connection error caused by sslmode/channel_binding parameters in the DATABASE_URL overriding the explicit TLS settings.

DO NOT delete, reset, clear, or replace any existing database/member data.
After upload, Redeploy in AIC Cloud and check Logs.
