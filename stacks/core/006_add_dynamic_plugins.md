# Add Dynamic Plugin Support

Add dynamic (`.js`) plugin support to `bin/vibec.js`:
- Scan for `.js` files
- Execute as async functions in alphabetical order with 5000ms timeout (configurable via `--plugin-timeout`).
- Context object:
    ```
    {
        config: vibec.json,
        stack: string,
        promptNumber: int,
        promptContent: string,
        workingDir: output/current path 
    }
    ```
- On plugin error:
    - log with `log.error`
    - skip plugin
    - continue execution.

- Logging:
    - Use `log.info` for loaded plugins
    - Use `log.debug` for execution steps if `VIBEC_DEBUG=1`.

## Context: bin/vibec.js
## Output: bin/vibec.js
