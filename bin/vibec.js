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
    apiKey: process.env.VIBEC_API_KEY,
    apiUrl: 'https://openrouter.ai/api/v1',
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
    start: 0,
    end: Infinity
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.slice('--stacks='.length).split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.slice('--api-key='.length);
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.slice('--api-url='.length);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.slice('--api-model='.length);
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.slice('--test-cmd='.length);
    } else if (arg.startsWith('--start=')) {
      options.start = Number(arg.slice('--start='.length));
    } else if (arg.startsWith('--end=')) {
      options.end = Number(arg.slice('--end='.length));
    }
  }

  if (!options.apiKey && !options.dryRun) {
    console.error('Error: API key is required. Set VIBEC_API_KEY environment variable or use --api-key=');
    process.exit(1);
  }

  return options;
}

async function getPromptFiles(stacks) {
  const promptFiles = [];

  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        const match = file.match(/^(\d+)_.+\.md$/);
        if (match) {
          promptFiles.push({
            stack,
            file,
            number: parseInt(match[1], 10)
          });
        }
      }
    } catch (error) {
      console.error(`Error reading stack directory ${stackDir}:`, error.message);
    }
  }

  return promptFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptFile) {
  const filePath = path.join('stacks', promptFile.stack, promptFile.file);
  let content = await fs.readFile(filePath, 'utf8');

  const contextMatches = content.match(/## Context: (.+)/);
  if (contextMatches) {
    const contextFiles = contextMatches[1].split(',').map(f => f.trim());
    let contextContent = '';

    for (const file of contextFiles) {
      try {
        const context = await fs.readFile(path.join('output', 'current', file), 'utf8');
        contextContent += `\n\n### ${file}\n\`\`\`\n${context}\n\`\`\``;
      } catch (error) {
        console.warn(`Warning: Could not read context file ${file}:`, error.message);
      }
    }

    content = content.replace(/## Context: .+/, `## Context: ${contextMatches[1]}${contextContent}`);
  }

  return {
    ...promptFile,
    content
  };
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('Dry run mode. Prompt content:');
    console.log('-'.repeat(80));
    console.log(prompt.content);
    console.log('-'.repeat(80));
    return 'File: example/file\n```lang\ncontent\n```';
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
          content: prompt.content
        }
      ]
    });

    const apiUrl = new URL('/chat/completions', options.apiUrl);
    const req = https.request(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`
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
              const result = JSON.parse(data);
              resolve(result.choices[0].message.content);
            } catch (error) {
              reject(new Error(`Failed to parse API response: ${error.message}`));
            }
          } else {
            reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', (error) => {
      reject(new Error(`API request failed: ${error.message}`));
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

async function checkOverwrite(files, noOverwrite) {
  if (!noOverwrite) return true;

  for (const file of files) {
    const filePath = path.join('output', 'current', file.path);
    try {
      await fs.access(filePath);
      console.error(`Error: File ${file.path} already exists and --no-overwrite is set.`);
      return false;
    } catch (error) {
      // File doesn't exist, which is what we want
    }
  }

  return true;
}

async function writeFiles(files, stage) {
  const stageDir = path.join('output', 'stages', stage.toString().padStart(3, '0'));
  await fs.mkdir(stageDir, { recursive: true });

  for (const file of files) {
    const currentPath = path.join('output', 'current', file.path);
    const stagePath = path.join(stageDir, file.path);

    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    await fs.mkdir(path.dirname(stagePath), { recursive: true });

    await fs.writeFile(currentPath, file.content);
    await fs.writeFile(stagePath, file.content);

    console.log(`Wrote ${file.path}`);
  }

  return true;
}

function runTests(testCmd) {
  if (!testCmd) return true;

  try {
    console.log(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    console.log('Tests passed!');
    return true;
  } catch (error) {
    console.error('Tests failed:', error.message);
    return false;
  }
}

async function main() {
  const options = await parseArgs();
  console.log(`Processing stacks: ${options.stacks.join(', ')}`);
  
  const promptFiles = await getPromptFiles(options.stacks);
  console.log(`Found ${promptFiles.length} prompt files`);

  for (const promptFile of promptFiles) {
    if (promptFile.number < options.start || promptFile.number > options.end) {
      console.log(`Skipping ${promptFile.file} (outside requested range)`);
      continue;
    }

    console.log(`Processing ${promptFile.file} (stage ${promptFile.number})`);
    const prompt = await buildPrompt(promptFile);
    
    const response = await processLlm(prompt, options);
    const files = parseResponse(response);
    
    if (files.length === 0) {
      console.error('Error: No files found in LLM response');
      process.exit(1);
    }
    
    console.log(`Extracted ${files.length} files from response`);
    
    if (!(await checkOverwrite(files, options.noOverwrite))) {
      process.exit(1);
    }
    
    await writeFiles(files, promptFile.number);
    
    if (!runTests(options.testCmd)) {
      process.exit(1);
    }
  }

  console.log('All prompts processed successfully!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
