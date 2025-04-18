#!/bin/bash
set -ex

# Verify bin/vibec.js exists
if [ ! -f "bin/vibec.js" ]; then
  echo "bin/vibec.js does not exist"
  exit 1
fi

# Run tests
node test.js