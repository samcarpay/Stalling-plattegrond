#!/bin/bash
# Builds .claude/synctest/: a copy of the app that uses the test data path
# (SYNC_PATH/synctest-copy) instead of the real data. Used by tests/smoke-test.js.
set -e
cd "$(dirname "$0")/.."
rm -rf .claude/synctest
mkdir -p .claude/synctest
cp index.html styles.css app.js manifest.json *.png .claude/synctest/
# the pickup requests get their own copy too (smokeTest.prepare() fills it,
# like the werkloods bookings below), so the test copy can't touch real data
sed -e 's|^const SYNC_PATH = "\(.*\)";|const SYNC_PATH = "\1/synctest-copy";|' \
    -e 's|^const APPOINTMENTS_PATH = ".*";|const APPOINTMENTS_PATH = "Plattegrond-111ws-qbh3Tm791/synctest-copy/appointments";|' \
    firebase-config.js > .claude/synctest/firebase-config.js
grep -q 'SYNC_PATH = ".*synctest-copy"' .claude/synctest/firebase-config.js || { echo "could not point the test copy at the test path" >&2; exit 1; }
grep -q 'APPOINTMENTS_PATH = ".*synctest-copy/appointments"' .claude/synctest/firebase-config.js || { echo "could not point the test copy at test appointments" >&2; exit 1; }
# werkloods/overig bookings too — that path is set in app.js itself
sed -i '' "s|const WERKLOODS_PATH = 'werkloods-bookings';|const WERKLOODS_PATH = 'Plattegrond-111ws-qbh3Tm791/synctest-copy/werkloods';|" .claude/synctest/app.js
grep -q "WERKLOODS_PATH = '.*synctest-copy/werkloods'" .claude/synctest/app.js || { echo "could not point the test copy at test werkloods bookings" >&2; exit 1; }
echo "test copy ready: http://localhost:8080/.claude/synctest/index.html"
