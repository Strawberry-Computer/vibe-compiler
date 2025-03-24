# Add Plugin Support

Add static (`.md`) and dynamic (`.js`) plugin support to `bin/vibec.js`:
- Scan `stacks/<stack>/plugins/` for `.md` files; append content to each prompt in alphabetical order.
- Scan for `.js` files; execute as async functions in alphabetical order with 5000ms timeout (configurable via `--plugin-timeout`).
- Context object: `{ config: vibec.json, stack: string, promptNumber: int, promptContent: string, workingDir: output/current path }`.
- On plugin error: log with `log.error`, skip plugin, continue execution.
- Use `log.info` for loaded plugins, `log.debug` for execution steps if `VIBEC_DEBUG=1`.
- Ensure syntax: quoted strings, closed braces.

## Context: bin/vibec.js
## Output: bin/vibec.js
