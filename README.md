# Vibe Compiler (vibec)

A self-compiling tool to process vibe-coded projects using prompt stacks and LLM generation.

## Overview

`vibec` transforms stacks of prompts into code and tests, supporting static `.md` and dynamic `.js` plugins. It outputs staged artifacts (`output/stages/`) for Git history and a current runtime version (`output/current/`) aggregated from all stages with a "Last-Wins" strategy. It can compile itself using its own structure.

## Project Structure

- **`stacks/`**: Prompt stacks (e.g., `core/`, `generation/`, `tests/`).
  - Numbered prompts: `001_cli.md` (processed sequentially).
  - Multi-file output syntax:
    ```markdown
    # CLI Parser
    Generate a CLI parser for a Node.js tool.
    ## Output: core/cli.js
    ## Output: core/cli_utils.js
    ```
  - **`plugins/`**: Included in every LLM request for the stack.
    - `.md`: Static text (e.g., "Use ES6 syntax").
    - `.js`: Dynamic async plugins (e.g., `async (context) => { ... }`).
- **`output/`**: Generated files.
  - **`stages/`**: Numbered dirs (e.g., `001/core/cli.js`, `001/core/cli_utils.js`).
  - **`current/`**: Latest files (e.g., `core/cli.js`), merged with "Last-Wins" (later stages overwrite earlier ones).
- **`.vibec_hashes.json`**: Tracks prompt hashes and test results.
- **`bootstrap.js`**: Runs self-compilation.
- **`vibec.json`**: Optional config.
- **`bin/vibec-prebuilt.js`**: Prebuilt minimal `vibec`.

## Getting Started

### Installation

1. Clone this repository
2. Run `npm install` to set up the project
3. Run `npm run bootstrap` to bootstrap the compiler

### Usage

```bash
vibec --stacks core,generation,tests --test-cmd "npm test" --retries 2 --plugin-timeout 5000 --no-overwrite
```

### Configuration

You can configure vibec using a `vibec.json` file:

```json
{
  "stacks": ["core", "generation", "tests"],
  "testCmd": "npm test",
  "retries": 2,
  "pluginTimeout": 5000,
  "pluginParams": {
    "dump_files": { "files": ["src/main.js", "README.md"] }
  }
}
```

Or using environment variables:
- `VIBEC_STACKS`
- `VIBEC_TEST_CMD`
- `VIBEC_RETRIES`
- `VIBEC_PLUGIN_TIMEOUT`

## Development

### Adding New Prompts

1. Create a new prompt file in the appropriate stack (e.g., `stacks/core/003_feature.md`)
2. Follow the naming convention: `NNN_name.md` where `NNN` is a numerical prefix
3. Add output sections with `## Output: path/to/file.js` syntax

### Creating Plugins

#### Static Plugins
Create a Markdown file in `stacks/plugins/` with content that will be appended to each prompt.

#### Dynamic Plugins
Create a JavaScript file in `stacks/plugins/` that exports an async function:

```javascript
module.exports = async (context) => {
  // Generate dynamic content based on context
  return "Generated content";
};
```

## License

MIT
