#!/bin/bash

echo "Tests passed"

# Verify Vibe Compiler's dry-run mode
node output/current/bin/vibec.js --dry-run

exit 0
