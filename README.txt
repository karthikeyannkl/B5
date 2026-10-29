BORNTOWIN5 (B5) — Member Email Change Session Fix

Files:
- b5-engine.js
- member.html

Fix:
- Email-change request and confirmation now authorize using the verified member token/memberId.
- They no longer reject a valid member session merely because an admin context is also present in the request context.
- Member page's existing B5_MEMBER_TOKEN header remains unchanged.
- Email address still changes only after the 6-digit code is verified.

Deployment:
1. Back up the currently deployed files.
2. Replace only b5-engine.js and member.html in the existing project.
3. Keep D1 repository, database, bindings, other files, and business rules unchanged.
4. Test in staging first: sign in as a member, request code, confirm code, check profile email refresh.
5. SMTP delivery still depends on deployed SMTP configuration and network access.

Validation:
- Node syntax check passed for b5-engine.js.
- Inline JavaScript syntax check passed for member.html.
- Static check confirms both email-change routes require a valid memberId.

Not tested:
- No live production SMTP or D1 integration test was run in this environment.
