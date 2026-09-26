BORNTOWIN5 Neon connection diagnostic - channel binding disabled

Purpose: test the existing Neon DATABASE_URL without PostgreSQL channel binding.

IMPORTANT:
- Do NOT reset/delete/recreate the Neon database or branch.
- Do NOT clear or overwrite existing member data.
- Keep the existing DATABASE_URL; no password reset is required for this test.
- This is a temporary diagnostic build. After the connection is confirmed, return to the production server build and remove diagnostic logging.

Deploy the included server.js + package.json to the existing AIC Cloud BORNTOWIN5 app and redeploy. Then check logs for either:
- Persistent database loaded / initialized, or
- the exact remaining PostgreSQL connection error.
