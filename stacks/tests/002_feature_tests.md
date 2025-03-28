# Test Feature Support

Add tests for plugins, CLI, and config in `bin/vibec.js`:
- Use `tape` in `test.js` to test:
  - Make sure to test within temporary directory to avoid conflicts with either stacks/ or output/ for main project.
  - Plugins (Real Mode with Mock):
    - Start an `http` server on `localhost:3000`, mock POST `/chat/completions` to return 'File: test.js\n```js\nconsole.log("mock")\n```'.
    - Test static `.md` plugin: Append mock content, run `main()` with `--api-url=http://localhost:3000 --dry-run=false --stacks=test-stack`, check `output/current/test.js`.
    - Test dynamic `.js` plugin: Mock plugin returning "test", run with timeout, verify result.
    - Test plugin error: Mock error, ensure logged and skipped.
    - Cleanup server in `finally`.
  - CLI (Dry-Run):
    - `--stacks=core,tests`: Parse args in dry-run, verify options.
    - `--no-overwrite`, `--dry-run`: Verify flags set.

## Context: bin/vibec.js, test.js
## Output: test.js
