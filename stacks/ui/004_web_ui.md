# Vibe Compiler Web UI

Create a web UI for the Vibe Compiler API server using plain HTML, CSS, and JavaScript (no frameworks). The UI should:
- Provide a form to configure compilation options (stacks, test command, retries, etc.).
- Trigger compilation via `POST /compile` and display a job ID.
- Poll `GET /status/:id` to show real-time progress (stages completed, test results).
- Allow downloading generated files via `GET /files/:stage/:stack/:path`.
- Display logs in a scrollable console-like area.
- Use a clean, minimal design with responsive layout.
- Serve static files through the API server at `/ui`.

The UI should integrate seamlessly with the API server from `core/apiServer.js`.

## Context: core/apiServer.js
## Output: ui/index.html
## Output: ui/styles.css
## Output: ui/script.js
## Output: core/apiServer.js (updated to serve UI)
