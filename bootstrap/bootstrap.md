Generate a Node.js script with the following exact content:
- Start with shebang: #!/usr/bin/env node
- Import fs.promises, path, and child_process.spawnSync
- Include a comment block starting with /** and ending with */, summarizing:
  - Changed initial currentVibec to output/current/bin/vibec.js
  - Fixed runStage logging to use stageStr
  - Reasoning: Aligns context resolution with output/current/ and improves error reporting during staged execution
- Define getHighestStage to scan stacks/core/ and stacks/tests/ from stacks parameter defaulting to ['core', 'tests'] for highest ###_*.md number
- Define checkNewFile to check if output/stages/<stage padded to 3 digits>/<filename> exists
- Define runStage to run vibecPath with node, args --stacks=core,tests and --test-cmd=output/current/test.sh
- Define bootstrap to:
  - Copy bin/test.sh to output/current/test.sh (chmod 755) if missing
  - Copy bin/vibec.js to output/current/bin/vibec.js (chmod 644) if missing
  - Run stages 1 to highest, updating vibec.js and test.sh from output/stages/<stage>/
- Include console.log statements for progress and errors
- Wrap bootstrap in a .catch block to handle errors
Output only the script content, nothing else.
