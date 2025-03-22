# Add Plugin Support

Add support for static (`.md`) and dynamic (`.js`) plugins to enhance prompt processing in vibec.js:
- Scan `stacks/<stack>/plugins/` for `.md` files and append their content to each prompt in the stack (e.g., as additional context or instructions).
- Scan `stacks/<stack>/plugins/` for `.js` files, treat them as async functions, and execute them with a context object; append their output to the prompt.
- Use the `log` utility (from prior logging step) to trace plugin loading: `log.info` for successful loads, `log.error` for failures, `log.debug` for detailed steps (if `VIBEC_DEBUG` is set).
- Context object for `.js` plugins should include: `{ config, stack, promptNumber, promptContent, workingDir }`.
- Handle errors gracefully (e.g., skip invalid plugins, log issues) without halting execution.
- Ensure JavaScript syntax is complete: proper quotes, closed braces, no truncation.

## Context: bin/vibec.js
## Output: bin/vibec.js
