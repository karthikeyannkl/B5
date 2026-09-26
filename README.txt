BORNTOWIN5 DATABASE_URL DIAGNOSTIC

Purpose:
This package adds ONLY a safe diagnostic log for DATABASE_URL.
It never prints the database password and does not change or delete database data.

It reports:
- host
- database name
- username
- password length
- whether password has leading/trailing whitespace
- sslmode
- channel_binding

Upload/replace ONLY server.js in the GitHub repository.
Do not change member.html, admin.html, or database files.

After AIC Redeploy, check Logs for:
DATABASE_URL diagnostic: {...}

Do NOT paste the password into chat or screenshots.
