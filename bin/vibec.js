#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    stacks: ['core'],
    'dry-run': false,
    start: null,
    end: null,
    'no-overwrite': false,
    'api-url': 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.7-sonnet',
    'test-cmd': null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const option = arg.slice(2);
      if (option.includes('=')) {
        const [key, value] = option.split('=');
        if (key === 'stacks') {
          options[key] = value.split(',');
        } else if (key === 'start' || key === 'end') {
          options[key] = parseInt(value, 10);
        } else if (key === 'dry-run' || key === 'no-overwrite') {
          options[key] = value === 'true';
        } else {
          options[key] = value;
        }
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        const value = args[i + 1];
        const key = option;
        if (key === 'stacks') {
          options[key] = value.split(',');
        } else if (key === 'start' || key === 'end') {
          options[key] = parseInt(value, 10);
        } else if (key === 'dry-run' || key === 'no-overwrite') {
          options[key] = value === 'true';
        } else {
          options[key] = value;
        }
        i++;
      } else {
        options[option] = true;
      }
    }
  }

  return options;
}

async function getPromptFiles(stacks) {
  const result = [];
  
  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
    let files;
    
    try {
      files = await fs.readdir(stackDir);
    } catch (err) {
      console.error(`Error reading stack directory ${stackDir}:`, err);
      continue;
    }
    
    for (const file of files) {
      const match = file.match(/^(\d+)_.*\.md$/);
      if (match) {
        result.push({
          stack,
          file,
          number: parseInt(match[1], 10)
        });
      }
    }
  }
  
  return result.sort((a, b) => a.number - b.number);
}

async function buildPrompt(stackFile) {
  const filePath = path.join('stacks', stackFile.stack, stackFile.file);
  let content;
  
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    throw err;
  }
  
  // Extract context files from the prompt
  const contextMatch = content.match(/## Context: (.*?)$/m);
  if (contextMatch) {
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    let contextContent = '';
    
    for (const contextFile of contextFiles) {
      try {
        const contextFilePath = path.join('output', 'current', contextFile);
        const fileContent = await fs.readFile(contextFilePath, 'utf8');
        contextContent += `## File: ${contextFile}\n${fileContent}\n\n`;
      } catch (err) {
        console.warn(`Warning: Could not read context file ${contextFile}:`, err);
      }
    }
    
    // Replace the Context line with the actual content
    content = content.replace(/## Context: .*$/m, `## Context:\n${contextContent}`);
  }
  
  return content;
}

async function processLlm(prompt, options) {
  if (options['dry-run']) {
    console.log('Dry run mode, prompt:');
    console.log('-'.repeat(80));
    console.log(prompt);
    console.log('-'.repeat(80));
    return 'File: example/file\n```lang\ncontent\n```';
  }
  
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }
  
  const requestData = {
    model: options.model,
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
  
  const response = await fetch(`${options['api-url']}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://prompting.com',
      'X-Title': 'Prompt Processor'
    },
    body: JSON.stringify(requestData)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

function parseResponse(response) {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;
  
  while ((match = regex.exec(response)) !== null) {
    files.push({
      path: match[1],
      content: match[2]
    });
  }
  
  return files;
}

async function checkOverwrite(files, noOverwrite) {
  if (!noOverwrite) return true;
  
  const currentDir = path.join('output', 'current');
  let canProceed = true;
  
  for (const file of files) {
    const filePath = path.join(currentDir, file.path);
    try {
      await fs.access(filePath);
      console.warn(`File ${filePath} already exists and --no-overwrite is set`);
      canProceed = false;
    } catch (err) {
      // File doesn't exist, which is fine
    }
  }
  
  return canProceed;
}

async function writeFiles(files, stage) {
  const stageDir = path.join('output', 'stages', stage.toString());
  const currentDir = path.join('output', 'current');
  
  // Create directories
  await fs.mkdir(stageDir, { recursive: true });
  await fs.mkdir(currentDir, { recursive: true });
  
  for (const file of files) {
    const stageFilePath = path.join(stageDir, file.path);
    const currentFilePath = path.join(currentDir, file.path);
    
    // Create parent directories
    await fs.mkdir(path.dirname(stageFilePath), { recursive: true });
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    
    // Write files
    await fs.writeFile(stageFilePath, file.content);
    await fs.writeFile(currentFilePath, file.content);
    
    console.log(`Written: ${file.path}`);
  }
}

function runTests(testCmd) {
  if (!testCmd) return true;
  
  try {
    console.log(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Tests failed:', err);
    return false;
  }
}

async function main() {
  const options = parseArgs(process.argv);
  console.log('Options:', options);
  
  // Get all prompt files from specified stacks
  const promptFiles = await getPromptFiles(options.stacks);
  console.log(`Found ${promptFiles.length} prompt files`);
  
  // Filter by start and end if provided
  const filteredFiles = promptFiles.filter(file => {
    if (options.start !== null && file.number < options.start) return false;
    if (options.end !== null && file.number > options.end) return false;
    return true;
  });
  
  console.log(`Processing ${filteredFiles.length} files within range`);
  
  for (const promptFile of filteredFiles) {
    console.log(`Processing ${promptFile.stack}/${promptFile.file} (stage ${promptFile.number})`);
    
    // Build the prompt with context
    const prompt = await buildPrompt(promptFile);
    
    // Process with LLM
    const response = await processLlm(prompt, options);
    
    // Parse the response
    const files = parseResponse(response);
    console.log(`Extracted ${files.length} files from response`);
    
    // Check for overwrites if --no-overwrite is set
    const canProceed = await checkOverwrite(files, options['no-overwrite']);
    if (!canProceed) {
      console.error('Stopping due to potential overwrites');
      process.exit(1);
    }
    
    // Write files to output/stages/<stage> and output/current/
    await writeFiles(files, promptFile.number);
    
    // Run tests if provided
    if (options['test-cmd']) {
      const testsPassed = runTests(options['test-cmd']);
      if (!testsPassed) {
        console.error('Tests failed, stopping');
        process.exit(1);
      }
    }
  }
  
  console.log('All files processed successfully');
}

main().catch(err => {
  console.error('Error:', err);
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
