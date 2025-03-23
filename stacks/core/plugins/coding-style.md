- Pay extra attention to JavaScript syntax: ensure all strings are properly quoted, objects are fully closed, and no truncation occurs.
    - for example this is wrong: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt's ## Output: sections. Do not skip any requested outputs.'
    - what is important is that every quote character in strings is escaped
    - for example: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'


