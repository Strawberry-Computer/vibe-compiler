Generate a Bash test script with the following exact content:
- Start with a shebang: #!/bin/bash
- Echo the string "Tests passed" to stdout
- Exit with code 0
- Include a multi-line comment block starting with /** and ending with */, containing:
  - A "Summary of Changes and Reasoning" section
  - State there are no functional changes; it’s a minimal test script
  - Note the shebang and exit 0 are explicit for portability
  - Reasoning section explaining it’s a lightweight test to verify the Vibe Compiler’s dry-run mode by executing 'node output/current/bin/vibec.js --dry-run', ensuring the script can run without errors
Output only the script content, nothing else.
