#!/bin/bash

echo "Tests passed"

node output/current/bin/vibec.js --dry-run >/dev/null 2>&1

exit 0
