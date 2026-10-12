BORNTOWIN5 — TESTING BUILD

IMPORTANT
- This is a TESTING ZIP. Test members are seeded automatically at startup so the Admin Seniority Queue can be checked without manually setting B5_SENIORITY_TEST_MODE.
- Deploy this ZIP only to a separate test deployment/database. Do NOT deploy with automatic test seeding enabled to production. To disable future test seeding, set B5_SENIORITY_TEST_MODE=0 before startup; this does not remove test members already saved in the database.

TEST LOGINS (password for all: B5@123456)
1) Seniority test members: KARTHI01 / SATHYA02 / KARTHI03 / SATHYA04 / KARTHI05 / SATHYA06 / KARTHI07 / SATHYA08 / KARTHI09 / KARTHI10
   Mobile numbers: 7000000001–7000000010
2) Mobile Test Parent 1: B5-MOBTEST01, mobile 7888888801, referral ID REF-MOBTEST01; direct referrals M1T01–M1T13.
3) Mobile Test Parent 2: B5-MOBTEST02, mobile 7888888802, referral ID REF-MOBTEST02; direct referrals M2T01–M2T13.
4) New 13 Referral Root: B5-NEW13R, mobile 7888888888, referral ID REF-NEW13ROOT; direct referrals TEST01–TEST13, mobile numbers 7100000001–7100000013.

CORRECTIONS IN THIS BUILD
- Payment details have a 24-hour deadline and user-side countdown.
- Expired payment details are locked; old payment IDs cannot submit proof after reassignment.
- Admin deadline actions: EXTEND 24 HOURS, RESTORE & REASSIGN, RELEASE SLOT, BLACKLIST MEMBER.
- Seniority occupancy counts completed approvals plus assigned pending slots; expired assignments continue reserving the slot until Admin releases/reassigns them. Completed count changes only after approval.
- L4, L5, L6 and L7 Admin A/B/C rotations keep independent counters.
- Approval endpoint updates payment/request/upgrade/member level in one server flow and handles repeat approval idempotently.

VALIDATION
- server.js Node syntax check passed.
- Inline JavaScript syntax checks passed for leveltrack-admin.html and leveltrack-member.html.
- ZIP integrity check passed.
- A live AIC Cloud/Supabase end-to-end run has NOT been performed in this environment. Please test in a separate deployment before production use.
