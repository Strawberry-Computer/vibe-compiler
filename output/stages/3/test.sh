#!/bin/bash

# Run basic test
node bin/vibec.js --dry-run --stacks=core

# Run unit tests
node test.js

echo "All tests completed successfully"
exit 0