# Add Basic Tests

Generate and enhance a test script for vibec:
- Create `test.sh` with:
  - Start with `#!/bin/bash` and `set -ex` for debugging.
  - Verify `output/current/bin/vibec.js` exists.
  - Run `node output/current/bin/vibec.js --dry-run > test-output.txt` to ensure it executes without errors, writing to file.
    - In --dry-run mode, expect it to print the prompt and return 'File: example/file\n```lang\ncontent\n```'.
- Add `test.js` to validate logging and real mode:
  - Use `tape` to test:
    - Logging: `log.info`, `log.warn`, `log.error`, `log.success` output ANSI colors; `log.debug` outputs if `VIBEC_DEBUG=1`.
    - Real Mode: Start an `http` server on `localhost:3000`, mock POST `/chat/completions` to return 'File: test.js\n```js\nconsole.log("mock")\n```', run `main()` with `--output=test_output` and `--api-url=http://localhost:3000`, check `test_output/current/test.js` exists.
    - Cleanup in `finally` block (close server, remove `test_output`).
  - Use only Node builtins (`http`, `tape`), import `./bin/vibec.js`.
- Output to `test.sh` and `test.js` in `output/current/`.
- Exit with 0 on success, 1 on failure.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
