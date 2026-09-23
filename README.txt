BORNTOWIN5 FINAL PRODUCTION V2

This package fixes the server-side helper functions required by member IDs,
referral IDs and PIN generation. The previous package could fail on PIN
assignment because those helpers were missing, which could make the app stop
responding.

Files are intended to replace the matching files in GitHub B5/main.
Do not delete unrelated legacy files yet.
Do not add db.json to the repository.

Production persistence:
Set DATABASE_URL in AIC Environment after a managed PostgreSQL database is
available. Without DATABASE_URL the app uses local data/db.json for testing.

Login:
Mobile + Password. Forgot Password creates an Admin reset request.

Startup:
B5 3D splash -> Login/Registration.
