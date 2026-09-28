BORNTOWIN5 - Payment Proof + Admin Request Fix

1. Member payment proof form:
   - UTR / Transaction ID and screenshot inputs no longer disappear while typing/uploading.
   - Background refresh will not rebuild the payment form while a payment proof draft is being edited.
   - After successful submission, the draft lock is cleared and the latest server state loads.
   - Existing server endpoint /api/leveltrack/member/upgrade/:id/pay is used; no database schema change.

2. Admin Upgrade Request & Approval:
   - Before processing: SELECT REQUEST.
   - After payment details are sent: SELECT REQUEST changes to a checked REQUEST SENT state.
   - Existing ADMIN APPROVE & COMPLETE flow remains available when receiver confirmation is complete.

Deploy the updated member.html and admin.html with the existing server.js.
