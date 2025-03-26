# Test Feature Support

Add tests for plugins, CLI, and config in `bin/vibec.js`:
- Update `test.sh` to run:
  - `node output/current/bin/vibec.js --dry-run --stacks=core`
  - `node output/current/test.js`
- Use `tape` in `test.js` to test:
  - Plugins (Real Mode with Mock):
    - Start an `http` server on `localhost:3000`, mock POST `/chat/completions` to return 'File: test.js\n```js\nconsole.log("mock")\n```'.
    - Test static `.md` plugin: Append mock content, run `main()` with `--api-url=http://localhost:3000 --dry-run=false --stacks=test-stack`, check `output/current/test.js`.
    - Test dynamic `.js` plugin: Mock plugin returning "test", run with timeout, verify result.
    - Test plugin error: Mock error, ensure logged and skipped.
    - Cleanup server in `finally`.
  - CLI (Dry-Run):
    - `--stacks=core,tests`: Parse args in dry-run, verify options.
    - `--no-overwrite`, `--dry-run`: Verify flags set.
- Output to `test.sh` and `test.js` in `output/current/`.

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
