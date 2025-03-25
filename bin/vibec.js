#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stacks: ['core'],
    apiUrl: 'https://openrouter.ai/api/v1',
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
    dryRun: false,
    noOverwrite: false,
    start: 0,
    end: Infinity
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring(9).split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring(10);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring(12);
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring(11);
    } else if (arg.startsWith('--start=')) {
      options.start = Number(arg.substring(8));
    } else if (arg.startsWith('--end=')) {
      options.end = Number(arg.substring(6));
    }
  }

  options.apiKey = process.env.VIBEC_API_KEY || '';

  return options;
}

async function getPromptFiles(stacks) {
  const promptFiles = [];

  for (const stack of stacks) {
    try {
      const files = await fs.readdir(path.join('stacks', stack));
      for (const file of files) {
        const match = file.match(/^(\d+)_(.*)\.md$/);
        if (match) {
          promptFiles.push({
            stack,
            file,
            number: parseInt(match[1], 10)
          });
        }
      }
    } catch (error) {
      console.error(`Error reading stack directory: ${stack}`, error.message);
    }
  }

  return promptFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptFile) {
  const filePath = path.join('stacks', promptFile.stack, promptFile.file);
  let content = await fs.readFile(filePath, 'utf8');

  // Extract context files
  const contextMatch = content.match(/## Context: (.+)/);
  if (contextMatch) {
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    let contextContent = '';

    for (const file of contextFiles) {
      try {
        const filePath = path.join('output', 'current', file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        contextContent += `\n\n### ${file}\n\`\`\`\n${fileContent}\n\`\`\``;
      } catch (error) {
        console.warn(`Warning: Could not read context file ${file}: ${error.message}`);
      }
    }

    content += contextContent;
  }

  return content;
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('DRY RUN - LLM prompt:');
    console.log(prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY environment variable.');
  }

  const payload = {
    model: options.apiModel,
    messages: [
      {
        role: 'system',
        content: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  const apiUrl = `${options.apiUrl}/chat/completions`;
  
  console.log(`Sending request to LLM API: ${apiUrl}`);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorData}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling LLM API:', error);
    throw error;
  }
}

function parseResponse(text) {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2]
    });
  }

  return files;
}

async function checkOverwrite(files, noOverwrite) {
  if (!noOverwrite) return true;

  for (const file of files) {
    try {
      const filePath = path.join('output', 'current', file.path);
      await fs.access(filePath);
      console.error(`Error: File ${file.path} already exists and --no-overwrite is set`);
      return false;
    } catch (error) {
      // File doesn't exist, we can continue
    }
  }

  return true;
}

async function writeFiles(files, stage) {
  const stageDir = path.join('output', 'stages', stage.toString());
  
  try {
    await fs.mkdir(stageDir, { recursive: true });
  } catch (error) {
    console.error(`Error creating stage directory: ${error.message}`);
  }

  for (const file of files) {
    try {
      const currentPath = path.join('output', 'current', file.path);
      const stagePath = path.join(stageDir, file.path);

      // Create directories if they don't exist
      await fs.mkdir(path.dirname(currentPath), { recursive: true });
      await fs.mkdir(path.dirname(stagePath), { recursive: true });

      // Write files
      await fs.writeFile(currentPath, file.content);
      await fs.writeFile(stagePath, file.content);
      
      console.log(`Wrote file: ${file.path}`);
    } catch (error) {
      console.error(`Error writing file ${file.path}: ${error.message}`);
    }
  }
}

function runTests(testCmd) {
  if (!testCmd) return true;

  try {
    console.log(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Tests failed:', error.message);
    return false;
  }
}

async function main() {
  const options = await parseArgs();
  console.log(`Running with options:`, options);

  const promptFiles = await getPromptFiles(options.stacks);
  console.log(`Found ${promptFiles.length} prompt files`);

  for (const promptFile of promptFiles) {
    // Skip stages outside the specified range
    if (promptFile.number < options.start || promptFile.number > options.end) {
      console.log(`Skipping stage ${promptFile.number}: ${promptFile.file} (outside range ${options.start}-${options.end})`);
      continue;
    }

    console.log(`Processing ${promptFile.stack}/${promptFile.file} (stage ${promptFile.number})`);
    const prompt = await buildPrompt(promptFile);
    const llmResponse = await processLlm(prompt, options);
    const files = parseResponse(llmResponse);
    
    console.log(`Extracted ${files.length} files from LLM response`);
    
    if (files.length === 0) {
      console.error('Error: No files found in LLM response');
      process.exit(1);
    }
    
    const canWrite = await checkOverwrite(files, options.noOverwrite);
    if (!canWrite) {
      console.error('Aborting due to --no-overwrite constraint');
      process.exit(1);
    }
    
    await writeFiles(files, promptFile.number);
    
    if (options.testCmd) {
      const testsPass = runTests(options.testCmd);
      if (!testsPass) {
        console.error('Aborting due to test failure');
        process.exit(1);
      }
    }
  }

  console.log('All prompts processed successfully');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

module.exports = {
  parseArgs,
  getPromptFiles,
  buildPrompt,
  processLlm,
  parseResponse,
  checkOverwrite,
  writeFiles,
  runTests,
  main
};
