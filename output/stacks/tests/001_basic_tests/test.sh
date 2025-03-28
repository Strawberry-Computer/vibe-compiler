#!/bin/bash
set -ex

# Verify vibec.js exists
if [ ! -f "output/current/bin/vibec.js" ]; then
  echo "Error: vibec.js not found at output/current/bin/vibec.js"
  exit 1
fi

# Run vibec in dry-run mode
node bin/vibec.js --dry-run > output/current/test-output.txt

# Verify test.js was created
if [ ! -f "output/current/test-output.txt" ]; then
  echo "Error: test-output.txt was not created"
  exit 1
fi

# Run the TAP tests
node output/current/test.js

echo "All tests passed!"
exit 0