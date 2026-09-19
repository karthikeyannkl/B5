BORNTOWIN5 - REGISTRATION + PROFILE + LEVEL PAYMENT CORRECTION V3

Only the requested flow corrections were made; existing overall UI/design is preserved.

1) Registration page simplified:
- Member Name
- Place / City
- Mobile Number
- Referral ID (auto-filled from referral link)
- Joining PIN
- Declaration
- Bank/personal extra fields are no longer required at initial registration.

2) After login:
- New Profile option in the existing member menu.
- Profile Picture upload.
- Personal details: Name, Place, Mobile, Referral ID.
- Bank details: Account Holder, Bank, Account Number, IFSC, Branch, UPI.
- SAVE PROFILE stores the data in server database.

3) Level Tracking Admin payment assignment:
- Select the real upgrade request.
- Enter Receiver Member ID only.
- Receiver Name, Phone and bank details auto-load from the real database.
- Bank fields are read-only/auto-filled.
- Admin only enters/confirms the Amount.
- SEND PAYMENT DETAILS sends the real bank/payment details to the member.

4) Server:
- Added /api/member/profile/:id for saving profile and bank details.
- Member dashboard now returns profile data.
- LevelTrack admin member lookup returns bank fields for auto-fill.
- Existing V2 request-status correction is preserved.

Validation:
- Node server syntax checked successfully.
- Member and LevelTrack Admin inline JavaScript syntax checked successfully.
