BORNTOWIN5 (B5) - targeted email correction

Included files: b5-engine.js and member.html
Replace the deployed b5-engine.js and member.html with these files. Do not replace the D1 repository or alter the database schema for this patch.

Changes included:
1. Email dispatch does not mark a message SENT unless smtpSender resolves successfully. SMTP errors are recorded as FAILED.
2. Forgot Password waits for real SMTP delivery before changing the password. If delivery fails, it restores the prior password state and returns an error.
3. Existing payment-details-to-payer and payment-assignment-to-receiver notification triggers are preserved; their delivery is flushed during saveChanges and logged as SENT only after SMTP resolves.
4. Member profile UI includes new Email ID change controls.
5. New authenticated endpoints:
   POST /api/member/email-change/request  body: {"email":"new@example.com"}
   POST /api/member/email-change/confirm body: {"code":"123456"}
   A six-digit verification code is sent to the new email, expires in 10 minutes, and the email is not changed until confirmation succeeds. A security notice is also attempted to the old address.

Validation performed:
- `node --check b5-engine.js` passed.
- Source inspection confirms forgot-password awaits SMTP delivery and checks status before changing the password.
- This is a source-level validation, not a live production SMTP test. Actual delivery still depends on correct SMTP host/port/credentials and hosting network access. Do not share SMTP passwords.

Business logic scope:
No intentional changes to Level 1-7 rules, payment amounts, rotation/seniority logic, upgrade workflow, or D1 repository schema.
