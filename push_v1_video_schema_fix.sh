#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

python3 patch_v1_video_schema_fix.py
git diff -- index.html sw.js vercel.json dadash-app.compiled.js

echo
echo "Review OK? Then run:"
echo "  git checkout -b fix/v1-video-schema-fast8"
echo "  git add index.html sw.js vercel.json dadash-app.compiled.js patch_v1_video_schema_fix.py push_v1_video_schema_fix.sh"
echo "  git commit -m 'fix(v1-messagerie): restore video sends and schema-compatible reads'"
echo "  git push origin fix/v1-video-schema-fast8"
