B5 Persistence Safety Patch — Setup notes

What this patch does
- Keeps the existing B5 member, level, seniority, payment and approval business logic unchanged.
- Writes db.json using a temp file + atomic rename and retains db.json.previous where possible.
- Retries Supabase state saves up to three times and exposes the last save status at GET /api/db-status.
- Writes a second JSON snapshot to B5_BACKUP_DIR/b5-state.json on each local save.
- Shows an Admin-page status banner, refreshed every 10 seconds, for Supabase and second-copy status.
- After the existing LevelTrack approval routes complete, records an Admin in-app message and attempts a member email when an email address exists. In-app messaging does not require SMTP; email requires SMTP_PASS and a member email address. Email failure is logged and does not reverse the approval.

IMPORTANT: the second JSON copy is a truly separate/durable backup only if B5_BACKUP_DIR points to an AIC Cloud persistent volume or another mounted persistent storage path. If not configured, the default folder is beside DB_FILE and may be ephemeral during deploy/recreate. Do not assume it survives deployments until AIC Cloud confirms the configured path is persistent.

AIC Cloud setup
1. Do not overwrite production directly. Keep the current deployment and the Supabase backup table intact.
2. In AIC Cloud environment variables, set B5_BACKUP_DIR to the persistent storage mount path documented for your app. Do not guess a path; ask AIC Cloud support which path is persistent for this service.
3. Deploy to a staging/test app first, using a copy of the Supabase database if possible.
4. Confirm GET /api/db-status shows saveStatus.state = "saved" after a test change and secondaryBackup.state = "saved", secondaryBackup.exists = true.
5. Confirm the Admin banner shows both statuses. If either fails, do not consider the backup complete.
6. Test an approval in staging: confirm the member sees the in-app message, Admin message log records the approval, and (if SMTP is configured and the member has an email address) the approval email arrives. Check server logs for email send failures.
7. Only then plan production deployment with a maintenance window and a fresh Supabase backup.

Limitations
- This patch does not create a third-party cloud storage account or independently upload files off-host; no such credentials/provider were supplied.
- The existing Supabase app_state is still one large JSON row. The reported statement timeout may continue until the database write strategy/schema is addressed. Retry/status reporting does not guarantee that Supabase writes will succeed.
- The status endpoint is diagnostic and remains unauthenticated in this patch; protect it with admin authentication before production deployment.
- Approval email is best-effort and not guaranteed unless SMTP is configured and tested. The in-app message is recorded regardless of email availability.
