BORNTOWIN5 - SAFE DATABASE CONNECTION TEST

IMPORTANT:
This test server does NOT create, update, or delete any database table or data.
It only runs SELECT 1 against DATABASE_URL.
It never logs the database password.

AIC deployment:
1. Do NOT replace the production BORNTOWIN5 main deployment unless you intentionally want a temporary test.
2. If possible, deploy this as a separate test app/repository/branch.
3. Keep the same DATABASE_URL environment variable.
4. Open /db-test on the deployed test URL.
5. A successful response is:
   {"ok":true,"message":"PostgreSQL authentication and connection successful","result":{"ok":1}}
6. If it fails, the response/log will show the exact PostgreSQL error without exposing the password.

After testing, restore the production server.js. No database reset is required.
