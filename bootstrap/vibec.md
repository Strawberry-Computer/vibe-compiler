Generate a Node.js script with the following exact content:
- Start with shebang: #!/usr/bin/env node
- Import fs.promises, path, https, and child_process.execSync
- Define parseArgs to parse CLI args (e.g., --stacks=core, --dry-run) and env vars (e.g., VIBEC_API_KEY), with defaults like stacks: ['core'], apiUrl 'https://openrouter.ai/api/v1', apiModel 'anthropic/claude-3.7-sonnet', testCmd null
- Take --start and --end args to specify a range of stages to process
- Define getPromptFiles to scan stacks/<stack> for ###_*.md files from an array of stacks, return objects with stack, file, and number sorted by number
- Define buildPrompt to read a file and append context from output/current/ using ## Context: file1, file2 syntax
- Define processLlm to send prompt to LLM API at /chat/completions with system message 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt’s ## Output: sections. Do not skip any requested outputs.', skip in dry-run, require API key
- Define parseResponse to extract files with regex /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g
- Define checkOverwrite to block overwrites if --no-overwrite is set
- Define writeFiles to save to output/stages/<stage> and output/current/ using numeric stage
- Define runTests to execute a testCmd if provided
- Define main to orchestrate: parse args, process prompts from all stacks, write files using prompt.number, run tests, exit on failure
- Include console.log statements for progress and errors
- Wrap main in a .catch block to handle errors
Output only the script content, nothing else.