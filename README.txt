BORNTOWIN5 DB CONNECTION TEST V2

Purpose: test only whether AIC Cloud can authenticate to PostgreSQL using DATABASE_URL.

The ROOT URL (/) and /db-test both execute SELECT 1.
No table is created. No data is inserted, updated, or deleted.
The password is never logged.

Deploy this temporary test instead of production only for diagnosis.
