# Expand CLI Support

Enhance CLI parsing in `vibec.js` with additional options.

### New CLI Options
- `--help`: Show usage and exit. 
- `--version`: Show `vibec vX.Y.Z` and exit.
- `--retries=<number>`: Retry count, non-negative integer. Default: `0`.
- `--output=<dir>`: Output directory (e.g., `custom_output`). Default: `output`.

### Implementation Notes
- Ensure proper JavaScript syntax: use quoted strings and close all objects.
- Keep `parseArgs` stateless and pure. Don't log anything. When any error occurs, it should throw. Caller should catch and handle (e.g. log and `process.exit(1)`).

## Context: bin/vibec.js
## Output: bin/vibec.js