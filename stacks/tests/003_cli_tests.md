# Test CLI Enhancements

Add tests for expanded CLI support in `bin/vibec.js`:
  - CLI Parsing (Dry-Run):
    - `--help`: Mock `process.exit`, verify usage text includes all flags (e.g., `--stacks`, `--api-url`, `--retries`).
    - `--version`: Mock `process.exit`, verify output like `vibec vX.Y.Z`.
    - `--api-url=<url>`: Verify parsed value (e.g., `https://api.anthropic.com/v1`).
    - `--api-model=<model>`: Verify parsed value (e.g., `claude-3.7-sonnet`).
    - `--test-cmd=<cmd>`: Verify parsed value (e.g., `npm test`).
    - `--retries=<number>`: Verify non-negative integer (e.g., `2`).
    - `--output=<dir>`: Verify parsed value (e.g., `custom_output`).
    - Env Var Merge: Set `VIBEC_API_URL`, verify CLI `--api-url` overrides it.
    - NOTE: `parseArgs` throws when any error occurs. If you need to test anything else - you should be calling `main`.
  - Dry-Run Execution:
    - Run `main()` with `--dry-run --api-url=http://localhost:3000`, verify no real LLM call, outputs mock response.
    - Don't mock I/O, create real test input files if needed. Run mock server for LLM API.
    - Dry mode should not write any files.

IMPORTANT:
  - Modify existing test.js vs adding new tests.
  - Use `t.assertion` instead of `t.ok` for custom assertions.

## Context: bin/vibec.js, test.js
## Output: test.js
