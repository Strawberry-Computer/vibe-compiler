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
      options.stacks = arg.split('=')[1].split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.split('=')[1];
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.split('=')[1];
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.split('=')[1];
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.split('=')[1];
    } else if (arg.startsWith('--start=')) {
      options.start = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--end=')) {
      options.end = Number(arg.split('=')[1]);
    }
  }

  return options;
}

async function getPromptFiles(stacks) {
  let allFiles = [];
  
  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      const promptFiles = files
        .filter(file => /^\d{3}_.*\.md$/.test(file))
        .map(file => {
          const number = parseInt(file.split('_')[0], 10);
          return {
            stack,
            file,
            number,
            path: path.join(stackDir, file)
          };
        });
      
      allFiles = [...allFiles, ...promptFiles];
    } catch (err) {
      console.error(`Error reading stack directory ${stackDir}:`, err);
    }
  }
  
  return allFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptFile) {
  const promptContent = await fs.readFile(promptFile.path, 'utf8');
  
  const contextMatch = promptContent.match(/## Context: (.*)/);
  if (!contextMatch) return promptContent;

  const contextFiles = contextMatch[1].split(',').map(file => file.trim());
  let contextContent = '';

  for (const file of contextFiles) {
    try {
      const content = await fs.readFile(path.join('output', 'current', file), 'utf8');
      contextContent += `\n\nFile: ${file}\n\`\`\`\n${content}\n\`\`\``;
    } catch (err) {
      console.warning(`Could not find context file ${file}`);
    }
  }
  
  return `${promptContent}\n\n${contextContent}`;
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('DRY RUN - Prompt:');
    console.log(prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY or use --api-key=');
  }

  return new Promise((resolve, reject) => {
    const requestData = {
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

    const requestBody = JSON.stringify(requestData);
    const url = `${options.apiUrl}/chat/completions`;

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
          'HTTP-Referer': 'https://vibec.dev'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              resolve(response.choices[0].message.content);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err.message}`));
            }
          } else {
            reject(new Error(`API request failed with status code ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

function parseResponse(response) {
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  const files = [];
  let match;

  while ((match = regex.exec(response)) !== null) {
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
      await fs.access(path.join('output', 'current', file.path));
      console.error(`File ${file.path} already exists and --no-overwrite is set`);
      return false;
    } catch (err) {
      // File doesn't exist, so it's safe to write
    }
  }
  
  return true;
}

async function writeFiles(files, stage) {
  const stageDir = path.join('output', 'stages', String(stage).padStart(3, '0'));
  await fs.mkdir(stageDir, { recursive: true });
  
  for (const file of files) {
    const filePath = path.join(stageDir, file.path);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.content);
    
    const currentFilePath = path.join('output', 'current', file.path);
    const currentFileDir = path.dirname(currentFilePath);
    await fs.mkdir(currentFileDir, { recursive: true });
    await fs.writeFile(currentFilePath, file.content);
    
    console.log(`Wrote ${file.path}`);
  }
}

function runTests(testCmd) {
  if (!testCmd) return true;
  
  try {
    console.log(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Tests failed');
    return false;
  }
}

async function main() {
  const options = await parseArgs();
  const promptFiles = await getPromptFiles(options.stacks);
  
  for (const promptFile of promptFiles) {
    if (options.start !== null && promptFile.number < options.start) {
      console.log(`Skipping stage ${promptFile.number} (before start=${options.start})`);
      continue;
    }
    if (options.end !== null && promptFile.number > options.end) {
      console.log(`Skipping stage ${promptFile.number} (after end=${options.end})`);
      continue;
    }
    
    console.log(`Processing ${promptFile.stack}/${promptFile.file} (${promptFile.number})`);
  
    const prompt = await buildPrompt(promptFile);
    const response = await processLlm(prompt, options);
    const files = parseResponse(response);
    
    if (files.length === 0) {
      console.error('No files found in response');
      process.exit(1);
    }
    
    if (!(await checkOverwrite(files, options.noOverwrite))) {
      process.exit(1);
    }
    
    await writeFiles(files, promptFile.number);
    
    if (!runTests(options.testCmd)) {
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
