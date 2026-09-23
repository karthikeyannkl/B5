BORNTOWIN5 - FINAL V10 SENIORITY AUTO FLOW

This package keeps the existing BORNTOWIN5 design and payment split flow and adds the final seniority verification layer.

ADMIN SENIORITY
- L2 through L7 are displayed separately in the Level-wise Seniority Queue.
- Each level has independent #1, #2, #3... seniority positions.
- Seniority is based on the server timestamp when the member reaches that level.
- Each level shows member name, Member ID, mobile, reached time, earnings progress and status.
- The first ACTIVE position is shown as the next automatic receiver.

AUTOMATIC PAYMENT RECEIVER
- When an upgrade request is selected, the system automatically loads the next eligible seniority receiver for the target level.
- Admin does not manually choose the receiver.
- Before sending payment details, the server re-checks the current next seniority receiver.
- The same receiver remains ACTIVE until the required approved payments for that level are completed; then the next seniority position becomes ACTIVE.

PAYMENT SPLIT
L1 -> L2: Member 1000
L2 -> L3: Member 3000
L3 -> L4: Member 15600 + Trust 2400 + Admin 2000
L4 -> L5: Member 72000 + Trust 16000 + Admin 12000
L5 -> L6: Member 148000 + Trust 32000 + Admin 20000
L6 -> L7: Member 240000 + Trust 160000 + Admin 100000

ADMIN ACCOUNT ROTATION
Admin accounts rotate automatically A -> B -> C -> A.
Old transaction snapshots remain stored with the transaction.

RUN
1. Upload the project to the Node.js hosting/server used for BORNTOWIN5.
2. Keep the existing data/db.json database with the deployment if your environment uses it.
3. Open Level Tracking from the Admin/Member interface.

V10 change is focused on seniority display and automatic receiver verification; other existing functionality is preserved.
