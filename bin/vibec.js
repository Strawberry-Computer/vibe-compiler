#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stacks: ['core'],
    dryRun: false,
    apiKey: process.env.VIBEC_API_KEY || '',
    apiUrl: 'https://openrouter.ai/api/v1',
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
    noOverwrite: false,
    start: null,
    end: null
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.slice('--stacks='.length).split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.slice('--api-key='.length);
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.slice('--api-url='.length);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.slice('--api-model='.length);
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.slice('--test-cmd='.length);
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--start=')) {
      options.start = parseInt(arg.slice('--start='.length), 10);
    } else if (arg.startsWith('--end=')) {
      options.end = parseInt(arg.slice('--end='.length), 10);
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
        if (/^\d{3}_.*\.md$/.test(file)) {
          const number = parseInt(file.slice(0, 3), 10);
          allPrompts.push({
            stack,
            file,
            number,
            path: path.join(stackDir, file)
          });
        }
      }
    } catch (err) {
      console.error(`Error reading stack directory ${stackDir}:`, err.message);
    }
  }

  return allPrompts.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptFile) {
  const content = await fs.readFile(promptFile.path, 'utf8');
  
  // Check for context references
  const contextMatch = content.match(/## Context: (.+)$/m);
  if (!contextMatch) return content;

  const contextFiles = contextMatch[1].split(',').map(f => f.trim());
  let contextContent = '';

  for (const contextFile of contextFiles) {
    try {
      const filePath = path.join('output', 'current', contextFile);
      const fileContent = await fs.readFile(filePath, 'utf8');
      contextContent += `\n\n### ${contextFile}\n\`\`\`\n${fileContent}\n\`\`\``;
    } catch (err) {
      console.warn(`Warning: Context file ${contextFile} not found`);
    }
  }

  return content + '\n\n## Existing Context:' + contextContent;
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('DRY RUN: Would send prompt to LLM:');
    console.log('----------------------------------------');
    console.log(prompt);
    console.log('----------------------------------------');
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY environment variable or use --api-key=');
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

    const url = new URL(`${options.apiUrl}/chat/completions`);
    
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
          'Content-Length': Buffer.byteLength(requestData)
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode >= 400) {
              reject(new Error(`API Error: ${res.statusCode} ${data}`));
              return;
            }
            
            const response = JSON.parse(data);
            if (!response.choices || !response.choices[0] || !response.choices[0].message) {
              reject(new Error('Invalid API response format'));
              return;
            }
            
            resolve(response.choices[0].message.content);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });

    req.write(requestData);
    req.end();
  });
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

async function checkOverwrite(filePath, noOverwrite) {
  if (noOverwrite) {
    try {
      await fs.access(filePath);
      // If we get here, file exists
      return false;
    } catch (err) {
      // File doesn't exist, safe to write
      return true;
    }
  }
  return true;
}

async function writeFiles(stageNumber, files, noOverwrite) {
  const stageDir = path.join('output', 'stages', stageNumber.toString().padStart(3, '0'));
  
  try {
    await fs.mkdir(stageDir, { recursive: true });
  } catch (err) {
    console.error(`Error creating stage directory: ${err.message}`);
  }
  
  for (const file of files) {
    const stageFilePath = path.join(stageDir, file.path);
    const currentFilePath = path.join('output', 'current', file.path);
    
    // Create subdirectories if needed
    const stageFileDir = path.dirname(stageFilePath);
    const currentFileDir = path.dirname(currentFilePath);
    
    try {
      await fs.mkdir(stageFileDir, { recursive: true });
      await fs.mkdir(currentFileDir, { recursive: true });
      
      const canWriteStage = await checkOverwrite(stageFilePath, noOverwrite);
      const canWriteCurrent = await checkOverwrite(currentFilePath, noOverwrite);
      
      if (canWriteStage) {
        await fs.writeFile(stageFilePath, file.content, 'utf8');
      } else {
        console.log(`Skipping overwrite of ${stageFilePath}`);
      }
      
      if (canWriteCurrent) {
        await fs.writeFile(currentFilePath, file.content, 'utf8');
      } else {
        console.log(`Skipping overwrite of ${currentFilePath}`);
      }
    } catch (err) {
      console.error(`Error writing file ${file.path}: ${err.message}`);
    }
  }
}

function runTests(testCmd) {
  if (!testCmd) return true;
  
  try {
    console.log(`Running test command: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    console.log('Tests passed.');
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
  console.log(`Found ${promptFiles.length} prompt files`);
  
  // Filter by start and end if specified
  const filteredPromptFiles = promptFiles.filter(p => {
    if (options.start !== null && p.number < options.start) return false;
    if (options.end !== null && p.number > options.end) return false;
    return true;
  });
  
  console.log(`Processing ${filteredPromptFiles.length} prompts within range`);
  
  for (const promptFile of filteredPromptFiles) {
    console.log(`Processing ${promptFile.stack}/${promptFile.file} (${promptFile.number})`);
    
    try {
      const promptContent = await buildPrompt(promptFile);
      console.log('Sending prompt to LLM...');
      
      const llmResponse = await processLlm(promptContent, options);
      const files = parseResponse(llmResponse);
      
      console.log(`Received ${files.length} files in response`);
      
      await writeFiles(promptFile.number, files, options.noOverwrite);
      console.log('Files written to output');
      
      if (options.testCmd) {
        const testsPassed = runTests(options.testCmd);
        if (!testsPassed) {
          console.error('Tests failed, stopping execution');
          process.exit(1);
        }
      }
    } catch (err) {
      console.error(`Error processing ${promptFile.file}:`, err.message);
      process.exit(1);
    }
  }
  
  console.log('Processing complete');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
