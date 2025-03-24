Generate a Node.js script with the following exact content:
- Start with shebang: #!/usr/bin/env node
- Import fs.promises, path, https, and child_process.execSync
- Include a comment block starting with /** and ending with */, summarizing:
  - Updated parseResponse regex to /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g
  - Updated buildPrompt to resolve context files relative to output/current/
  - Reasoning: Enables self-referential evolution by using generated files as context for processing stacked prompts
- Define parseArgs to parse CLI args (e.g., --stacks=core, --dry-run) and env vars (e.g., VIBEC_API_KEY), with defaults like apiUrl 'https://api.anthropic.com/v1'
- Define getPromptFiles to scan stacks/<stack> for ###_*.md files, sort by number
- Define buildPrompt to read a file and append context from output/current/ if specified
- Define processLlm to send prompt to LLM API, skip in dry-run, require API key
- Define parseResponse to extract files with regex /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g
- Define checkOverwrite to block overwrites if --no-overwrite is set
- Define writeFiles to save to output/stages/<stage> and output/current/
- Define runTests to execute a test command if provided
- Define main to orchestrate: parse args, process prompts, write files, run tests, exit on failure
- Include console.log statements for progress and errors
- Wrap main in a .catch block to handle errors
Output only the script content, nothing else.
