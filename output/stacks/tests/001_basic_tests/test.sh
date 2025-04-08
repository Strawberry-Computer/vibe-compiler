#!/bin/bash
set -ex

# Check if vibec.js exists
if [ ! -f "output/current/bin/vibec.js" ]; then
  echo "Error: vibec.js not found in output/current/bin/"
  exit 1
fi

# Run the test suite
node output/current/test.js

# Exit with success
exit 0