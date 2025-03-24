# Test Configuration Support

Add tests for config in `bin/vibec.js`:
- Update `test.sh` to run `node output/current/bin/vibec.js --dry-run` and `node output/current/test.js`.
- Use `tape` in `test.js` to test:
  - `vibec.json` with `{ "stacks": ["core"], "retries": 2 }` applies.
  - `VIBEC_STACKS=tests` overrides `vibec.json`.
  - CLI `--stacks=core` overrides env and config.
  - Malformed `vibec.json` logs error, uses defaults.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
