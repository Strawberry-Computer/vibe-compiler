# Add Prompt Caching

Implement caching in `bin/vibec.js`:
- Use `.vibec_hashes.json` to store SHA1 hashes of prompt content (text only, ignore metadata).
- Skip prompts if hash matches and prior run succeeded (test passed or no test).
- Update cache after each prompt; create file if missing.
- On `.vibec_hashes.json` read/write error: log with `log.error`, proceed without caching.
- Add `--clear-cache` flag to delete `.vibec_hashes.json` before run.
- Ensure syntax: quoted strings, closed objects.

## Context: bin/vibec.js
## Output: bin/vibec.js
