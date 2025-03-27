#!/bin/bash
set -ex

# Verify vibec.js exists
if [ ! -f "bin/vibec.js" ]; then
  echo "Error: bin/vibec.js doesn't exist"
  exit 1
fi

# Run vibec with --dry-run to ensure it executes without errors
node bin/vibec.js --dry-run > test-output.txt

# Run the TAP tests
node output/current/test.js

echo "All tests passed!"
exit 0