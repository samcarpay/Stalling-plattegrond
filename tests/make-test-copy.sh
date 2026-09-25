#!/bin/bash
# Builds .claude/synctest/: a copy of the app that uses the test data path
# (SYNC_PATH/synctest-copy) instead of the real data. Used by tests/smoke-test.js.
set -e
cd "$(dirname "$0")/.."
rm -rf .claude/synctest
mkdir -p .claude/synctest
cp index.html styles.css app.js manifest.json *.png .claude/synctest/
sed 's|^const SYNC_PATH = "\(.*\)";|const SYNC_PATH = "\1/synctest-copy";|' firebase-config.js > .claude/synctest/firebase-config.js
grep -q 'synctest-copy' .claude/synctest/firebase-config.js || { echo "could not point the test copy at the test path" >&2; exit 1; }
echo "test copy ready: http://localhost:8080/.claude/synctest/index.html"
