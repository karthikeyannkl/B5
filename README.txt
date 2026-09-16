BORNTOWIN5 + LevelTrack — CONNECTION FIX V9

Base: FINAL V8

Only the requested Admin <-> Server <-> Member data-flow fixes were made:
1. Admin dashboard now returns today registration count + member names.
2. Admin member Full View endpoint /api/admin/member-details/:id added.
3. Admin dashboard now returns PIN summary fields required by the existing UI, so Leader names can populate and PIN generation can work.
4. Admin LevelTrack level counters now include registered members by their current level (Level 1 starts at 1 when a member is registered/active in the data).
5. Existing referral/downline data is returned for Full View and existing tree rendering is preserved.
6. Existing message storage/Member message endpoint is preserved; it now works with the corrected dashboard flow without changing the UI.
7. Existing LevelTrack upgrade assignment/payment-detail flow is preserved; the Member dashboard receives the assigned upgrade object and its bank/payment details from the same server database.

DO NOT replace an existing production data/db.json with an empty file. Keep the existing data/db.json.

No design/menu/search workflow changes were intentionally made.

Note: This package is a server-side connection/data-flow test build. Real production authentication/authorization and secure database storage should be added before live financial use.
