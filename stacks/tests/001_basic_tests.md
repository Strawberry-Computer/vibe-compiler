# Add Basic Tests

Generate and enhance a test script for vibec:

- Create `test.sh` with:
  - Start with `#!/bin/bash` and `set -ex` for debugging.
  - Verify `output/current/bin/vibec.js` exists.
  - Run `node output/current/test.js` to execute TAP tests.

- Create `test.js` to validate logging and real mode:
  - Use `tape` to test:
    - Logging:
      - `log.info`, `log.warn`, `log.error`, `log.success` output ANSI colors
      - `log.debug` outputs if `VIBEC_DEBUG=1`.
      - Make sure `log.logger` is overridden to capture output for testing.
    - Real Mode
      - Start an `http` server on `localhost:3000`, mock POST `/chat/completions` to return 'File: test-file.js\n```js\nconsole.log("mock")\n```'
      - run `main()` with args  --api-url=http://localhost:3000` --api-key=test-key --workdir=./test-workdir
      - check `output/current/test-file.js` exists.
    - Cleanup in `finally` block (close server, remove `output/current/test.js` if created by this test).
  - Use only Node builtins (`http`, `tape`), import `./bin/vibec.js`.
  - Use async/await in `tape` tests. Don't use t.end(). 
- Exit with 0 on success, 1 on failure.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
