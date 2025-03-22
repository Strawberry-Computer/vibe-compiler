# Expand CLI Support

Add full CLI parsing to vibec.js:
- Support flags: --retries, --plugin-timeout, --help, --version.
- Merge with env vars (e.g., VIBEC_RETRIES) with CLI priority.
- Implement --help and --version with usage text and exit.
- Keep existing --stacks, --no-overwrite, --dry-run, --api-url, --api-model, --test-cmd.

## Context: bin/vibec.js
## Output: bin/vibec.js
