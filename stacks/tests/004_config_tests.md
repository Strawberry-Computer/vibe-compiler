# Test Configuration Support

Add tests for config loading in `bin/vibec.js`:
  - Run everything in temp directory to avoid conflicts with either stacks/ or output/ for main project.

  - Config Loading (Dry-Run):
    - Create `vibec.json` containing:
      ```json
      {
        "stacks": ["core", "tests"],
        "testCmd": "npm test", 
        "retries": 2,
        "pluginTimeout": 5000,
        "apiUrl": "https://openrouter.ai/api/v1",
        "apiModel": "anthropic/claude-3.7-sonnet",
        "output": "output"
      }
      ```
      Verify merged options match config values

    - Create `vibec.json` with malformed JSON, verify error is thrown

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
      - Use config with missing required fields, verify defaults are used
      - Verify `VIBEC_STACKS` string is converted to array

## Context: bin/vibec.js, test.js
## Output: test.js