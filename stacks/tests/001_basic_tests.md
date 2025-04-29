# Add Basic Tests

- Replace `test.sh` with:
  - Start with `#!/bin/bash` and `set -ex` for debugging.
  - Verify `bin/vibec.js` exists.
  - Run `node test.js` to execute TAP tests.

- Create `test.js` to validate logging and real mode:
  - Logging:
    - `log.info`, `log.warn`, `log.error`, `log.success` output ANSI colors
    - `log.debug` outputs if `VIBEC_DEBUG=1`.
    - Make sure `log.logger` is overridden to capture output for testing.
  - Real Mode
    - Need to cd to temp directory to avoid conflicts with either stacks/ or output/ for main project.
    - Start an `http` server on `localhost:3000`, mock POST `/chat/completions` to return 'File: test-file.js\n```js\nconsole.log("mock")\n```'
    - run `main()` with args --api-url=http://localhost:3000` --api-key=test-key --workdir=./test-workdir
    - check `./test-workdir/output/current/test-file.js` exists.

## coding-style:
- Generate only the files which have corresponding Output: directive. 
- Don't assume any other files besides Output: and Context: exist.
- Use ES6+ syntax with async/await and import/export.
- Don't use require() use import instead.

- Use `tape` for testing. Don't use `jest` for anything.
- Use async/await in `tape` tests. Don't use `t.end()`. 
- Use `try`/`catch` to verify errors are thrown.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
