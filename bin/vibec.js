#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stacks: ['core'],
    apiKey: process.env.VIBEC_API_KEY,
    apiUrl: 'https://openrouter.ai/api/v1',
    apiModel: 'anthropic/claude-3.7-sonnet',
    dryRun: false,
    noOverwrite: false,
    testCmd: null,
    start: null,
    end: null
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring('--stacks='.length).split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring('--test-cmd='.length);
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.substring('--api-key='.length);
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring('--api-url='.length);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring('--api-model='.length);
    } else if (arg.startsWith('--start=')) {
      options.start = Number(arg.substring('--start='.length));
    } else if (arg.startsWith('--end=')) {
      options.end = Number(arg.substring('--end='.length));
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
        if (file.match(/^\d+_.*\.md$/)) {
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
      console.error(`Error reading stack directory ${stackDir}:`, err);
    }
  }
  return promptFiles.sort((a, b) => a.number - b.number);
}

async function buildPrompt(promptPath) {
  let content = await fs.readFile(promptPath, 'utf-8');
  
  // Extract context files
  const contextMatch = content.match(/## Context: (.+)/);
  if (contextMatch) {
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    let contextContent = '';
    
    for (const contextFile of contextFiles) {
      try {
        const filePath = path.join('output', 'current', contextFile);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        contextContent += `\n\n### ${contextFile}\n\`\`\`\n${fileContent}\n\`\`\``;
      } catch (err) {
        console.warn(`Warning: Could not read context file ${contextFile}:`, err.message);
      }
    }
    
    // Replace the Context line with the actual content
    content = content.replace(/## Context: .+/, `## Context:${contextContent}`);
  }
  
  return content;
}

async function processLlm(prompt, options) {
  if (!options.apiKey && !options.dryRun) {
    throw new Error('API key is required. Set VIBEC_API_KEY environment variable or use --api-key=');
  }
  
  if (options.dryRun) {
    console.log('DRY RUN - Would send prompt:');
    console.log(prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }
  
  const llmUrl = `${options.apiUrl}/chat/completions`;
  
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
  
  console.log(`Sending prompt to ${options.apiModel}...`);
  
  try {
    const response = await fetch(llmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(requestData)
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

function parseResponse(response) {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;
  
  while ((match = regex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2];
    files.push({ path: filePath, content });
  }
  
  return files;
}

async function checkOverwrite(files, noOverwrite) {
  if (!noOverwrite) return true;
  
  for (const file of files) {
    const fullPath = path.join('output', 'current', file.path);
    try {
      await fs.access(fullPath);
      throw new Error(`File ${fullPath} already exists and --no-overwrite is set`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  
  return true;
}

async function writeFiles(files, stage) {
  const stageDir = path.join('output', 'stages', String(stage));
  
  // Create directories if they don't exist
  await fs.mkdir(stageDir, { recursive: true });
  await fs.mkdir(path.join('output', 'current'), { recursive: true });
  
  for (const file of files) {
    const stagePath = path.join(stageDir, file.path);
    const currentPath = path.join('output', 'current', file.path);
    
    // Create parent directories
    await fs.mkdir(path.dirname(stagePath), { recursive: true });
    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    
    // Write files
    await fs.writeFile(stagePath, file.content);
    await fs.writeFile(currentPath, file.content);
    
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
    // Skip if outside specified range
    if (
      (options.start !== null && promptFile.number < options.start) ||
      (options.end !== null && promptFile.number > options.end)
    ) {
      console.log(`Skipping ${promptFile.path} (outside requested range)`);
      continue;
    }
    
    console.log(`Processing ${promptFile.path}`);
    
    const prompt = await buildPrompt(promptFile.path);
    const response = await processLlm(prompt, options);
    const files = parseResponse(response);
    
    if (files.length === 0) {
      console.warn('Warning: No files extracted from LLM response');
      continue;
    }
    
    try {
      await checkOverwrite(files, options.noOverwrite);
      await writeFiles(files, promptFile.number);
      
      if (options.testCmd) {
        const testsPass = runTests(options.testCmd);
        if (!testsPass) process.exit(1);
      }
    } catch (err) {
      console.error(`Error processing ${promptFile.path}:`, err);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
