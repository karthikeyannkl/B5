BORNTOWIN5 — PRODUCTION SAFE BASE V1
====================================

PURPOSE
-------
This package is the deployment-safe base for BORNTOWIN5.

IMPORTANT RULE
--------------
CODE and DATABASE are separate.

Future small UI/code corrections must NOT replace the production database.
This package intentionally does NOT contain data/db.json.

DATABASE
--------
Preferred production storage: AIC Cloud Managed PostgreSQL.
Set the AIC App Hosting environment variable:
  DATABASE_URL = <AIC Managed PostgreSQL connection string>
Optional:
  DATABASE_SSL=true

The server automatically creates one PostgreSQL table:
  borntown5_state

The current application state is stored in PostgreSQL JSONB. This keeps the
existing BORNTOWIN5 API/data model while moving the important data outside the
application code deployment.

LOCAL TEST MODE
---------------
If DATABASE_URL is not set, the app falls back to data/db.json and also writes
 data/db.backup.json. This is only for local/testing use, not recommended for
production.

DEPLOYMENT RULE FOR FUTURE UPDATES
----------------------------------
1. Do NOT upload or replace a production data/db.json.
2. Do NOT delete the PostgreSQL database.
3. Update code only through GitHub/AIC deployment.
4. Keep DATABASE_URL unchanged.
5. After deployment, check /api/health.
6. Existing members, referrals, PINs, messages, Level Tracking, payments and
   approvals remain in PostgreSQL.

BACKUPS
-------
AIC's terms state that customers are responsible for their own backups and
recommend independent/off-site copies for production data. Do not rely only on
AIC internal backups.

For production, keep at least one independent copy of the database export.
AIC also offers S3-compatible Object Storage with versioning/daily backups on
eligible plans; this can be used as an off-site backup destination.

EMAIL BACKUP
------------
Email should not be treated as the primary database backup. A JSON export can
be downloaded and stored in email/Drive manually, but production backups should
be kept in proper storage such as object storage plus a separate offline copy.

MIGRATION
---------
Because the database is external, the same DATABASE_URL can be used after a
server migration. The application code can be deployed to another host and
pointed to the same PostgreSQL database.

FILES
-----
server.js                 Express server + persistent DB adapter
member.html               Member UI
admin.html                Admin UI
leveltrack-member.html    Member Level Tracking UI
leveltrack-admin.html     Admin Level Tracking UI
b5-logo.jpg               B5 logo
package.json              Node.js dependencies

data/                    intentionally contains no production database

test checklist
-------------
1. /api/health
2. Register test member
3. Login
4. Save profile
5. Refresh / logout / login again
6. Admin message -> member
7. Admin PIN -> member PIN wallet
8. Referral link
9. Level Tracking
10. Upgrade/payment/receiver/admin approval
11. Restart/redeploy test: data must still exist

Do not connect borntown5.com until this persistence test passes.
