BORNTOWIN5 Level Tracking V27 - REAL DATA TEST BUILD

This build keeps the existing BORNTOWIN5 Admin/Member pages and connects the single Level Tracking menu to the server-backed LevelTrack pages.

Included:
- admin.html
- member.html
- leveltrack-admin.html
- leveltrack-member.html

Corrections in this build:
1. Removed the V26 LocalStorage demo/test flow from the integrated Level Tracking path.
2. Level Tracking reads real member data from the existing server APIs.
3. Direct referrals are loaded from the real registration/referral database.
4. Referral count updates from actual joins; no ADD REFERRAL TEST button.
5. Upgrade eligibility uses the server milestone rules.
6. Receiver/payment fields are dynamic; sample Kumar/Mohan/payment data was removed.
7. Receiver status/confirmation functionality is preserved.
8. Existing BORNTOWIN5 Admin/Member menus and design are preserved.

IMPORTANT:
- Keep your existing server.js and data/db.json.
- Upload/replace these four HTML files in the same server project.
- Do NOT replace production data/db.json with an empty/test database.
- This build expects the existing LevelTrack API routes in server.js.

First test:
Login with one real Member ID, confirm current level and real direct referrals, then add/check three real referrals and verify the 3/3 milestone and upgrade request flow.
