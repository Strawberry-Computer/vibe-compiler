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
    apiUrl: 'https://openrouter.ai/api/v1',
    apiModel: 'anthropic/claude-3.7-sonnet',
    apiKey: process.env.VIBEC_API_KEY || '',
    testCmd: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring('--stacks='.length).split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring('--api-url='.length);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring('--api-model='.length);
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring('--test-cmd='.length);
    }
  }

  if (process.env.VIBEC_API_URL) options.apiUrl = process.env.VIBEC_API_URL;
  if (process.env.VIBEC_API_MODEL) options.apiModel = process.env.VIBEC_API_MODEL;
  if (process.env.VIBEC_TEST_CMD) options.testCmd = process.env.VIBEC_TEST_CMD;

  return options;
}

async function getPromptFiles(stacks) {
  let promptFiles = [];

  for (const stack of stacks) {
    const stackPath = path.join('stacks', stack);
    try {
      const files = await fs.readdir(stackPath);
      for (const file of files) {
        if (/^\d{3}_.+\.md$/.test(file)) {
          const number = parseInt(file.substring(0, 3), 10);
          promptFiles.push({
            stack,
            file,
            number,
            path: path.join(stackPath, file)
          });
        }
      }
    } catch (err) {
      console.error(`Error reading stack directory ${stackPath}:`, err);
    }
  }

  return promptFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptFile) {
  const content = await fs.readFile(promptFile.path, 'utf8');
  
  // Find context files if they are specified
  const contextMatch = content.match(/## Context: (.+)$/m);
  let contextContent = '';
  
  if (contextMatch) {
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    for (const contextFile of contextFiles) {
      try {
        const contextPath = path.join('output', 'current', contextFile);
        const fileContent = await fs.readFile(contextPath, 'utf8');
        contextContent += `\n\n## File: ${contextFile}\n\`\`\`\n${fileContent}\n\`\`\``;
      } catch (err) {
        console.warn(`Warning: Could not read context file ${contextFile}:`, err.message);
      }
    }
  }
  
  return content + contextContent;
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('Dry run: skipping LLM API call');
    return 'File: example.txt\n```\ndry run content\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY environment variable.');
  }

  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({
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

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
        'HTTP-Referer': 'https://github.com/vibecentralmc/vibecli'
      }
    };

    const req = https.request(`${options.apiUrl}/chat/completions`, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData.choices[0].message.content);
          } catch (err) {
            reject(new Error(`Failed to parse API response: ${err.message}`));
          }
        } else {
          reject(new Error(`API request failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`API request error: ${err.message}`));
    });

    req.write(requestData);
    req.end();
  });
}

function parseResponse(response) {
  const fileRegex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  const files = [];
  
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    files.push({
      path: match[1],
      content: match[2]
    });
  }
  
  return files;
}

async function checkOverwrite(files, options) {
  if (!options.noOverwrite) return true;
  
  for (const file of files) {
    const fullPath = path.join('output', 'current', file.path);
    try {
      await fs.access(fullPath);
      console.error(`Error: File ${file.path} already exists and --no-overwrite is set`);
      return false;
    } catch (err) {
      // File doesn't exist, can write
    }
  }
  
  return true;
}

async function writeFiles(files, promptNumber, options) {
  // Ensure output directories exist
  const stagePath = path.join('output', 'stages', String(promptNumber).padStart(3, '0'));
  const currentPath = path.join('output', 'current');
  
  await fs.mkdir(stagePath, { recursive: true });
  await fs.mkdir(currentPath, { recursive: true });
  
  // Write each file to both locations
  for (const file of files) {
    const stageFilePath = path.join(stagePath, file.path);
    const currentFilePath = path.join(currentPath, file.path);
    
    // Create parent directories
    await fs.mkdir(path.dirname(stageFilePath), { recursive: true });
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    
    // Write the files
    await fs.writeFile(stageFilePath, file.content);
    await fs.writeFile(currentFilePath, file.content);
    
    console.log(`Wrote file: ${file.path}`);
  }
}

function runTests(testCmd) {
  if (!testCmd) return true;
  
  console.log(`Running tests: ${testCmd}`);
  try {
    execSync(testCmd, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Tests failed:', err.message);
    return false;
  }
}

async function main() {
  const options = await parseArgs();
  console.log(`Processing stacks: ${options.stacks.join(', ')}`);
  
  const promptFiles = await getPromptFiles(options.stacks);
  
  for (const promptFile of promptFiles) {
    console.log(`Processing prompt: ${promptFile.path}`);
    
    const prompt = await buildPrompt(promptFile);
    const response = await processLlm(prompt, options);
    const files = parseResponse(response);
    
    if (files.length === 0) {
      console.warn('Warning: No files found in LLM response');
      continue;
    }
    
    console.log(`Found ${files.length} files in response`);
    
    if (await checkOverwrite(files, options)) {
      await writeFiles(files, promptFile.number, options);
      
      if (!runTests(options.testCmd)) {
        console.error('Exiting due to test failure');
        process.exit(1);
      }
    } else {
      console.error('Exiting due to file overwrite protection');
      process.exit(1);
    }
  }
  
  console.log('All prompts processed successfully');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
