#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stacks: ['core'],
    dryRun: false,
    noOverwrite: false,
    apiKey: process.env.VIBEC_API_KEY || '',
    apiUrl: 'https://openrouter.ai/api/v1',
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
    start: null,
    end: null
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring(9).split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.substring(10);
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring(10);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring(12);
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring(11);
    } else if (arg.startsWith('--start=')) {
      options.start = parseInt(arg.substring(8), 10);
    } else if (arg.startsWith('--end=')) {
      options.end = parseInt(arg.substring(6), 10);
    }
  }

  return options;
}

async function getPromptFiles(stacks) {
  const allPrompts = [];

  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        if (file.match(/^\d{3}_.*\.md$/)) {
          const number = parseInt(file.substring(0, 3), 10);
          allPrompts.push({
            stack,
            file,
            number,
            path: path.join(stackDir, file)
          });
        }
      }
    } catch (error) {
      console.error(`Error reading stack directory ${stackDir}:`, error.message);
    }
  }

  return allPrompts.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptObj) {
  const content = await fs.readFile(promptObj.path, 'utf-8');
  
  // Extract context files
  const contextMatch = content.match(/## Context: (.*)/);
  if (!contextMatch) {
    return content;
  }
  
  const contextFiles = contextMatch[1].split(',').map(f => f.trim());
  let contextContent = '';
  
  for (const file of contextFiles) {
    try {
      const filePath = path.join('output', 'current', file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      contextContent += `\n\n### ${file}\n\`\`\`\n${fileContent}\n\`\`\``;
    } catch (error) {
      console.warn(`Warning: Could not read context file ${file}:`, error.message);
    }
  }
  
  return content + '\n\n## Current Context:' + contextContent;
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('DRY RUN MODE - Prompt to LLM would be:');
    console.log('-'.repeat(80));
    console.log(prompt);
    console.log('-'.repeat(80));
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY env var or use --api-key=');
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
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
    });

    const reqOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(`${options.apiUrl}/chat/completions`, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`API failed with status ${res.statusCode}: ${data}`));
        }
        
        try {
          const response = JSON.parse(data);
          resolve(response.choices[0].message.content);
        } catch (error) {
          reject(new Error(`Failed to parse API response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`API request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}

function parseResponse(response) {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2]
    });
  }

  return files;
}

async function checkOverwrite(files, options) {
  if (!options.noOverwrite) {
    return;
  }

  for (const file of files) {
    const filePath = path.join('output', 'current', file.path);
    try {
      await fs.access(filePath);
      throw new Error(`File ${filePath} already exists and --no-overwrite is set`);
    } catch (error) {
      // File doesn't exist, which is good
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

async function writeFiles(files, promptObj, options) {
  // Ensure directories exist
  const stageDir = path.join('output', 'stages', String(promptObj.number).padStart(3, '0'));
  const currentDir = path.join('output', 'current');
  
  await fs.mkdir(stageDir, { recursive: true });
  await fs.mkdir(currentDir, { recursive: true });
  
  for (const file of files) {
    const stageFilePath = path.join(stageDir, file.path);
    const currentFilePath = path.join(currentDir, file.path);
    
    // Create parent directories if needed
    await fs.mkdir(path.dirname(stageFilePath), { recursive: true });
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    
    // Write files
    await fs.writeFile(stageFilePath, file.content);
    await fs.writeFile(currentFilePath, file.content);
    
    console.log(`Wrote ${file.path}`);
  }
}

function runTests(options) {
  if (!options.testCmd) {
    return true;
  }

  try {
    console.log(`Running tests: ${options.testCmd}`);
    execSync(options.testCmd, { stdio: 'inherit' });
    console.log('Tests passed');
    return true;
  } catch (error) {
    console.error('Tests failed:', error.message);
    return false;
  }
}

async function main() {
  const options = await parseArgs();
  console.log(`Processing stacks: ${options.stacks.join(', ')}`);
  
  const prompts = await getPromptFiles(options.stacks);
  
  if (prompts.length === 0) {
    console.log('No prompt files found');
    return;
  }

  console.log(`Found ${prompts.length} prompt files`);
  
  const filteredPrompts = prompts.filter(prompt => {
    if (options.start !== null && prompt.number < options.start) return false;
    if (options.end !== null && prompt.number > options.end) return false;
    return true;
  });
  
  console.log(`Processing ${filteredPrompts.length} prompts (${options.start || 'start'} to ${options.end || 'end'})`);

  for (const promptObj of filteredPrompts) {
    console.log(`\nProcessing ${promptObj.stack}/${promptObj.file} (stage ${promptObj.number})`);
    
    const prompt = await buildPrompt(promptObj);
    const response = await processLlm(prompt, options);
    
    const files = parseResponse(response);
    console.log(`Extracted ${files.length} files from response`);
    
    if (files.length === 0) {
      console.error('No files found in the response!');
      process.exit(1);
    }
    
    await checkOverwrite(files, options);
    await writeFiles(files, promptObj, options);
    
    const testsPass = runTests(options);
    if (!testsPass) {
      console.error(`Tests failed at stage ${promptObj.number}, stopping`);
      process.exit(1);
    }
  }
  
  console.log('\nAll stages processed successfully');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
