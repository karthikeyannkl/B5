BORNTOWIN5 (B5) — Email correction patch

Included files:
- b5-engine.js
- member.html

Patch scope:
1. Forgot Password sends a temporary password to the registered email and reports success only if the SMTP sender resolves successfully. On delivery failure, it does not change the password.
2. Payment details assigned to the payer and payment assigned to the receiver are sent through the SMTP sender. Email audit entries are marked SENT only after the sender resolves; failures are recorded as FAILED.
3. Member can request an email change while signed in. A six-digit code is sent to the new address and expires after 10 minutes. The registered address changes only after the code is confirmed.
4. After a verified email change, the system attempts a security notice to the previous address.

Deployment:
- Back up the currently deployed b5-engine.js and member.html first.
- Replace only these two files in the existing project.
- Keep the existing D1 repository, database, environment bindings, and other project files unchanged.
- Confirm SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM in the hosting environment. Never share SMTP_PASS in chat.
- Deploy to staging first and test Forgot Password, payer email, receiver email, email change verification, and failed-SMTP behavior before production.

Validation performed here:
- `node --check b5-engine.js` passed.
- Inline JavaScript in member.html passed `node --check`.
- Static inspection confirms the four email-related flows are present and SENT status is assigned only after smtpSender resolves.

Limitations:
- No live production SMTP delivery or D1 integration test was possible in this environment. Successful delivery still depends on the deployed SMTP host/port/credentials and hosting network access.
- This patch is based on the uploaded member.html and the existing b5-engine.js source; no unrelated business rules were intentionally changed.
