# Add Configuration Support

Add support for vibec.json and full env var merging:
- Load vibec.json if present, with properties like stacks, testCmd, retries.
- Merge with env vars (e.g., VIBEC_STACKS) and CLI args (CLI highest priority).
- Update options handling to reflect this hierarchy.

## Context: bin/vibec.js
## Output: bin/vibec.js
