 # Add Support for Iterations

Add support for iterations to vibec.js, allowing users to specify the number of times a stage should be executed to try to resolve test failures.

## Config Options

- `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`.

## Implementation Details

- Capture stdout and stderr from the test command execution.
- Re-run the stage with currently generated files and the captured stdout and stderr in case of failure.

## Context: bin/vibec.js
## Output: bin/vibec.js