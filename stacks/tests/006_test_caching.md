# Test Prompt Caching

Add tests for caching in `bin/vibec.js`:
- Update `test.sh` to run `node output/current/bin/vibec.js --dry-run --stacks=core` and `node output/current/test.js`.
- Use `tape` in `test.js` to test:
  - Unchanged prompt skips processing (check `.vibec_hashes.json` hash).
  - Changed prompt reprocesses.
  - `--clear-cache` deletes `.vibec_hashes.json`.
  - Malformed `.vibec_hashes.json` logs error, continues.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
