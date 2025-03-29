Generate a Node.js script with the following content:

# Conventions:
- Start with shebang: #!/usr/bin/env node
- Import fs.promises, path, and child_process.spawnSync
- Include console.log statements for progress and errors

# Functions:

## getHighestStage
  - scan stacks/core/ and stacks/tests/ from stacks parameter defaulting to ['core', 'tests'] for highest ###_*.md number
## runStage:
  - Accepts parameters: `vibecPath`, `stage`, and `stacks` (defaulting to `'core,tests'`).
  - Print 2 new lines before each stage
  - Constructs arguments for `child_process.spawnSync`:
    - `--start <stage>`
    - `--end <stage>`
    - `--stacks <stacks>`
    - `--test-cmd "sh output/current/test.sh"`
    - `--api-url` use value from `VIBEC_API_URL` or `'https://openrouter.ai/api/v1'`
    - `--api-key` use value from `VIBEC_API_KEY`
    - `--api-model` use value from `VIBEC_API_MODEL` or `'anthropic/claude-3.7-sonnet'`

  - Executes `vibecPath` using `node` with the constructed arguments.
  - Returns the result of the execution.

# Main flow:
  - Copy bin/test.sh to output/current/test.sh (chmod 755) if missing
  - Copy bin/vibec.js to output/current/bin/vibec.js (chmod 644) if missing
  - Run stages 1 to highest using `runStage`
  - Wrap bootstrap in a .catch block to handle errors


IMPORTANT: Output only the script content, nothing else.


