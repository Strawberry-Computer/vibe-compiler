#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

/**
 * Colored logging utility
 */
export const log = {
  // Default logger
  logger: console.log,
  
  // Color codes
  colors: {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
  },

  // Log methods
  info: function(message) {
    this.logger(`${this.colors.cyan}${message}${this.colors.reset}`);
  },
  
  warn: function(message) {
    this.logger(`${this.colors.yellow}${message}${this.colors.reset}`);
  },
  
  error: function(message) {
    this.logger(`${this.colors.red}${message}${this.colors.reset}`);
  },
  
  success: function(message) {
    this.logger(`${this.colors.green}${message}${this.colors.reset}`);
  },
  
  debug: function(message) {
    if (process.env.VIBEC_DEBUG) {
      this.logger(`${this.colors.magenta}${message}${this.colors.reset}`);
    }
  }
};

/**
 * Parse command line arguments
 * @param {string[]} argv - Command line arguments
 * @return {Object} Parsed options
 */
export function parseArgs(argv) {
  const args = argv.slice(2); // Remove node and script name
  const options = {
    workdir: '.',
    stacks: ['core'],
    'dry-run': false,
    start: null,
    end: null,
    'api-url': 'https://openrouter.ai/api/v1',
    'api-key': null,
    'api-model': 'anthropic/claude-3.7-sonnet',
    'test-cmd': null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      // Handle --option=value syntax
      if (arg.includes('=')) {
        const [key, value] = arg.slice(2).split('=');
        if (key === 'stacks') {
          options[key] = value.split(',');
        } else if (key === 'dry-run') {
          options[key] = value.toLowerCase() !== 'false';
        } else if (key === 'start' || key === 'end') {
          options[key] = value ? Number(value) : null;
        } else {
          options[key] = value;
        }
      } 
      // Handle --option value syntax or boolean flag
      else {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        
        if (!nextArg || nextArg.startsWith('--')) {
          // It's a boolean flag
          options[key] = true;
        } else {
          // It's a value
          i++; // Skip the next arg since we're consuming it now
          if (key === 'stacks') {
            options[key] = nextArg.split(',');
          } else if (key === 'dry-run') {
            options[key] = nextArg.toLowerCase() !== 'false';
          } else if (key === 'start' || key === 'end') {
            options[key] = nextArg ? Number(nextArg) : null;
          } else {
            options[key] = nextArg;
          }
        }
      }
    }
  }

  return options;
}

/**
 * Get prompt files from stacks
 * @param {string} workdir - Working directory
 * @param {string[]} stacks - Stacks to scan
 * @return {Promise<Array<Object>>} Array of objects with stack, file, and number properties
 */
export async function getPromptFiles(workdir, stacks) {
  const result = [];
  
  for (const stack of stacks) {
    const stackDir = path.join(workdir, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        if (file.match(/^\d+_.*\.md$/)) {
          const number = parseInt(file.split('_')[0], 10);
          result.push({
            stack,
            file: path.join(stackDir, file),
            number,
          });
        }
      }
    } catch (err) {
      log.error(`Error reading stack directory ${stackDir}: ${err.message}`);
      throw err;
    }
  }
  
  return result.sort((a, b) => a.number - b.number);
}

/**
 * Load plugins for a stack
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @return {Promise<string>} Combined plugin content
 */
export async function loadPlugins(workdir, stack) {
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  let pluginContent = '';
  
  try {
    const files = await fs.readdir(pluginsDir);
    const mdFiles = files.filter(file => file.endsWith('.md')).sort();
    
    if (mdFiles.length > 0) {
      for (const file of mdFiles) {
        const content = await fs.readFile(path.join(pluginsDir, file), 'utf-8');
        pluginContent += `\n\n${content}`;
        log.info(`Loaded plugin: ${stack}/plugins/${file}`);
      }
    }
  } catch (err) {
    // Plugins directory may not exist, that's okay
    log.debug(`No plugins found for stack ${stack}: ${err.message}`);
  }
  
  return pluginContent;
}

