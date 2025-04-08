# Test Configuration Support

Add tests for config loading in `bin/vibec.js`:
  - Config Loading (Dry-Run):
    - Mock `fs.readFile` with valid `vibec.json` containing:
      ```json
      {
        "stacks": ["core", "tests"],
        "testCmd": "npm test", 
        "retries": 2,
        "pluginTimeout": 5000,
        "apiUrl": "https://api.openai.com/v1",
        "apiModel": "gpt-4"
      }
      ```
      Verify merged options match config values
    - Mock `fs.readFile` with malformed JSON, verify empty config and `log.error` call
    - Priority tests:
      - CLI args override env vars and config:
        - Set config `stacks: ["core"]`
        - Set env `VIBEC_STACKS=core,tests`
        - Pass CLI `--stacks=tests`
        - Verify final stacks is `["tests"]`
      - Env vars override config:
        - Set config `stacks: ["core"]`
        - Set env `VIBEC_STACKS=core,tests`
        - Verify final stacks is `["core", "tests"]`
    - Validation:
      - Mock config with `retries: -1`, verify `log.error` is called and default value 0 is used
      - Mock config with `pluginTimeout: 0`, verify `log.error` is called and default value 5000 is used
      - Mock config with missing required fields, verify defaults are used:
        - workdir: "."
        - stacks: ["core"]
        - noOverwrite: false
        - dryRun: false
        - start: null
        - end: null
      - Verify `VIBEC_STACKS` string is converted to array

IMPORTANT:
  - Use `t.throws` to verify errors are thrown. There is no such thing as `t.rejects`.

## Context: bin/vibec.js, test.js
## Output: test.js