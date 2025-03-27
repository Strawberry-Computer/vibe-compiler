#!/bin/bash
set -e

echo "Running vibec tests..."

echo "Testing CLI dry run mode..."
node output/current/bin/vibec.js --dry-run --stacks=core

echo "Running test suite..."
node output/current/test.js

echo "All tests passed!"
exit 0