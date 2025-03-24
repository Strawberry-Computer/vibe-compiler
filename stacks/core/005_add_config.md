# Add Configuration Support

Add `vibec.json` loading and environment variable merging to vibec.js. Use priority: CLI > env > config > defaults. Ensure proper JavaScript syntax: quoted strings, closed objects.

## Config Options (vibec.json)
- **`stacks`**: Array of stacks (e.g., `["core", "tests"]`). Default: `["core"]`.
- **`noOverwrite`**: Boolean, no overwrites. Default: `false`.
- **`dryRun`**: Boolean, simulate only. Default: `false`.
- **`apiUrl`**: String, LLM API URL. Default: `"https://api.anthropic.com/v1"`.
- **`apiModel`**: String, LLM model. Default: `"claude-3-7-sonnet"`.
- **`testCmd`**: String, test command. Default: `null`.
- **`retries`**: Integer, retry count. Default: `0`.
- **`pluginTimeout`**: Integer, plugin timeout in ms. Default: `5000`.

## Environment Variables
- `VIBEC_STACKS`: Comma-separated stacks (e.g., `core,tests`).
- `VIBEC_NO_OVERWRITE`: `true`/`false`.
- `VIBEC_DRY_RUN`: `true`/`false`.
- `VIBEC_API_URL`: URL string.
- `VIBEC_API_MODEL`: Model string.
- `VIBEC_TEST_CMD`: Command string.
- `VIBEC_RETRIES`: Integer string (e.g., `2`).
- `VIBEC_PLUGIN_TIMEOUT`: Integer string (e.g., `5000`).

## Implementation
- Load `vibec.json` from root if present, parse as JSON.
- Merge options: CLI args, then env vars, then `vibec.json`, then defaults.
- Convert `VIBEC_STACKS` to array if string.
- Validate: `retries` ≥ 0, `pluginTimeout` > 0, log errors with `log` utility.

## Example vibec.json
```json
{
  "stacks": ["core", "tests"],
  "testCmd": "npm test",
  "retries": 2,
  "pluginTimeout": 5000,
  "apiUrl": "https://api.openai.com/v1",
  "apiModel": "gpt-4"
}
