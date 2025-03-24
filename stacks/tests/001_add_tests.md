# Add Initial Test Script

Generate a test script for vibec:
- Create `test.sh` to verify `output/current/bin/vibec.js` exists.
- Run `node output/current/bin/vibec.js --dry-run` to ensure it executes without errors.
- Output to `test.sh` in the root of the stage/current directory.
- Exit with 0 on success, 1 on failure.
- Use `node` explicitly to run `vibec.js`; do not assume it’s directly executable.

## Context: bin/vibec.js, test.sh
## Output: test.sh
