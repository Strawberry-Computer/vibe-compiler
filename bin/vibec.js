#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Summary of Changes and Reasoning:
 * 
 * - Updated parseResponse regex to /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g (prior change kept).
 * - Updated buildPrompt to resolve context files relative to output/current/ instead of project root.
 * - No changes to CLI parsing, LLM processing, file writing, or test running.
 * 
 * Reasoning:
 * - Context now uses generated files (e.g., output/current/bin/vibec.js), enabling self-referential evolution.
 * - Maintains existing functionality while shifting context base as requested.
 */

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    stacks: ['core'],
    noOverwrite: false,
    dryRun: false,
    apiUrl: process.env.VIBEC_API_URL || 'https://api.anthropic.com/v1',
    apiModel: process.env.VIBEC_API_MODEL || 'claude-3-7-sonnet',
    apiKey: process.env.VIBEC_API_KEY || '',
    testCmd: null
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) options.stacks = arg.split('=')[1].split(',');
    else if (arg === '--no-overwrite') options.noOverwrite = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--api-url=')) options.apiUrl = arg.split('=')[1];
    else if (arg.startsWith('--api-model=')) options.apiModel = arg.split('=')[1];
    else if (arg.startsWith('--test-cmd=')) options.testCmd = arg.split('=')[1];
  }

  if (process.env.VIBEC_DRY_RUN === 'true') options.dryRun = true;
  if (process.env.VIBEC_TEST_CMD) options.testCmd = process.env.VIBEC_TEST_CMD;
  return options;
};

const getPromptFiles = async (stacks) => {
  const prompts = [];
  for (const stack of stacks) {
    try {
      const files = await fs.readdir(`stacks/${stack}`);
      for (const file of files) {
        if (file.match(/^(\d{3})_.*\.md$/)) {
          const number = parseInt(file.slice(0, 3), 10);
          prompts.push({ stack, file, number });
        }
      }
    } catch (err) {
      console.log(`Warning: Could not read stacks/${stack}: ${err.message}`);
    }
  }
  return prompts.sort((a, b) => a.number - b.number);
};

const buildPrompt = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  const contextMatch = content.match(/## Context: (.+)/);
  if (!contextMatch) return content;

  const files = contextMatch[1].split(',').map(f => f.trim());
  const contextContent = await Promise.all(
    files.map(async (file) => {
      try {
        const fullPath = path.join('output/current', file);
        const data = await fs.readFile(fullPath, 'utf8');
        return `\n---\nFile: ${file}\n${data}`;
      } catch (err) {
        return `\n---\nFile: ${file}\n// Not found: ${err.message}`;
      }
    })
  );
  return `${content}\n${contextContent.join('')}`;
};

const processLlm = async (prompt, options) => {
  if (options.dryRun) {
    console.log('Dry run: Skipping LLM, returning prompt as output');
    return prompt;
  }
  if (!options.apiKey) {
    throw new Error('No VIBEC_API_KEY provided');
  }

  console.log(`Sending prompt to ${options.apiModel} (${prompt.length} chars)`);
  const requestData = JSON.stringify({
    model: options.apiModel,
    messages: [
      {
        role: 'system',
        content: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt’s ## Output: sections. Do not skip any requested outputs.'
      },
      { role: 'user', content: prompt }
    ],
    max_tokens: 4000
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${options.apiUrl}/chat/completions`,
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
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const response = JSON.parse(data);
            const content = response.choices[0].message.content;
            console.log('LLM response:', content);
            resolve(content);
          } else {
            reject(new Error(`API failed: ${res.statusCode} - ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(requestData);
    req.end();
  });
};

const parseResponse = (response) => {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    console.log(`Parsed file: ${match[1]}`); // Debug: Log each matched file
    files.push({ path: match[1], content: match[2] });
  }
  if (files.length === 0) {
    console.log('Warning: No files matched in response');
  }
  return files;
};

const checkOverwrite = async (files, noOverwrite) => {
  if (!noOverwrite) return;
  for (const file of files) {
    const target = path.join('output/current', file.path);
    try {
      await fs.access(target);
      throw new Error(`File ${target} exists and --no-overwrite is set`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
};

const writeFiles = async (stage, files) => {
  const stageDir = path.join('output/stages', String(stage).padStart(3, '0'));
  await fs.mkdir(stageDir, { recursive: true });
  await fs.mkdir('output/current', { recursive: true });

  for (const file of files) {
    const stagePath = path.join(stageDir, file.path);
    const currentPath = path.join('output/current', file.path);
    await fs.mkdir(path.dirname(stagePath), { recursive: true });
    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    await fs.writeFile(stagePath, file.content);
    await fs.writeFile(currentPath, file.content);
  }
};

const runTests = (testCmd) => {
  if (!testCmd) return true;
  console.log(`Running tests: ${testCmd}`);
  try {
    const output = execSync(testCmd, { encoding: 'utf8' });
    console.log('Test output:', output);
    return true;
  } catch (err) {
    console.log('Test failed:', err.message);
    if (err.stdout) console.log('Stdout:', err.stdout);
    if (err.stderr) console.log('Stderr:', err.stderr);
    return false;
  }
};

const main = async () => {
  console.log('Starting Vibe Compiler');
  const options = parseArgs();

  const prompts = await getPromptFiles(options.stacks);
  if (prompts.length === 0) {
    console.log('No prompt files found');
    return;
  }

  console.log(`Found ${prompts.length} prompts in ${options.stacks}`);
  for (const prompt of prompts) {
    const promptPath = path.join('stacks', prompt.stack, prompt.file);
    console.log(`Processing ${promptPath}`);

    const fullPrompt = await buildPrompt(promptPath);
    let response;
    try {
      response = await processLlm(fullPrompt, options);
    } catch (err) {
      console.log(`Error: ${err.message}`);
      process.exit(1);
    }

    const files = parseResponse(response);
    if (files.length === 0) {
      console.log('Warning: No files generated');
      continue;
    }

    try {
      await checkOverwrite(files, options.noOverwrite);
      await writeFiles(prompt.number, files);
      console.log(`Generated ${files.length} files for stage ${prompt.number}`);
      if (!runTests(options.testCmd)) {
        console.log('Tests failed, aborting');
        process.exit(1);
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('Compilation completed');
};

main().catch(err => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});
