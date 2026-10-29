B5 targeted email correction

File to replace: b5-engine.js only.

Changes:
1. Forgot Password now generates a temporary password, hashes it in the member record, marks mustChangePassword=true, and emails the temporary password to the registered email address. It no longer creates an Admin approval request for this flow.
2. Existing payer and receiver email triggers are preserved, including PAYMENT_DETAILS_ASSIGNED_PAYER and PAYMENT_ASSIGNED_RECEIVER. No payment, upgrade, rotation, or database business rules were intentionally changed.

Important deployment note:
The provided Admin screenshot showed SMTP delivery failures with "Connection timeout". This engine-only correction cannot fix a live SMTP host/port/network timeout. Confirm the actual SMTP host and port in the hosting environment with the mail provider. Do not share SMTP passwords.

After deployment, test in staging first:
- Forgot Password with a test account and confirm the email arrives.
- Admin sends payment details; payer receives email.
- Receiver is assigned a payment; receiver receives email.
- Check Admin Email Audit for actual SENT/FAILED status.
