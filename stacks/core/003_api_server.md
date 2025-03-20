# Vibe Compiler API Server

Create an API server version of the Vibe Compiler using Express.js, replacing the CLI interface. The server should:
- Expose endpoints to:
  - Start compilation (`POST /compile`) with options mirroring CLI flags (stacks, testCmd, etc.).
  - Check compilation status (`GET /status/:id`).
  - Retrieve generated files (`GET /files/:stage/:stack/:path`).
- Reuse the refactored modules from `core/` (e.g., `fileUtils.js`, `stageProcessor.js`, `llm.js`).
- Run compilation asynchronously and return a job ID for status tracking.
- Support the same configuration sources (env vars, `vibec.json`) as the CLI.
- Log requests and compilation progress using the existing `log` utility.
- Pass all existing tests from `tests/cli.test.js` with minimal adaptation (e.g., mock HTTP requests instead of CLI args).

The server should listen on a configurable port (default 3000) and run alongside the CLI version.

## Context: core/cli.js, core/fileUtils.js, core/llm.js, core/stageProcessor.js, tests/cli.test.js
## Output: core/apiServer.js
## Output: bin/vibec-api.js
