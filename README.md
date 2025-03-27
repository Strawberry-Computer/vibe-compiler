# Vibe Compiler (vibec)

A self-compiling tool to process vibe-coded projects using prompt stacks and LLM generation.

## Overview

`vibec` transforms stacks of prompts into code and tests, supporting static `.md` and dynamic `.js` plugins. It outputs staged artifacts (`output/stages/`) for Git history and a current runtime version (`output/current/`) aggregated from all stages with a "Last-Wins" strategy. It can compile itself using its own structure.

## Project Structure

```
vibec/
├── bin/
│   ├── vibec.js            # Single, complete implementation
│   └── test.sh             # Test script
├── bootstrap.js            # Progressive bootstrapping script
├── stacks/
│   ├── core/               # Core functionality prompts
│   │   ├── 001_add_logging.md  # Colored logging
│   │   ├── 002_add_plugins.md  # Plugin support
│   │   ├── 003_add_cli.md      # Expanded CLI options
│   │   ├── 004_add_config.md   # Config loading
│   │   └── plugins/            # User-defined plugins
│   │       └── coding-style.md # Example static plugin
│   ├── tests/              # Test generation prompts 
│   │   ├── 001_basic_tests.md  # Basic execution and logging tests
│   │   ├── 002_feature_tests.md # Plugin and CLI feature tests
│   │   ├── 003_cli_tests.md    # Expanded CLI tests
│   │   └── 004_config_tests.md # Configuration tests
│   └── plugins/            # Additional plugins (optional)
├── output/
│   ├── stages/             # Isolated stage outputs
│   │   ├── 1/
│   │   ├── 2/
│   │   └── ...
│   └── current/            # Latest merged output
├── .vibec_hashes.json      # Tracks prompt hashes and test results
├── vibec.json              # Configuration
└── package.json
```

## Architecture

Vibec uses a progressive bootstrapping approach:
1. Starts with the base implementation (`bin/vibec.js`).
2. Processes each numerical stage (001, 002, etc.) in order.
3. Checks for a new `vibec.js` after each stage and uses it for subsequent stages if generated.
4. Creates a self-improving cycle where vibec evolves during the build.

## Getting Started

### Installation

To use `vibec` for your own projects:
1. Install it globally:
   ```bash
   npm install -g vibec
   ```
   Or use `npx` without installing:
   ```bash
   npx vibec --version
   ```

2. Set up your API key for LLM integration:
   ```bash
   export VIBEC_API_KEY=your_api_key_here
   ```

### Usage

Run vibec with:
```bash
npx vibec --stacks=core,tests --test-cmd="npm test" --retries=2 --plugin-timeout=5000 --output=output
```

Supported CLI options:
- `--stacks=<stack1,stack2,...>`: Stacks to process (e.g., `core,tests`). Default: `core`.
- `--no-overwrite`: Prevent file overwrites. Flag, default: false.
- `--dry-run`: Simulate without changes. Flag, default: false.
- `--api-url=<url>`: LLM API URL. Default: `https://api.anthropic.com/v1`.
- `--api-model=<model>`: LLM model. Default: `claude-3-7-sonnet`.
- `--test-cmd=<command>`: Test command (e.g., `npm test`). Default: none.
- `--retries=<number>`: Retry count, non-negative integer. Default: 0.
- `--plugin-timeout=<ms>`: JS plugin timeout in ms, positive integer. Default: 5000.
- `--output=<dir>`: Output directory. Default: `output`.
- `--help`: Show usage and exit. Example output:
  ```
  Usage: vibec [options]
  Options:
    --stacks=<stack1,stack2,...>  Stacks to process (default: core)
    --no-overwrite                Prevent file overwrites
    --dry-run                     Simulate without changes
    --api-url=<url>               LLM API URL
    --api-model=<model>           LLM model
    --test-cmd=<command>          Test command
    --retries=<number>            Retry count
    --plugin-timeout=<ms>         JS plugin timeout
    --output=<dir>                Output directory
    --help                        Show this help
    --version                     Show version
  ```
- `--version`: Show version (e.g., `vibec v1.0.0`) and exit.

### Configuration

Configure via `vibec.json`:
```json
{
  "stacks": ["core", "tests"],
  "testCmd": "npm test",
  "retries": 2,
  "pluginTimeout": 5000,
  "apiUrl": "https://api.openai.com/v1",
  "apiModel": "gpt-4"
}
```

Options are merged with priority: CLI > environment variables > `vibec.json` > defaults. Validation:
- `retries` must be ≥ 0.
- `pluginTimeout` must be > 0.

### Environment Variables

