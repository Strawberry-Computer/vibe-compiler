# Test CLI Enhancements

Add tests for expanded CLI support in `bin/vibec.js`:
- Update `test.sh` to run:
  - `node bin/vibec.js --dry-run --stacks=core`
- Use `tape` in `test.js` to test:
  - CLI Parsing (Dry-Run):
    - `--help`: Mock `process.exit`, verify usage text includes all flags (e.g., `--stacks`, `--api-url`, `--retries`).
    - `--version`: Mock `process.exit`, verify output like `vibec vX.Y.Z`.
    - `--api-url=<url>`: Verify parsed value (e.g., `https://api.anthropic.com/v1`).
    - `--api-model=<model>`: Verify parsed value (e.g., `claude-3.7-sonnet`).
    - `--test-cmd=<cmd>`: Verify parsed value (e.g., `npm test`).
    - `--retries=<number>`: Verify non-negative integer (e.g., `2`).
    - `--plugin-timeout=<ms>`: Verify positive integer (e.g., `6000`).
    - `--output=<dir>`: Verify parsed value (e.g., `custom_output`).
    - Env Var Merge: Set `VIBEC_API_URL`, verify CLI `--api-url` overrides it.
  - Dry-Run Execution:
    - Run `main()` with `--dry-run --api-url=http://localhost:3000`, verify no real LLM call, outputs mock response.
- Use `node` explicitly, no real LLM calls.

## Context: bin/vibec.js, test.js
## Output: test.js
