- Pay extra attention to JavaScript syntax: ensure all strings are properly quoted, objects are fully closed, and no truncation occurs.
    - for example this is wrong: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt's ## Output: sections. Do not skip any requested outputs.'
    - what is important is that every quote character in strings is escaped
    - for example: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'

- Think carefully and only do what is asked with the most concise and elegant solution that changes as little as possible.
- Generate only the files which have corresponding Output: directive. 
- Don't assume any other files besides Output: and Context: exist.
- Use ES6+ syntax with async/await and import/export.
- Avoid dependencies on external libraries like `openai`: just use `fetch` to make HTTP requests.

