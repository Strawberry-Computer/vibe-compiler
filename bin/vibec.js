#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stacks: process.env.VIBEC_STACKS ? process.env.VIBEC_STACKS.split(',') : ['core'],
    apiKey: process.env.VIBEC_API_KEY || '',
    apiUrl: process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1',
    apiModel: process.env.VIBEC_API_MODEL || 'anthropic/claude-3.7-sonnet',
    dryRun: false,
    noOverwrite: false,
    testCmd: process.env.VIBEC_TEST_CMD || null,
    start: 0,
    end: Infinity,
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring(9).split(',');
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.substring(10);
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring(10);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring(12);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring(11);
    } else if (arg.startsWith('--start=')) {
      options.start = Number(arg.substring(8));
    } else if (arg.startsWith('--end=')) {
      options.end = Number(arg.substring(6));
    }
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
        if (/^\d+_.*\.md$/.test(file)) {
          const number = parseInt(file.split('_')[0], 10);
          promptFiles.push({
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

  return promptFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptPath) {
  let content = await fs.readFile(promptPath, 'utf-8');
  
  const contextMatches = content.match(/## Context: (.*)/);
  if (contextMatches) {
    const contextFiles = contextMatches[1].split(',').map(f => f.trim());
    let contextContent = '';
    
    for (const file of contextFiles) {
      try {
        const filePath = path.join('output', 'current', file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        contextContent += `\n### ${file}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
      } catch (err) {
        console.warn(`Could not read context file ${file}:`, err.message);
      }
    }
    
    content = content.replace(/## Context: .*/, `## Context: ${contextMatches[1]}${contextContent}`);
  }
  
  return content;
}

async function processLlm(prompt, options) {
  if (options.dryRun) {
    console.log('--- DRY RUN: PROMPT ---');
    console.log(prompt);
    console.log('--- END PROMPT ---');
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY environment variable or use --api-key=');
  }

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
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

    const url = `${options.apiUrl}/chat/completions`;
    
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              resolve(response.choices[0].message.content);
            } catch (err) {
              reject(new Error(`Failed to parse API response: ${err.message}`));
            }
          } else {
            reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', err => {
      reject(new Error(`API request error: ${err.message}`));
    });

    req.write(payload);
    req.end();
  });
}

function parseResponse(content) {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
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
    try {
      await fs.access(path.join('output', 'current', file.path));
      console.error(`File ${file.path} exists and --no-overwrite is set`);
      return false;
    } catch (err) {
      // File doesn't exist, can proceed
    }
  }

  return true;
}

async function writeFiles(files, stageNum) {
  const stageDirPath = path.join('output', 'stages', stageNum.toString().padStart(3, '0'));
  
  try {
    await fs.mkdir(stageDirPath, { recursive: true });
  } catch (err) {
    console.error(`Error creating stage directory: ${err.message}`);
    return false;
  }

  for (const file of files) {
    const stagePath = path.join(stageDirPath, file.path);
    const currentPath = path.join('output', 'current', file.path);

    try {
      await fs.mkdir(path.dirname(stagePath), { recursive: true });
      await fs.mkdir(path.dirname(currentPath), { recursive: true });
      
      await fs.writeFile(stagePath, file.content);
      await fs.writeFile(currentPath, file.content);
      
      console.log(`Wrote ${file.path}`);
    } catch (err) {
      console.error(`Error writing file ${file.path}: ${err.message}`);
      return false;
    }
  }

  return true;
}

function runTests(testCmd) {
  if (!testCmd) return true;
  
  try {
    console.log(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    console.log('Tests passed');
    return true;
  } catch (err) {
    console.error('Tests failed:', err.message);
    return false;
  }
}

async function main() {
  const options = await parseArgs();
  const promptFiles = await getPromptFiles(options.stacks);
  
  for (const promptFile of promptFiles) {
    if (promptFile.number < options.start || promptFile.number > options.end) {
      console.log(`Skipping prompt ${promptFile.number}: outside range (${options.start}-${options.end})`);
      continue;
    }
    
    console.log(`Processing prompt ${promptFile.number}: ${promptFile.file} from stack ${promptFile.stack}`);
    
    const prompt = await buildPrompt(promptFile.path);
    const response = await processLlm(prompt, options);
    const files = parseResponse(response);
    
    if (files.length === 0) {
      console.error('No files were generated from the response');
      process.exit(1);
    }
    
    console.log(`Generated ${files.length} files`);
    
    if (!(await checkOverwrite(files, options.noOverwrite))) {
      console.error('Stopping due to potential overwrites');
      process.exit(1);
    }
    
    if (!(await writeFiles(files, promptFile.number))) {
      console.error('Failed to write files');
      process.exit(1);
    }
    
    if (!runTests(options.testCmd)) {
      console.error('Tests failed, stopping');
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
