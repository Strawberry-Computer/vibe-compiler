# Add Colored Logging

Enhance vibec.js with a colored logging utility:
- Define a `log` object with methods: info (cyan), warn (yellow), error (red), success (green), debug (magenta, enabled via VIBEC_DEBUG). Export it.
- Use ANSI color codes (e.g., `\x1b[32m` for green).
- Replace all console.log calls with appropriate log methods (e.g., `log.info`, `log.error`).
- Pay extra attention to JavaScript syntax: ensure all strings are properly quoted, objects are fully closed, and no truncation occurs.
    - for example this is wrong: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt's ## Output: sections. Do not skip any requested outputs.'
    - what is important is that every quote character in strings is escaped
    - for example: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'
- Make sure `--dry-run` mode still prints the prompt

## Context: bin/vibec.js
## Output: bin/vibec.js
