# Test CLI Support

Add tests for CLI parsing in `bin/vibec.js`:
- Update `test.sh` to run `node output/current/bin/vibec.js --dry-run --stacks=core` and `node output/current/test.js`.
- Use `tape` in `test.js` to test:
  - `--stacks=core,tests` parses correctly.
  - `--no-overwrite`, `--dry-run` flags work.
  - `--help` outputs usage text, exits 0.
  - `--version` outputs `vibec vX.Y.Z`, exits 0.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
