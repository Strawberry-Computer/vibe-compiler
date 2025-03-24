#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Changelog:
 * - Updated parseResponse regex to /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g
 * - Updated buildPrompt to resolve context files relative to output/current/
 * - Reasoning: Enables self-referential evolution by using generated files as context
 *   for processing stacked prompts
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    stacks: ['core'],
    dryRun: false,
    noOverwrite: false,
    apiKey: process.env.VIBEC_API_KEY || '',
    apiUrl: process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1',
    apiModel: process.env.VIBEC_API_MODEL || 'anthropic/claude-3.7-sonnet',
    testCmd: process.env.VIBEC_TEST_CMD || null,
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      config.stacks = arg.replace('--stacks=', '').split(',');
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--no-overwrite') {
      config.noOverwrite = true;
    } else if (arg.startsWith('--api-key=')) {
      config.apiKey = arg.replace('--api-key=', '');
    } else if (arg.startsWith('--api-url=')) {
      config.apiUrl = arg.replace('--api-url=', '');
    } else if (arg.startsWith('--api-model=')) {
      config.apiModel = arg.replace('--api-model=', '');
    } else if (arg.startsWith('--test-cmd=')) {
      config.testCmd = arg.replace('--test-cmd=', '');
    }
  }

  return config;
}

async function getPromptFiles(stacks) {
  const promptFiles = [];
  
  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
    
    try {
      const files = await fs.readdir(stackDir);
      for (const file of files) {
        if (file.match(/^\d+_.*\.md$/)) {
          const number = parseInt(file.split('_')[0], 10);
          promptFiles.push({
            stack,
            file: path.join(stackDir, file),
            number
          });
        }
      }
    } catch (err) {
      console.error(`Error reading stack directory ${stackDir}:`, err);
    }
  }
  
  return promptFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptFile) {
  let content = await fs.readFile(promptFile, 'utf8');
  
  // Find context files
  const contextMatch = content.match(/## Context: (.+)$/m);
  if (contextMatch) {
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    let contextContent = '';
    
    for (const file of contextFiles) {
      try {
        // Resolve context files relative to output/current/
        const filePath = path.join('output', 'current', file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        contextContent += `\nFile: ${file}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
      } catch (err) {
        console.warn(`Context file not found: ${file}`);
      }
    }
    
    content = content.replace(/## Context: .+$/m, `## Context: ${contextMatch[1]}\n${contextContent}`);
  }
  
  return content;
}

async function processLlm(prompt, config) {
  if (config.dryRun) {
    console.log('Dry run - skipping LLM processing');
    return 'Dry run output';
  }
  
  if (!config.apiKey) {
    throw new Error('API key is required. Set VIBEC_API_KEY env var or use --api-key=');
  }
  
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      messages: [
        {
          role: 'system',
          content: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: config.apiModel
    });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
    };
    
    const req = https.request(`${config.apiUrl}/chat/completions`, options, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`API error: ${res.statusCode} ${JSON.stringify(response)}`));
            return;
          }
          
          if (response.choices && response.choices[0] && response.choices[0].message) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error(`Unexpected API response: ${JSON.stringify(response)}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse API response: ${err.message}\nResponse: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
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

async function checkOverwrite(files, config) {
  if (!config.noOverwrite) return true;
  
  for (const file of files) {
    const fullPath = path.join('output', 'current', file.path);
    try {
      await fs.access(fullPath);
      console.error(`File exists and --no-overwrite is set: ${fullPath}`);
      return false;
    } catch (err) {
      // File doesn't exist, can proceed
    }
  }
  
  return true;
}

async function writeFiles(files, stage, config) {
  // Ensure directories exist
  await fs.mkdir(path.join('output', 'stages', stage), { recursive: true });
  await fs.mkdir(path.join('output', 'current'), { recursive: true });
  
  for (const file of files) {
    const stagePath = path.join('output', 'stages', stage, file.path);
    const currentPath = path.join('output', 'current', file.path);
    
    // Ensure parent directories exist
    await fs.mkdir(path.dirname(stagePath), { recursive: true });
    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    
    await fs.writeFile(stagePath, file.content);
    await fs.writeFile(currentPath, file.content);
    
    console.log(`Wrote: ${file.path}`);
  }
}

function runTests(config) {
  if (!config.testCmd) return true;
  
  try {
    console.log(`Running test command: ${config.testCmd}`);
    execSync(config.testCmd, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Tests failed');
    return false;
  }
}

async function main() {
  const config = parseArgs();
  console.log(`Processing stacks: ${config.stacks.join(', ')}`);
  
  const promptFiles = await getPromptFiles(config.stacks);
  console.log(`Found ${promptFiles.length} prompt files`);
  
  for (const promptFile of promptFiles) {
    console.log(`Processing prompt ${promptFile.number}: ${promptFile.file}`);
    
    const prompt = await buildPrompt(promptFile.file);
    const llmResponse = await processLlm(prompt, config);
    const files = parseResponse(llmResponse);
    
    console.log(`Parsed ${files.length} files from LLM response`);
    
    if (files.length === 0) {
      console.error('No files parsed from response!');
      console.log('Response:', llmResponse);
      process.exit(1);
    }
    
    if (!(await checkOverwrite(files, config))) {
      process.exit(1);
    }
    
    await writeFiles(files, `${promptFile.number}`, config);
    
    if (!runTests(config)) {
      process.exit(1);
    }
  }
  
  console.log('All prompts processed successfully');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
