BORNTOWIN5 - SENIORITY + REQUEST UI CORRECTION

ONLY THESE CORRECTIONS:
1. MANUAL/AUTO Seniority mode and Starting Member IDs are saved in existing paymentSettings and remain after reload.
2. MANUAL mode uses the configured starting Member ID when that member is ACTIVE; if completed/unavailable, the next eligible seniority member is used.
3. Admin next-receiver API now returns the active mode so the UI can display MANUAL or AUTO correctly.
4. When an Admin clicks SELECT REQUEST, the payment panel immediately shows REQUEST SELECTED / pending status and scrolls to the panel.
5. The receiver box clearly shows MANUAL SENIORITY RECEIVER or AUTO SENIORITY RECEIVER.
6. If MANUAL starting member is unavailable, the UI clearly explains the fallback instead of looking unchanged.

NOT CHANGED:
- Supabase persistence
- Existing database/data
- Email system
- Member/referral data
- Payment/approval flow
- Other Admin/Member functions
- No reset/delete/seed operation

FILES TO REPLACE:
- server.js
- leveltrack-admin.html
