# Vibe Compiler (vibec)

A self-compiling tool that transforms prompt stacks into code and tests using LLM generation.

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

Option precedence: CLI > Environment Variables > `vibec.json` > Defaults
Validation:
- `retries`: Must be non-negative (≥ 0)
- `pluginTimeout`: Must be positive (> 0)
- Malformed JSON in `vibec.json` triggers an error log and falls back to defaults

### Environment Variables

- `VIBEC_STACKS`: Comma-separated stacks (e.g., `core,tests`)
- `VIBEC_TEST_CMD`: Test command
- `VIBEC_RETRIES`: Retry count
- `VIBEC_PLUGIN_TIMEOUT`: Plugin timeout (ms)
- `VIBEC_API_URL`: LLM API endpoint
- `VIBEC_API_KEY`: LLM API key (recommended over config)
- `VIBEC_API_MODEL`: LLM model
- `VIBEC_DEBUG`: Enable debug logging (`1` to enable)

### LLM Integration

Compatible with OpenAI-style APIs. Configure via `VIBEC_API_URL` and `VIBEC_API_KEY`.

## Prompt Structure

Prompts use markdown:
```markdown
# Component Name

Description of the generation task.

## Context: file1.js, file2.js
## Output: path/to/output.js
```

- `## Context:`: Reference files for context
- `## Output:`: Specify output file paths (multiple allowed)

## Plugin System

Added in stage `002_add_plugins.md`:
- **Static Plugins (`.md`)**: Stored in `stacks/<stack>/plugins/`, appended to prompts in alphabetical order
- **Dynamic Plugins (`.js`)**: Async functions in `stacks/<stack>/plugins/`, executed with configurable timeout:
  ```javascript
  module.exports = async ({ config, stack, promptNumber, promptContent, workingDir, testCmd, testResult }) => {
    return "Generated content";
  };
  ```
- Plugin errors are logged and skipped without halting execution

## Development

### Adding Prompts

1. Create a new numbered file (e.g., `stacks/core/005_new_feature.md`)
2. Use `NNN_name.md` naming convention
3. Specify outputs with `## Output:`

### Testing

Tests in `stacks/tests/` generate:
- `test.sh`: Validates `vibec.js` and runs `test.js`
- `test.js`: Uses `tape` for unit tests (Node builtins only)

## Tutorial: Building a Simple Pong Game

### 1. Initialize Project
```bash
mkdir pong-game && cd pong-game
mkdir -p stacks/pong output
```

### 2. Define Initial Prompt
```markdown stacks/pong/001_create_pong.md
# Pong Game Base

Create a basic Pong game:
- HTML: Canvas element in a centered container
- CSS: Black canvas with borders
- JS: Canvas-based paddle and ball with arrow key controls

## Output: output/current/index.html
## Output: output/current/styles.css
## Output: output/current/game.js
```

### 3. Configure
```json vibec.json
{
  "stacks": ["pong"],
  "output": "output"
}
```

### 4. Compile
```bash
export VIBEC_API_KEY=your_api_key_here
npx vibec
```

### 5. Test
```bash
cd output/current
python3 -m http.server 8000
```
Visit `http://localhost:8000`.

### 6. Enhance
```markdown stacks/pong/002_add_score.md
# Pong Scoring

Add scoring:
- Display score above canvas
- Increment when ball passes paddle, reset ball

## Context: output/current/index.html, output/current/game.js
## Output: output/current/game.js
```
Re-run `npx vibec`.

### 7. Debug
Use `VIBEC_DEBUG=1 npx vibec` for detailed logs.

## Troubleshooting

- **API Key Missing**: Set `VIBEC_API_KEY`
- **No Output**: Verify `## Output:` in prompts
- **Command Not Found**: Use `npx vibec` or install globally

## License

MIT
