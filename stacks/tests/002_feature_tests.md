# Test Feature Support

Add tests for plugins, CLI, and config in `bin/vibec.js`:
- Update `test.sh` to run:
  - `node output/current/bin/vibec.js --dry-run --stacks=core`
  - `node output/current/test.js`
- Use `tape` in `test.js` to test:
  - Plugins:
    - Static `.md` plugin (e.g., `coding-style.md`) appends to prompt.
    - Dynamic `.js` plugin (mock returning "test") executes, respects 5000ms timeout.
    - Error in `.js` plugin logs and skips without crashing.
  - CLI:
    - `--stacks=core,tests` parses correctly.
    - `--no-overwrite`, `--dry-run` flags work.
    - `--help` outputs usage text, exits 0.
    - `--version` outputs `vibec vX.Y.Z`, exits 0.
  - Config:
    - `vibec.json` with `{ "stacks": ["core"], "retries": 2 }` applies.
    - `VIBEC_STACKS=tests` overrides `vibec.json`.
    - CLI `--stacks=core` overrides env and config.
    - Malformed `vibec.json` logs error, uses defaults.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
