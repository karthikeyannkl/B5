B5 EMAIL CORRECTION — ENGINE FILE ONLY

Purpose:
- Corrects the email audit behavior so the engine calls the configured SMTP sender instead of marking an email SENT without sending it.
- Records SENT only when the SMTP transport accepts the recipient; records FAILED with an error if sending fails.
- Leaves server.js, login/authentication code, payment/upgrade rules, and database schema unchanged.

Deployment:
- Replace only the existing b5-engine.js with this file in the same location.
- Do not replace server.js or other files with this ZIP.
- This source correction does not supply SMTP credentials or prove the live SMTP server is configured correctly. After deployment, trigger one controlled test email and inspect the email audit status/error.
