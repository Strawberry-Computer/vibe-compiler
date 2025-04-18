# Add Colored Logging

Enhance vibec.js with a colored logging utility:
- Define a `log` object with methods: info (cyan), warn (yellow), error (red), success (green), debug (magenta, enabled via VIBEC_DEBUG). Export it.
- Use ANSI color codes (e.g., `\x1b[32m` for green).
- Replace all console.log calls with appropriate log methods (e.g., `log.info`, `log.error`).
- Use `log.logger` to log using `console.log` by default, but allow overriding with a custom logger for testing.
- Pay extra attention to JavaScript syntax: ensure all strings are properly quoted, objects are fully closed, and no truncation occurs.
    - for example this is wrong: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt's ## Output: sections. Do not skip any requested outputs.'
    - what is important is that every quote character in strings is escaped
    - for example: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'
- Make sure `--dry-run` mode still prints the prompt

## coding-style
- Think carefully and only do what is asked with the most concise and elegant solution that changes as little as possible.
- Generate only the files which have corresponding Output: directive. 
- Don't assume any other files besides Output: and Context: exist.
- Use ES6+ syntax with async/await and import/export.
- Avoid dependencies on external libraries like `openai`: just use `fetch` to make HTTP requests.

## Context: bin/vibec.js
## Output: bin/vibec.js
