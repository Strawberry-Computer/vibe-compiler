# Enhance Test Script

Enhance test.sh with more robust tests:
- Add checks for basic execution (e.g., `node output/current/bin/vibec.js` runs without crashing).
- Test dry-run mode explicitly (e.g., `node output/current/bin/vibec.js --dry-run`).
- Use `tape` for simple TAP-compliant tests in JS, outputting to `test.js` (relative to `output/current/`).
- Ensure `test.sh` runs the JS tests by executing `node output/current/test.js`.
- Avoid running real LLM inference in tests; use `--dry-run` to simulate behavior.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
