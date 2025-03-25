# Enhance Test Script

Enhance `test.sh` and add `test.js` to validate logging and real mode in `bin/vibec.js`:
- Update `test.sh` to run `node output/current/test.js`.
- Use `tape` in `test.js` to test:
  - Logging: `log.info`, `log.warn`, `log.error`, `log.success` output ANSI colors; `log.debug` outputs if `VIBEC_DEBUG=1`.
  - Real Mode
    - Use `http` module to start a server on `localhost:3000`
    - mock POST `/chat/completions` to return 'File: test.js\n```js\nconsole.log("mock")\n```'
    - run `main()` with `--output=test_output` and `--api-url=http://localhost:3000`
    - check `test_output/current/test.js` exists.

- Output to `test.sh` and `test.js` in `output/current/`.
- Use only Node built-in modules (`http`, `tape`).
- Import `./bin/vibec.js` in `test.js`

## Context: bin/vibec.js, test.sh
## Output: test.sh
## Output: test.js
