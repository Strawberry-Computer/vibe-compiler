# CLI Parser Unit Tests

Generate unit tests for the Vibe Compiler's CLI parser and core functionality in `bin/vibec.js`. The tests should:
- Use the Jest testing framework (compatible with `npm test`).
- Test CLI parsing for all flags: `--stacks`, `--test-cmd`, `--retries`, `--plugin-timeout`, `--no-overwrite`, `--api-url`, `--api-model`, `--help`, `--version`.
- Verify environment variable overrides (e.g., `VIBEC_STACKS`, `VIBEC_API_KEY`).
- Cover key functions like `parseArgs`, `getEnvVars`, `loadConfig`, and `mergeStagesToCurrent`.
- Include edge cases (e.g., invalid numbers, missing files, malformed JSON).
- Mock `process.argv`, `process.env`, and `fs` operations to simulate CLI usage and file system interactions.

The tests should validate the current behavior without modifying the implementation.

## Context: bin/vibec.js
## Output: tests/cli.test.js
