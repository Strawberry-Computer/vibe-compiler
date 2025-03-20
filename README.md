# Vibe Compiler (vibec)

A self-compiling tool to process vibe-coded projects using prompt stacks and LLM generation.

## Overview

`vibec` transforms stacks of prompts into code and tests, supporting static `.md` and dynamic `.js` plugins. It outputs staged artifacts (`output/stages/`) for Git history and a current runtime version (`output/current/`) aggregated from all stages with a "Last-Wins" strategy. It can compile itself using its own structure.

## Project Structure

```
vibec/
├── bin/
│   └── vibec.js            # Single, complete implementation
├── bootstrap.js            # Progressive bootstrapping script
├── stacks/
│   ├── core/               # Core functionality prompts
│   │   ├── 001_cli.md
│   │   └── ...
│   ├── generation/         # Code generation prompts
│   ├── tests/              # Test generation prompts 
│   └── plugins/            # Plugins for all stacks
│       ├── coding_guidelines.md  # Static plugin
│       └── dump_files.js         # Dynamic plugin
├── output/
│   ├── stages/             # Isolated stage outputs
│   │   ├── 001/
│   │   ├── 002/
│   │   └── ...
│   └── current/            # Latest merged output
├── .vibec_hashes.json      # Tracks prompt hashes and test results
├── vibec.json              # Configuration
└── package.json
```

## Architecture

Vibec uses a progressive bootstrapping approach:

1. The bootstrap process starts with the base implementation (`bin/vibec.js`)
2. Each numerical stage (001, 002, etc.) is processed in order
3. After each stage, we check if a new vibec implementation was generated
4. If a new implementation is available, it's used for subsequent stages
5. This creates a self-improving cycle where vibec evolves during the build process

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
  "apiUrl": "https://api.openai.com/v1",
  "apiModel": "gpt-4",
  "pluginParams": {
    "dump_files": { "files": ["src/main.js", "README.md"] }
  }
}
```

### Environment Variables

All configuration options can be set via environment variables:

- `VIBEC_STACKS` - Comma-separated stack list
- `VIBEC_TEST_CMD` - Test command
- `VIBEC_RETRIES` - Number of retries for failed tests
- `VIBEC_PLUGIN_TIMEOUT` - Timeout for JS plugins in milliseconds
- `VIBEC_API_URL` - LLM API endpoint URL
- `VIBEC_API_KEY` - API key for LLM service (preferred over config file for security)
- `VIBEC_API_MODEL` - Model to use for code generation

### LLM Integration

Vibec supports any OpenAI-compatible API, including:
- OpenAI
- OpenRouter
- Claude API
- Other compatible providers

Configure the API endpoint using `apiUrl` in `vibec.json` or the `VIBEC_API_URL` environment variable. Provide your API key using the `VIBEC_API_KEY` environment variable (never store API keys in configuration files for security reasons).

## Prompt Structure

Prompts follow this format:

```markdown
# Component Name

Description of what should be generated.

## Context: file1.js, file2.js
## Output: path/to/output1.js
## Output: path/to/output2.js
```

- `## Context:` specifies files to include as context
- `## Output:` defines where generated code should be saved (can have multiple)

## Plugin System

### Static Plugins (.md)
Create a Markdown file in `stacks/plugins/` with content that will be appended to each prompt.

### Dynamic Plugins (.js)
Create a JavaScript file in `stacks/plugins/` that exports an async function:

```javascript
module.exports = async (context) => {
  // Generate dynamic content based on context
  return "Generated content";
};
```

The plugin context includes:
```javascript
{
  config: { /* vibec.json config */ },
  stack: "core",
  promptNumber: 1,
  promptContent: "# CLI Parser\n...",
  workingDir: "/path/to/output/current",
  testCmd: "npm test",
  testResult: { errorCode: 1, stdout: "...", stderr: "..." } // Available during retries
}
```

## Development

### Adding New Prompts

1. Create a new prompt file in the appropriate stack (e.g., `stacks/core/003_feature.md`)
2. Follow the naming convention: `NNN_name.md` where `NNN` is a numerical prefix
3. Add output sections with `## Output: path/to/file.js` syntax

### Self-Improvement

The progressive bootstrapping approach allows vibec to improve itself:

1. Stage 001 uses the base implementation to generate initial components
2. If stage 001 produces a new vibec, stage 002 uses that improved version
3. Each stage can build on improvements from previous stages

This creates a genuine self-improving system where the compiler evolves during the build process.

## License

MIT
