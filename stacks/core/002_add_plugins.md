# Add Plugin Support

Add static (`.md`) plugin support to `bin/vibec.js`:
- Scan `stacks/<stack>/plugins/` for `.md` files; append content to each prompt in alphabetical order.
- Use `log.info` for loaded plugins
- Ensure syntax: quoted strings, closed braces.

## Context: bin/vibec.js
## Output: bin/vibec.js
