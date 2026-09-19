BORNTOWIN5 FINAL — ONLY REQUESTED LEVEL TRACKING CORRECTIONS

Base:
- admin.html and member.html are the user's uploaded final files.
- Existing BORNTOWIN5 UI, login, menus and other functions are preserved.

Only Level Tracking changes:
- One Level Tracking menu item remains.
- V26 mobile Level Tracking look/flow is retained.
- Demo/Test/sample data is removed.
- Real server member data is loaded.
- Real direct referrals are loaded from the real member dashboard.
- Referral link uses the real Member ID.
- Direct referral milestones: L1=3, L2=6, L3=9, L4=12, L5=15, L6=18.
- Upgrade request/payment/UTR/receiver acceptance/final approval use the existing LevelTrack server APIs.
- No LocalStorage test database is used by Level Tracking.

Upload these four HTML files together:
admin.html
member.html
leveltrack-admin.html
leveltrack-member.html

Keep your existing server.js and data/db.json unchanged.
