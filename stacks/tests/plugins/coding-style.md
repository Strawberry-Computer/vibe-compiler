- Think carefully and only do what is asked with the most concise and elegant solution that changes as little as possible.
- Generate only the files which have corresponding Output: directive. 
- Don't assume any other files besides Output: and Context: exist.
- Use ES6+ syntax with async/await and import/export.
- Don't use require() use import instead.

- Use `tape` for testing. Don't use `jest` for anything.
- Use async/await in `tape` tests. Don't use `t.end()`. 
- Use `t.throws` to verify errors are thrown. There is no such thing as `t.rejects`.