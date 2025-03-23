# Enhance Test Script

Enhance test.sh with more robust tests:
- Add checks for CLI functionality (e.g., `node output/current/bin/vibec.js --help`, `--version`).
- Use `tape` for simple TAP-compliant tests in JS
- Make sure to avoid running real LLM inference in tests. Either use --dry-run or run our own fake LLM API server and set VIBEC_API_URL accordingly

## Context: bin/vibec.js, output/current/test.sh
## Output: test.sh
## Output: test.js 

