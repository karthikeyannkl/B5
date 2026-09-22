BORNTOWIN5 Level Tracking - Final Payment & Reports Update

Includes:
- Existing V6 mobile Level Tracking UI preserved as base.
- Correct receiver phone number is taken from the selected/automatic receiver member.
- Level payment amounts:
  L1-L2: Rs.1,000 -> Member 100%
  L2-L3: Rs.3,000 -> Member 100%
  L3-L4: Rs.20,000 -> Member Rs.15,600 + Trust Rs.2,400 + Admin Rs.2,000
  L4-L5: Rs.1,00,000 -> Member Rs.72,000 + Trust Rs.16,000 + Admin Rs.12,000
  L5-L6: Rs.2,00,000 -> Member Rs.1,48,000 + Trust Rs.32,000 + Admin Rs.20,000
  L6-L7: Rs.5,00,000 -> Member Rs.2,40,000 + Trust Rs.1,60,000 + Admin Rs.1,00,000
- L3-L4 onward shows separate Member / Trust / Admin payment cards.
- Each payment section supports UTR + screenshot upload.
- Admin A/B/C payment account round-robin: A -> B -> C -> A.
- Trust account is configurable and starts with a temporary placeholder account.
- Level-wise seniority queue with automatic next eligible receiver and 5/10 payment progress rules.
- Admin Payment Reports with Today / This Week / This Month / Custom date range.
- Admin reports show Member, Trust, Admin totals and per-admin totals.
- Historical transactions keep the account snapshot used at assignment time.
- Password-only login / Forgot Password flow from V6 remains.

Server: node server.js
Default PORT: 10000
