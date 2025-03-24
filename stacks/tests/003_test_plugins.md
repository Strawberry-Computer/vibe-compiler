# Test Plugin Support

Add tests for plugin functionality in `bin/vibec.js`:
- Update `test.sh` to run `node output/current/bin/vibec.js --dry-run --stacks=core` and `node output/current/test.js`.
- Use `tape` in `test.js` to test:
  - Static `.md` plugin (e.g., `coding-style.md`) appends to prompt.
  - Dynamic `.js` plugin (e.g., mock returning "test") executes, respects 5000ms timeout.
  - Error in `.js` plugin logs and skips without crashing.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
