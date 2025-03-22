# Add Initial Test Script

Generate an initial test script for vibec:
- Create test.sh to check if vibec.js exists in output/current/bin/.
- Run `node output/current/bin/vibec.js --dry-run` to verify it executes without errors.
- Output to test.sh in the root of the stage/current directory.
- Exit with 0 on success, 1 on failure.
- Keep it simple: no additional feature checks beyond existence and dry-run execution.

## Context: bin/vibec.js, bin/test.sh
## Output: test.sh
