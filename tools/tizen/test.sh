#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
node tools/tizen/build-locales.js
node tools/tizen/build-theme.js
for test in tests/tizen/*.test.js; do
    node "$test"
done
python3 -m unittest discover -s tests/tizen -p 'test_*.py' -v
node tools/tizen/acceleration-probe/selftest.cjs
node tools/tizen/graphics-benchmark/adapter.test.cjs
python3 tools/tizen/build-icon.py
node --check samsung/Vemm/main.js
for source in samsung/Vemm/js/*.js; do
    node --check "$source"
done
tools/tizen/check-es5.sh samsung/Vemm
