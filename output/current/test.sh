#!/bin/bash
set -ex

# Verify bin/vibec.js exists
if [ ! -f "bin/vibec.js" ]; then
  echo "Error: bin/vibec.js not found!"
  exit 1
fi

# Run tests
node test.js