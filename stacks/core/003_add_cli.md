# Expand CLI Support

Enhance CLI parsing in `vibec.js` with additional options.

### New CLI Options
- `--help`: Show usage and exit. 
- `--version`: Show `vibec vX.Y.Z` and exit.
- `--retries=<number>`: Retry count, non-negative integer. Default: `0`.
- `--plugin-timeout=<ms>`: JS plugin timeout in ms, positive integer. Default: `5000`.
- `--output=<dir>`: Output directory (e.g., `custom_output`). Default: `output`.

### Implementation Notes
- Ensure proper JavaScript syntax: use quoted strings and close all objects.

## Context: bin/vibec.js
## Output: bin/vibec.js