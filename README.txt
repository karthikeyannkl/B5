B5 EMAIL-ONLY CORRECTION

File: B5-main/b5-engine.js
Scope: Email notification SMTP send + SENT/FAILED status based on SMTP response.
No member.html/dashboard/notification UI changes are included.

IMPORTANT:
- Keep a backup of the currently working b5-engine.js before replacing it.
- This file passes Node.js syntax validation, but has not been deployed against your live Cloudflare D1 environment here.
- After upload, verify member and admin login first. If either login fails, restore your backup immediately.
- SMTP secrets must remain configured in the hosting environment; do not put passwords in this file.
