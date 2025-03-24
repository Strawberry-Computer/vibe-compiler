# Prepare vibec for Testing

Generate test scripts to validate `bin/vibec.js`:
- Create `test.sh` to verify `output/current/bin/vibec.js` exists, run `node output/current/bin/vibec.js --dry-run`, and `node output/current/test.js`.
- Use `set -ex` in `test.sh` for debugging: exit on failure, print commands.
- Use `tape` in `test.js` to test:
  - Import `vibec.js`, verify `parseArgs`, `getPromptFiles`, `buildPrompt`, `processLlm`, `parseResponse`, `writeFiles`, `runTests`, `main` exist.
  - Call `parseArgs(['--output=custom'])`, check result is `{ output: 'custom', ... }`.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
