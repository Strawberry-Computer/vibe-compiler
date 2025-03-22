#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

/**
 * Summary of Changes and Reasoning:
 * 
 * This is a barebones implementation of vibec.js, stripped to essentials for self-compilation:
 * - Parses basic CLI args (--stacks, --no-overwrite, --dry-run, --api-url, --api-model) with minimal logic.
 * - Uses env vars (VIBEC_API_KEY, etc.) for API config, defaulting to Claude 3.7 via Anthropic API.
 * - Processes .md prompts from specified stacks (default: ['core']), parsing ## Context: for file inclusion.
 * - Sends prompts to LLM (or mocks in dry-run), parsing responses for "File: path\n```js\ncontent```" format.
 * - Writes to output/stages/NNN/ and output/current/ with no-overwrite check.
 * - Uses async FS with await for modern Node.js compatibility.
 * - Removes plugins, hashing, tests, retries, and colored logging (shifted to stacks).
 * - Keeps error handling minimal: logs and exits on failure.
 * 
 * Reasoning:
 * - Simplifies to core self-improving functionality, relying on bootstrap.js and stacks to evolve.
 * - Retains requested features (--no-overwrite, --dry-run) for safety and testing.
 * - Avoids hardcoded API/model values, allowing flexibility with sane defaults.
 * - Parses context but not output, letting LLM dictate file structure for simplicity.
 */

// Simple CLI parser
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    stacks: ['core'],
    noOverwrite: false,
    dryRun: false,
    apiUrl: process.env.VIBEC_API_URL || 'https://api.anthropic.com/v1',
    apiModel: process.env.VIBEC_API_MODEL || 'claude-3-7-sonnet',
    apiKey: process.env.VIBEC_API_KEY || ''
  };

  for (const arg of args) {
    if (arg.startsWith('--stacks=')) options.stacks = arg.split('=')[1].split(',');
    else if (arg === '--no-overwrite') options.noOverwrite = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--api-url=')) options.apiUrl = arg.split('=')[1];
    else if (arg.startsWith('--api-model=')) options.apiModel = arg.split('=')[1];
  }

  if (process.env.VIBEC_DRY_RUN === 'true') options.dryRun = true;
  return options;
};

// Get prompt files sorted by number
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

// Parse ## Context: and load files
const buildPrompt = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  const contextMatch = content.match(/## Context: (.+)/);
  if (!contextMatch) return content;

  const files = contextMatch[1].split(',').map(f => f.trim());
  const contextContent = await Promise.all(
    files.map(async (file) => {
      try {
        const data = await fs.readFile(file, 'utf8');
        return `\n---\nFile: ${file}\n${data}`;
      } catch (err) {
        return `\n---\nFile: ${file}\n// Not found: ${err.message}`;
      }
    })
  );
  return `${content}\n${contextContent.join('')}`;
};

// Process LLM request
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
      { role: 'system', content: 'Generate code files in the format: File: path\n```js\ncontent\n```' },
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
            resolve(response.choices[0].message.content);
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

// Parse LLM response for files
const parseResponse = (response) => {
  const files = [];
  const regex = /File: (.+?)\n```(?:js)?\n([\s\S]+?)\n```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    files.push({ path: match[1], content: match[2] });
  }
  return files;
};

// Check for overwrite conflicts
const checkOverwrite = async (files, noOverwrite) => {
  if (!noOverwrite) return;
  for (const file of files) {
    const target = path.join('output/current', file.path);
    try {
      await fs.access(target);
      throw new Error(`File ${target} exists and --no-overwrite is set`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // Only ignore "file not found"
    }
  }
};

// Write files to stages and current
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

// Main function
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