Override config with:
- `VIBEC_STACKS`: Comma-separated stack list (e.g., `core,tests`).
- `VIBEC_TEST_CMD`: Test command.
- `VIBEC_RETRIES`: Number of retries (e.g., `2`).
- `VIBEC_PLUGIN_TIMEOUT`: JS plugin timeout in ms (e.g., `5000`).
- `VIBEC_API_URL`: LLM API endpoint.
- `VIBEC_API_KEY`: LLM API key (preferred over config).
- `VIBEC_API_MODEL`: Model for code generation.
- `VIBEC_DEBUG`: Enable debug logging (`1` to enable).

### LLM Integration

Supports OpenAI-compatible APIs (e.g., OpenAI, OpenRouter). Set `VIBEC_API_URL` and `VIBEC_API_KEY` (use env vars for security).

## Prompt Structure

Prompts use:
```markdown
# Component Name

Description of what to generate.

## Context: file1.js, file2.js
## Output: path/to/output1.js
```

- `## Context:` - Files to include.
- `## Output:` - Where to save generated code (multiple allowed).

## Plugin System

Plugin support is added via `stacks/core/002_add_plugins.md`. After this stage:
- **Static Plugins (`.md`)**: Place in `stacks/<stack>/plugins/` (e.g., `stacks/core/plugins/coding-style.md`). Their content appends to every prompt in the stack in alphabetical order.
- **Dynamic Plugins (`.js`)**: Place in `stacks/<stack>/plugins/`. Export an async function with a configurable timeout (default 5000ms):
  ```javascript
  module.exports = async (context) => {
    return "Generated content";
  };
  ```
  Context includes:
  ```javascript
  {
    config: { /* vibec.json */ },
    stack: "core",
    promptNumber: 1,
    promptContent: "# CLI Parser\n...",
    workingDir: "/path/to/output/current",
    testCmd: "npm test",
    testResult: { errorCode: 1, stdout: "...", stderr: "..." } // Only during retries
  }
  ```
- Errors in plugins are logged with `log.error` and skipped without halting execution.

## Development

### Adding New Prompts

1. Create a new file in a stack (e.g., `stacks/core/005_feature.md`).
2. Use `NNN_name.md` naming with numerical prefix.
3. Define outputs with `## Output: path/to/file.js`.

### Self-Improvement

Each stage builds on prior improvements, evolving `vibec.js` during compilation.

### Testing

Tests are generated via `stacks/tests/`:
- `test.sh` validates `vibec.js` execution and runs `test.js`.
- `test.js` uses `tape` to verify logging, plugins, CLI, and config (no external dependencies beyond Node builtins).

## Tutorial: Building a Simple Pong Game

Here’s how to use `vibec` to create a basic web-based Pong game from scratch:

### Step 1: Set Up a New Project
Create a new directory for your game:
```bash
mkdir pong-game
cd pong-game
mkdir stacks stacks/pong output
```

### Step 2: Create a Prompt Stack
Add a stack for your game in `stacks/pong/`. Start with an initial prompt:

```markdown stacks/pong/001_create_pong.md
# Pong Game Initial Setup

Generate a simple Pong game with HTML, CSS, and JavaScript:
- HTML: Basic structure with a canvas element.
- CSS: Style the canvas with a black background and center it.
- JS: Use Canvas API to draw a paddle, a ball, and basic movement (left/right paddle with arrow keys).

## Output: output/current/index.html
## Output: output/current/styles.css
## Output: output/current/game.js
```

### Step 3: Configure vibec.json
Create a `vibec.json` to target your new stack:
```json vibec.json
{
  "stacks": ["pong"],
  "output": "output"
}
```

### Step 4: Compile the Project
Run `vibec` to generate the game files:
```bash
export VIBEC_API_KEY=your_api_key_here
npx vibec
```

This processes `stacks/pong/` and outputs files to `output/current/`.

### Step 5: Test the Output
Serve the game locally (e.g., using Python’s HTTP server):
```bash
cd output/current
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser to play the basic Pong game.

### Step 6: Enhance with More Prompts
Add another prompt to improve the game:

```markdown stacks/pong/002_add_score.md
# Add Scoring to Pong

Enhance the Pong game by adding:
- A score display for the player.
- Increment score when the ball passes the paddle (reset ball position).

## Context: output/current/index.html, output/current/game.js
## Output: output/current/game.js
```

Run `vibec` again:
```bash
npx vibec
```

### Step 7: Iterate and Debug
Check `output/stages/` for each stage’s output and `output/current/` for the latest version. Use `VIBEC_DEBUG=1` to see detailed logs if something goes wrong:
```bash
export VIBEC_DEBUG=1
npx vibec
```

That’s it! You’ve built and enhanced a Pong game using `vibec`’s prompt-driven workflow.

## Troubleshooting

### Common Issues

- **API Key Not Found**: Set `VIBEC_API_KEY`.
- **No output**: Check prompt format with `## Output:` or ensure `vibec` is installed/accessible via `npx`.
- **Command not found**: Install globally with `npm install -g vibec` or use `npx vibec`.

### Debug Mode

```bash
export VIBEC_DEBUG=1
npx vibec
```

## License

MIT