/**
 * Build prompt from file and context
 * @param {string} filePath - Path to prompt file
 * @param {string} currentDir - Current directory containing context files
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @return {Promise<string>} Assembled prompt
 */
export async function buildPrompt(filePath, currentDir, workdir, stack) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Extract context files
    const contextMatch = fileContent.match(/## Context: (.*?)$/m);
    let contextContent = '';
    
    if (contextMatch && contextMatch[1]) {
      const contextFiles = contextMatch[1].split(',').map(f => f.trim());
      
      for (const file of contextFiles) {
        try {
          const contextFilePath = path.join(currentDir, file);
          const content = await fs.readFile(contextFilePath, 'utf-8');
          contextContent += `## File: ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
        } catch (err) {
          log.warn(`Could not read context file ${file}: ${err.message}`);
        }
      }
    }
    
    // Load plugins
    const pluginContent = await loadPlugins(workdir, stack);
    
    // System message
    const systemMessage = 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.';
    
    // Assemble prompt sandwich
    return `${systemMessage}\n\n${fileContent}${pluginContent}\n\n${contextContent}\n\n${systemMessage}\n\n${fileContent}${pluginContent}`;
  } catch (err) {
    log.error(`Error building prompt from ${filePath}: ${err.message}`);
    throw err;
  }
}

/**
 * Process prompt with LLM API
 * @param {string} prompt - The prompt to send to the LLM API
 * @param {Object} options - Options including dry-run, api-url, api-key, and api-model
 * @return {Promise<string>} LLM API response
 */
export async function processLlm(prompt, options) {
  if (options['dry-run']) {
    log.warn('Dry run mode: Skipping LLM API call');
    log.info('Prompt:' + prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }
  
  if (!options['api-key']) {
    throw new Error('API key is required for LLM API calls');
  }
  
  const apiUrl = options['api-url'];
  const apiKey = options['api-key'];
  const model = options['api-model'];

  log.info(`Sending prompt to LLM API (${model})...`);
  
  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
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
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    log.error(`Error processing LLM request: ${err.message}`);
    throw err;
  }
}

/**
 * Parse LLM response to extract files
 * @param {string} response - LLM API response
 * @return {Array<Object>} Array of objects with path and content
 */
export function parseResponse(response) {
  const fileRegex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  const files = [];
  
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2]
    });
  }
  
  return files;
}

/**
 * Write files to output directory
 * @param {Array<Object>} files - Files to write
 * @param {string} stackDir - Stack output directory
 * @param {string} currentDir - Current output directory
 * @return {Promise<void>}
 */
export async function writeFiles(files, stackDir, currentDir) {
  for (const file of files) {
    const stackFilePath = path.join(stackDir, file.path);
    const currentFilePath = path.join(currentDir, file.path);
    
    // Ensure directories exist
    await fs.mkdir(path.dirname(stackFilePath), { recursive: true });
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    
    // Write files
    await fs.writeFile(stackFilePath, file.content);
    await fs.writeFile(currentFilePath, file.content);
    
    log.success(`Wrote file: ${file.path}`);
  }
}

/**
 * Run tests
 * @param {string} testCmd - Test command to run
 * @return {void}
 */
export function runTests(testCmd) {
  if (!testCmd) return;
  
  try {
    log.info(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
  } catch (err) {
    log.error(`Error running tests: ${err.message}`);
    throw err;
  }
}

/**
 * Main function to orchestrate the process
 * @param {string[]} argv - Command line arguments
 * @return {Promise<void>}
 */
export async function main(argv) {
  // Parse CLI arguments
  const options = parseArgs(argv);
  log.info(`Options: ${JSON.stringify(options, null, 2)}`);
  
  // Get prompt files
  const files = await getPromptFiles(options.workdir, options.stacks);
  log.info(`Found ${files.length} prompt files`);
  
  // Filter files based on start and end
  let filteredFiles = files;
  if (options.start !== null) {
    filteredFiles = filteredFiles.filter(file => file.number >= options.start);
  }
  if (options.end !== null) {
    filteredFiles = filteredFiles.filter(file => file.number <= options.end);
  }
  log.info(`Processing ${filteredFiles.length} files after filtering`);
  
  // Initialize output directories
  const currentDir = path.join(options.workdir, 'output', 'current');
  const bootstrapDir = path.join(options.workdir, 'output', 'bootstrap');
  
  // Recreate the output/current directory
  try {
    await fs.rm(currentDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore if directory doesn't exist
  }
  await fs.mkdir(currentDir, { recursive: true });
  
  // Copy bootstrap files if they exist
  try {
    const bootstrapFiles = await fs.readdir(bootstrapDir);
    for (const file of bootstrapFiles) {
      const srcPath = path.join(bootstrapDir, file);
      const destPath = path.join(currentDir, file);
      
      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        await fs.cp(srcPath, destPath, { recursive: true });
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
    log.success('Copied bootstrap files to current directory');
  } catch (err) {
    log.warn(`No bootstrap directory found or error copying: ${err.message}`);
  }
  
  // Copy files from previous stacks if start is specified
  if (options.start !== null) {
    // Get all stacks
    const stacksDir = path.join(options.workdir, 'stacks');
    let allStacks;
    try {
      allStacks = await fs.readdir(stacksDir);
    } catch (err) {
      log.error(`Error reading stacks directory: ${err.message}`);
      allStacks = [];
    }
    
    // For each stack, get all prompt files less than start
    for (const stack of allStacks) {
      const stackPromptDir = path.join(stacksDir, stack);
      try {
        const stackFiles = await fs.readdir(stackPromptDir);
        for (const file of stackFiles) {
          if (file.match(/^\d+_.*\.md$/)) {
            const number = parseInt(file.split('_')[0], 10);
            if (number < options.start) {
              const promptName = file.replace(/\.md$/, '');
              const stackOutputDir = path.join(options.workdir, 'output', 'stacks', stack, promptName);
              
              try {
                // Copy files from this stack output to current
                const outputFiles = await fs.readdir(stackOutputDir, { recursive: true });
                for (const outputFile of outputFiles) {
                  const srcPath = path.join(stackOutputDir, outputFile);
                  const destPath = path.join(currentDir, outputFile);
                  
                  const stat = await fs.stat(srcPath);
                  if (stat.isDirectory()) {
                    await fs.mkdir(destPath, { recursive: true });
                  } else {
                    await fs.mkdir(path.dirname(destPath), { recursive: true });
                    await fs.copyFile(srcPath, destPath);
                  }
                }
              } catch (err) {
                // Skip if no files
              }
            }
          }
        }
      } catch (err) {
        // Skip if stack directory doesn't exist
      }
    }
    log.success('Copied previous stack files to match starting point');
  }
  
  // Process each prompt file
  for (const promptFile of filteredFiles) {
    log.info(`Processing ${promptFile.file} (${promptFile.number})`);
    
    // Build prompt with plugins
    const prompt = await buildPrompt(promptFile.file, currentDir, options.workdir, promptFile.stack);
    
    // Process with LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    log.info(`Extracted ${files.length} files from response`);
    
    // Create output directories
    const promptName = path.basename(promptFile.file, '.md');
    const stackDir = path.join(options.workdir, 'output', 'stacks', promptFile.stack, promptName);
    await fs.mkdir(stackDir, { recursive: true });
    
    // Write files
    await writeFiles(files, stackDir, currentDir);
    
    // Run tests
    runTests(options['test-cmd']);
  }
  
  log.success('Processing complete');
}

// Only execute main if script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch(err => {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  });
}