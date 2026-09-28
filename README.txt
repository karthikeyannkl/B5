BORNTOWIN5 – Registration Email Only Fix

Replace only the existing server.js in the live BORNTOWIN5 project with this server.js.

This correction adds only the Registration Successful email after the member is saved.
No database reset/delete, Supabase persistence, member data, UI, or other application logic is changed.

Required existing AIC Cloud environment variables (do not change them):
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_FROM
SUPABASE_URL
SUPABASE_SECRET_KEY

After deployment, register a test member using a valid email and check the inbox.
AIC Logs should show either:
Registration Successful email sent: B5-...
or
Registration email failed: ...
