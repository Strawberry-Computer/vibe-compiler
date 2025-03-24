# Expand CLI Support

Add complete CLI parsing to vibec.js. Support all listed flags, merge with environment variables (CLI overrides env vars), and implement `--help` and `--version` with usage text. Ensure proper JavaScript syntax: quoted strings, closed objects.

## CLI Options
- **`--stacks=<stack1,stack2,...>`**: Stacks to process (e.g., `core,tests`). Default: `core`.
- **`--no-overwrite`**: Prevent file overwrites. Flag, default: false.
- **`--dry-run`**: Simulate without changes. Flag, default: false.
- **`--api-url=<url>`**: LLM API URL (e.g., `https://api.anthropic.com/v1`). Default: `https://api.anthropic.com/v1`.
- **`--api-model=<model>`**: LLM model (e.g., `claude-3-7-sonnet`). Default: `claude-3-7-sonnet`.
- **`--test-cmd=<command>`**: Test command (e.g., `npm test`). Default: none.
- **`--retries=<number>`**: Retry count, non-negative integer. Default: 0.
- **`--plugin-timeout=<ms>`**: JS plugin timeout in ms, positive integer. Default: 5000.
- **`--help`**: Show usage and exit. Flag. Output:
