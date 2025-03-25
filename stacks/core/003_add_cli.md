# Expand CLI Support

Enhance CLI parsing in vibec.js with additional options, building on existing --stacks, --dry-run, --no-overwrite, --start, --end:
- Add flags: `--help` (show usage), `--version` (show `vibec vX.Y.Z`), `--api-url=<url>` (e.g., `https://api.anthropic.com/v1`), `--api-model=<model>` (e.g., `claude-3-7-sonnet`), `--test-cmd=<command>`, `--retries=<number>`, `--plugin-timeout=<ms>`, `--output=<dir>`.
- Merge with environment variables (CLI overrides env vars).
- Implement `--help` with usage text and `--version` with version output, exiting with code 0.
- Ensure proper JavaScript syntax: quoted strings, closed objects.

## CLI Options
- `--api-url=<url>`: LLM API URL (e.g., `https://api.anthropic.com/v1`). Default: inherited from vibec.js.
- `--api-model=<model>`: LLM model (e.g., `claude-3-7-sonnet`). Default: inherited from vibec.js.
- `--test-cmd=<command>`: Test command (e.g., `npm test`). Default: none.
- `--retries=<number>`: Retry count, non-negative integer. Default: 0.
- `--plugin-timeout=<ms>`: JS plugin timeout in ms, positive integer. Default: 5000.
- `--output=<dir>`: Output directory (e.g., `custom_output`). Default: `output`.
- `--help`: Show usage and exit. Example output:
