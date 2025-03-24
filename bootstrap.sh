#!/bin/bash

# Exit on error and print commands as they run
set -ex

# Stage 0: Generate initial files using llm
cat bootstrap/test.md | llm > bin/test.sh
chmod +x bin/test.sh
echo -e "Generated bin/test.sh\n"

cat bootstrap/vibec.md | llm > bin/vibec.js
echo -e "Generated bin/vibec.js\n"

cat bootstrap/bootstrap.md | llm > bootstrap.js
echo -e "Generated bootstrap.js\n"

# Run the generated bootstrap.js to continue the process
node bootstrap.js

echo -e "Bootstrap complete\n"
