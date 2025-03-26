# Test Configuration Support

Add tests for config loading in `bin/vibec.js`:
- Update `test.sh` to run:
  - `node bin/vibec.js --dry-run --stacks=core`
- Use `tape` in `test.js` to test:
  - Config Loading (Dry-Run):
    - Mock `fs.readFile` with valid `vibec.json` (`{ "stacks": ["core"], "retries": 2 }`), verify merged options.
    - Mock `fs.readFile` with malformed JSON, verify empty config and `log.error` call.
    - Priority: CLI `--stacks=tests` overrides env `VIBEC_STACKS=core,tests` overrides config `stacks: ["core"]`.
    - Validation: Mock `retries: -1`, verify `log.error` and default used; `pluginTimeout: 0`, verify `log.error`.
  - Dry-Run Execution:
    - Run `main()` with `--dry-run --api-url=http://localhost:3000`, verify no real LLM call, outputs mock response.
- Output to `test.sh` and `test.js` in `output/current/`.
- Use `node` explicitly, no real LLM calls.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
