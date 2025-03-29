#!/bin/bash
set -ex

# Check if the vibec.js exists
if [ ! -f output/current/bin/vibec.js ]; then
  echo "Error: output/current/bin/vibec.js does not exist"
  exit 1
fi

# Run the TAP tests
node output/current/test.js

# Exit with success
exit 0