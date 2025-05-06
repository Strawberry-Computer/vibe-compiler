# Vibe Compiler (vibec)

A self-compiling tool that transforms prompt stacks into code and tests using LLM generation.

## Overview

`vibec` is a unique compiler that processes markdown-based prompt stacks to generate code, tests, and documentation. It can compile itself through a bootstrap process, evolving its own implementation (`bin/vibec.js`) across numbered stages. The tool supports both static (`.md`) and dynamic (`.js`) plugins, maintains staged outputs in `output/stacks/` for Git history, and aggregates the latest runtime version in `output/current/` using a "Last-Wins" merge strategy.

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
│   │   ├── 005_add_iterations.md
│   │   ├── 006_add_dynamic_plugins.md
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
│       │   ├── 005_add_iterations/
│       │   │   └── bin/
│       │   │       └── vibec.js
│       │   ├── 006_add_dynamic_plugins/
│       │   │   └── bin/
│       │   │       └── vibec.js
│       └── tests/     # Test stack stages
│           ├── 001_basic_tests/
│           │   ├── test.js
│           │   └── test.sh
│           ├── 002_feature_tests/
│           │   └── test.js
│           ├── 003_cli_tests/
│           │   └── test.js
│           └── 004_config_tests/
│               └── test.js
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
npx vibec --stacks=core,tests --test-cmd="npm test" --retries=2 --iterations=3 --output=output
```

CLI options:
- `--workdir=<dir>`: Working directory (default: `.`)
- `--stacks=<stack1,stack2,...>`: Stacks to process (default: `core`)
- `--dry-run`: Simulate without modifications (default: `false`)
- `--start=<number>`: Start with specific stage number (default: none)
- `--end=<number>`: End with specific stage number (default: none)
- `--api-url=<url>`: LLM API endpoint (default: `https://openrouter.ai/api/v1`)
- `--api-model=<model>`: LLM model (default: `anthropic/claude-3.7-sonnet`)
- `--test-cmd=<command>`: Test command to run (default: none)
- `--retries=<number>`: Retry attempts for API calls (≥ 0, default: `0`)
- `--iterations=<number>`: Number of times to retry a stage on test failure (> 0, default: `2`)
- `--plugin-timeout=<ms>`: Timeout for JS plugins in milliseconds (default: `5000`)
- `--output=<dir>`: Output directory (default: `output`)
- `--help`: Display usage information
- `--version`: Show version (e.g., `vibec v1.0.0`)

### Configuration

Configure via `vibec.json`:
```json
{
  "workdir": ".",
  "stacks": ["core", "tests"],
  "dryRun": false,
  "start": null,
  "end": null,
  "testCmd": "npm test",
  "retries": 2,
  "iterations": 3,
  "pluginTimeout": 5000,
  "apiUrl": "https://openrouter.ai/api/v1",
  "apiModel": "anthropic/claude-3.7-sonnet",
  "output": "output"
}
```

Option precedence: CLI > Environment Variables > `vibec.json` > Defaults

Validation:
- `retries`: Must be non-negative (≥ 0)
- `iterations`: Must be positive (> 0)
- `pluginTimeout`: Must be positive (> 0)
- Malformed JSON in `vibec.json` triggers an error log and falls back to defaults

### Environment Variables

- `VIBEC_WORKDIR`: Working directory path.
- `VIBEC_STACKS`: Comma-separated stacks (e.g., `core,tests`)
- `VIBEC_DRY_RUN`: `true`/`false`.
- `VIBEC_START`: Numeric stage value.
- `VIBEC_END`: Numeric stage value.
- `VIBEC_OUTPUT`: Output directory.
- `VIBEC_TEST_CMD`: Test command
- `VIBEC_RETRIES`: Retry count for API calls
- `VIBEC_ITERATIONS`: Number of times to retry a stage on test failure
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

### Static Plugins (`.md`)
- Stored in `stacks/<stack>/plugins/`
- Appended to prompts in alphabetical order
- Used for adding reusable context or constraints to prompts

### Dynamic Plugins (`.js`)
- JavaScript modules in `stacks/<stack>/plugins/`
- Executed as async functions in alphabetical order with configurable timeout
- Receive a context object with access to:
  ```javascript
  {
    config,        // vibec.json contents
    stack,         // Current stack name
    promptNumber,  // Current prompt number
    promptContent, // Content of the current prompt
    workingDir,    // Path to output/current
    testCmd,       // Test command
    testResult     // Test execution result
  }
  ```
- Plugin errors are logged and skipped without halting execution

## Iteration System

The iteration system allows automatic refinement of generated code:

1. When a test fails, the test output is captured
2. The prompt is re-run with test output included
3. Process repeats up to `iterations` times (default: 2)
4. If all iterations fail, the process exits with an error

This enables self-healing code generation that can fix test failures automatically.

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
mkdir -p stacks/core/plugins output
```

### 2. Set Up Coding Style Plugin
Create a coding style plugin that forces the LLM to mark its reasoning in the generated code. This clever trick helps us trace which parts of the prompt produced specific code:

```markdown stacks/core/plugins/coding-style.md
- Make it clear why any given code is written by adding a comment with relevant prompt snippet, like:
    ```
    // PROMPT: <relevant prompt snippet>
    ```
- Don't use any other comments.
```

### 3. Define Initial Prompt
```markdown stacks/core/001_create_pong.md
# Pong Game Initial Setup

Generate a simple Pong game using HTML, CSS, and JavaScript:

- Use `<canvas width="800" height="400" id="pongCanvas">` 
- Draw a white paddle (10px wide, 100px high) at the left side of the canvas, movable up/down with arrow keys.
- Draw a white ball (10px radius) starting at canvas center, moving diagonally with constant speed.
- Bounce the ball off the top and side walls; reset to center if it hits the bottom (misses paddle).
- Detect paddle collision to bounce the ball back up.
- Use requestAnimationFrame for smooth animation.

## Output: index.html
## Output: styles.css
## Output: game.js
```

### 4. Configure
```json vibec.json
{
  "stacks": ["core"],
  "output": "output"
}
```

### 5. Compile
```bash
export VIBEC_API_KEY=your_api_key_here
npx vibec
```

### 6. Test
```bash
cd output/current
python3 -m http.server 8000
```
Visit `http://localhost:8000`.

### 7. Add Scoring
```markdown stacks/core/002_add_score.md
# Add Scoring to Pong

Enhance the Pong game by adding score display

## Context: index.html, game.js
## Output: index.html
## Output: game.js
```
Run `npx vibec` again to update the game.

### 8. Add AI Player
```markdown stacks/core/003_ai_player.md
# Add AI Player to Pong

Add the computer player which moves the paddle automatically.
Make sure that at this point there are 2 paddles: one for the user and one for the computer.

## Context: index.html, game.js
## Output: game.js
```
Run `npx vibec` one more time to complete the game with an AI opponent.

### 7. Debug
Use `VIBEC_DEBUG=1 npx vibec` for detailed logs.

## Troubleshooting

- **API Key Missing**: Set `VIBEC_API_KEY`
- **No Output**: Verify `## Output:` in prompts
- **Command Not Found**: Use `npx vibec` or install globally
- **Test Failures**: Check test output for details
- **Plugin Timeout**: Increase `--plugin-timeout` if needed

## License

MIT
