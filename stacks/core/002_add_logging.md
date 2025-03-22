# Add Colored Logging

Enhance vibec.js with a colored logging utility:
- Define a `log` object with methods: info (cyan), warn (yellow), error (red), success (green), debug (magenta, enabled via VIBEC_DEBUG).
- Use ANSI color codes (e.g., `\x1b[32m` for green).
- Replace all console.log calls with appropriate log methods (e.g., `log.info`, `log.error`).
- Pay extra attention to JavaScript syntax: ensure all strings are properly quoted, objects are fully closed, and no truncation occurs.

## Context: bin/vibec.js
## Output: bin/vibec.js
