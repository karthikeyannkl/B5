B5 Production Safe v1

Replace only server.js in the existing B5 GitHub project with server-B5-production-safe-v1.js.

Changes:
1. Dashboard GET no longer calls save(db), avoiding an unnecessary database write on every dashboard refresh.
2. Supabase REST calls have a 12-second timeout instead of hanging indefinitely.
3. Startup retries Supabase initialization up to 3 times.
4. If Supabase is temporarily unavailable but local real data exists, the process no longer immediately exits with process.exit(1); it starts in degraded local mode instead of producing an immediate 502.
5. Payment screenshots are treated as transient verification data and are removed from persistent local/Supabase snapshots. They remain available in the running process until restart; after restart they are intentionally not restored.
6. JSON body limit is 25 MB so multi-proof uploads can be accepted by the API.
7. LEVEL_RULES required referral counts are synchronized to 3,5,7,9,11,13. Payment amounts are unchanged.

Important:
- Do not delete other save(db) calls.
- Do not rerun the 9th-referral test before deployment is confirmed.
- This file changes server.js only; frontend code is not changed.
