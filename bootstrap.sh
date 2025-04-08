#!/bin/bash

# Exit on error and print commands as they run
set -ex

mkdir -p output/bootstrap/bin

# Stage 0: Generate initial files using llm
cat bootstrap/test.md | llm | tee output/bootstrap/test.sh
chmod +x output/bootstrap/test.sh
echo -e "Generated output/bootstrap/test.sh"

cat bootstrap/vibec.md | llm | tee output/bootstrap/bin/vibec.js
echo -e "Generated output/bootstrap/bin/vibec.js\n"

cat bootstrap/bootstrap.md | llm | tee output/bootstrap/bootstrap.js
echo -e "Generated output/bootstrap/bootstrap.js\n"

# Run the generated bootstrap.js to continue the process
node output/bootstrap/bootstrap.js

echo -e "Bootstrap complete\n"
