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

1. Clone this repository:
   ```bash
   git clone https://github.com/vgrichina/vibec.git
   cd vibec
   ```

2. Install dependencies (minimal, only if needed):
   ```bash
   npm install
   ```

3. Set up your API key for LLM integration:
   ```bash
   export VIBEC_API_KEY=your_api_key_here
   ```

4. Run the bootstrap process:
   ```bash
   npm run bootstrap
   # or directly
   node bootstrap.js
   ```

   The bootstrap process:
   - Starts with `bin/vibec.js` (must exist).
   - Processes each stage (001, 002, etc.) using the current best `vibec.js`.
   - Updates to a new implementation if generated, improving itself throughout.

### First-time Setup

For a new vibec project:
1. Ensure a base implementation exists in `bin/vibec.js`.
2. Create prompt stacks in `stacks/` with numerical prefixes (e.g., `001_feature.md`).
3. Add optional plugins in `stacks/plugins/` after plugin support is enabled.
4. Run the bootstrap process to generate the full implementation.

### Usage

Run vibec with:
```bash
node bin/vibec.js --stacks=core,tests --test-cmd="npm test" --retries=2 --plugin-timeout=5000 --output=output
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

## Troubleshooting

### Common Issues

- **API Key Not Found**: Set `VIBEC_API_KEY`.
- **bootstrap.js fails**: Ensure `bin/vibec.js` exists.
- **Permission denied**: Run `chmod +x bin/vibec.js`.
- **No output**: Check prompt format with `## Output:`.

### Debug Mode

```bash
export VIBEC_DEBUG=1
node bootstrap.js
```

## License

MIT
