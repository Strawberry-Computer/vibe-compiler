# Modular Refactoring of Vibe Compiler

Refactor the monolithic `bin/vibec.js` into smaller, maintainable modules while keeping all functionality intact. The refactored code should:
- Extract distinct concerns into separate files (e.g., CLI parsing, file handling, LLM integration, stage processing).
- Use ES6 module syntax (`import/export`) for Node.js compatibility.
- Maintain the same CLI interface and behavior as the original.
- Pass all existing tests from `tests/cli.test.js` without modification.
- Organize modules under a `core/` directory (e.g., `core/cli.js`, `core/fileUtils.js`, `core/llm.js`).
- Update `bin/vibec.js` to import and orchestrate these modules.

The refactored structure should make it easier to extend or replace components like the CLI with an API server.

## Context: bin/vibec.js, tests/cli.test.js
## Output: core/cli.js
## Output: core/fileUtils.js
## Output: core/llm.js
## Output: core/stageProcessor.js
## Output: bin/vibec.js
