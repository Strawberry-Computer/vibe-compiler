# Enhance Test Script

Enhance `test.sh` and add `test.js` to validate logging from `bin/vibec.js`:
- Update `test.sh` to run `node output/current/bin/vibec.js --dry-run` and `node output/current/test.js`.
- Use `tape` in `test.js` for TAP-compliant tests, no `t.end()` needed with async.
- Test: `log.info`, `log.warn`, `log.error`, `log.success` output ANSI colors; `log.debug` outputs only if `VIBEC_DEBUG=1`.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM inference.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
