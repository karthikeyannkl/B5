MAGIZH LevelTrack V27 - Separate Module

Do NOT replace the approved V15 admin.html/member.html with these files.
Keep V15 master files unchanged.

Upload these 3 files alongside the existing server:
1. leveltrack-admin.html
2. leveltrack-member.html
3. server.js (replace the existing server.js with this version)

Routes:
/admin.html                 -> existing V15 Admin master
/member.html                -> existing V15 Member master
/leveltrack-admin.html      -> separate V15-style LevelTrack Admin module
/leveltrack-member.html     -> separate V15-style LevelTrack Member module

The LevelTrack module stores its workflow in data/db.json under levelTrack.
Existing member/pin/message APIs are retained and LevelTrack APIs are added.

After uploading server.js, restart/redeploy the Node/Render service.
