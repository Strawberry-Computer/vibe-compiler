# Vibe Compiler (vibec)

A self-compiling tool that transforms prompt stacks into code and tests using LLM generation.

## Overview

`vibec` is a unique compiler that processes markdown-based prompt stacks to generate code, tests, and documentation. It can compile itself through a bootstrap process, evolving its own implementation (`bin/vibec.js`) across numbered stages. The tool supports both static (`.md`) and dynamic (`.js`) plugins, maintains staged outputs in `output/stages/` for Git history, and aggregates the latest runtime version in `output/current/` using a "Last-Wins" merge strategy.

## Project Structure

```
vibec/
├── bin/                    # Initial implementation
│   ├── vibec.js           # Core compiler script
│   └── test.sh            # Test runner
├── bootstrap/             # Bootstrap documentation
├── stacks/                # Prompt stacks
│   ├── core/             # Core functionality
│   │   ├── 001_add_logging.md
│   │   ├── 002_add_plugins.md
│   │   ├── 003_add_cli.md
│   │   ├── 004_add_config.md
│   │   └── plugins/      # Core plugins
│   └── tests/            # Test generation
├── output/               # Generated artifacts
│   ├── bootstrap/       # Bootstrap outputs
│   │   ├── bin/        # Bootstrap compiler
│   │   │   └── vibec.js
│   │   ├── bootstrap.js # Bootstrap script
│   │   └── test.sh     # Bootstrap test script
│   ├── current/        # Latest merged runtime version
│   │   ├── bin/       # Current compiler
│   │   │   └── vibec.js
│   │   ├── bootstrap.js # Current bootstrap script
│   │   ├── test.js     # Current test suite
│   │   └── test.sh     # Current test script
│   └── stacks/         # Staged stack outputs
│       ├── core/      # Core stack stages
│       │   ├── 001_add_logging/
│       │   │   └── bin/
│       │   │       └── vibec.js
│       │   ├── 002_add_plugins/
│       │   │   └── bin/
│       │   │       └── vibec.js
│       │   ├── 003_add_cli/
│       │   │   └── bin/
│       │   │       └── vibec.js
│       │   ├── 004_add_config/
│       │   │   └── bin/
│       │   │       └── vibec.js
│       └── tests/     # Test stack stages
│           ├── 001_basic_tests/
│           │   ├── test.js
│           │   └── test.sh
│           ├── 003_cli_tests/
│           │   └── test.js
│           └── 004_config_tests/
│               └── test.js
├── .vibec_hashes.json    # Prompt hashes and test results
├── vibec.json            # Configuration file
└── package.json          # Node dependencies
```

## Architecture

`vibec` employs a progressive bootstrapping process:
1. Begins with the initial `bin/vibec.js` implementation
2. Processes numbered stages sequentially (001, 002, etc.)
3. Updates `vibec.js` when generated in a stage, using the new version for subsequent stages
4. Creates a self-improving cycle where the compiler evolves during compilation

## Getting Started

### Installation

Install globally:
```bash
npm install -g vibec
```
Or use via npx:
```bash
npx vibec --version
```

Set your LLM API key:
```bash
export VIBEC_API_KEY=your_api_key_here
```

### Usage

Run with custom options:
```bash
npx vibec --stacks=core,tests --test-cmd="npm test" --retries=2 --plugin-timeout=5000 --output=output
```

CLI options:
- `--stacks=<stack1,stack2,...>`: Stacks to process (default: `core`)
- `--dry-run`: Simulate without modifications (default: `false`)
- `--api-url=<url>`: LLM API endpoint (default: `https://api.anthropic.com/v1`)
- `--api-model=<model>`: LLM model (default: `claude-3-7-sonnet`)
- `--test-cmd=<command>`: Test command to run (default: none)
- `--retries=<number>`: Retry attempts (≥ 0, default: `0`)
- `--plugin-timeout=<ms>`: JS plugin timeout in ms (> 0, default: `5000`)
- `--output=<dir>`: Output directory (default: `output`)
- `--help`: Display usage information
- `--version`: Show version (e.g., `vibec v1.0.0`)

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

## Output: index.html
## Output: styles.css
## Output: game.js
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

## Context: index.html, game.js
## Output: game.js
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
