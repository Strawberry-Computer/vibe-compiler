#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Colored logging utility
 */
const log = {
  info: (message) => {
    console.log(`\x1b[36m${message}\x1b[0m`); // Cyan
  },
  warn: (message) => {
    console.log(`\x1b[33m${message}\x1b[0m`); // Yellow
  },
  error: (message) => {
    console.log(`\x1b[31m${message}\x1b[0m`); // Red
  },
  success: (message) => {
    console.log(`\x1b[32m${message}\x1b[0m`); // Green
  },
  debug: (message) => {
    if (process.env.VIBEC_DEBUG) {
      console.log(`\x1b[35m${message}\x1b[0m`); // Magenta
    }
  }
};

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArgs(args) {
  const options = {
    stacks: ['core'],
    dryRun: false,
    start: null,
    end: null,
    noOverwrite: false,
    apiUrl: 'https://openrouter.ai/api/v1',
    apiKey: null,
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      // Handle --option=value syntax
      if (arg.includes('=')) {
        const [key, value] = arg.substring(2).split('=');
        
        if (key === 'stacks') {
          options.stacks = value.split(',');
        } else if (key === 'dry-run') {
          options.dryRun = value !== 'false';
        } else if (key === 'start') {
          options.start = parseInt(value, 10);
        } else if (key === 'end') {
          options.end = parseInt(value, 10);
        } else if (key === 'no-overwrite') {
          options.noOverwrite = value !== 'false';
        } else if (key === 'api-url') {
          options.apiUrl = value;
        } else if (key === 'api-key') {
          options.apiKey = value;
        } else if (key === 'api-model') {
          options.apiModel = value;
        } else if (key === 'test-cmd') {
          options.testCmd = value;
        }
      } 
      // Handle boolean flags without values
      else if (arg === '--dry-run') {
        options.dryRun = true;
      } else if (arg === '--no-overwrite') {
        options.noOverwrite = true;
      } 
      // Handle --option value syntax
      else {
        const key = arg.substring(2);
        const nextArg = args[i + 1];
        
        if (i + 1 < args.length && !nextArg.startsWith('--')) {
          if (key === 'stacks') {
            options.stacks = nextArg.split(',');
          } else if (key === 'start') {
            options.start = parseInt(nextArg, 10);
          } else if (key === 'end') {
            options.end = parseInt(nextArg, 10);
          } else if (key === 'api-url') {
            options.apiUrl = nextArg;
          } else if (key === 'api-key') {
            options.apiKey = nextArg;
          } else if (key === 'api-model') {
            options.apiModel = nextArg;
          } else if (key === 'test-cmd') {
            options.testCmd = nextArg;
          }
          i++;
        }
      }
    }
  }

  return options;
}

/**
 * Get prompt files from stacks
 * @param {string[]} stacks - Array of stack names
 * @param {number|null} start - Starting stage number
 * @param {number|null} end - Ending stage number
 * @returns {Promise<Array<{stack: string, file: string, number: number}>>} Array of prompt file objects
 */
async function getPromptFiles(stacks, start, end) {
  const result = [];

  for (const stack of stacks) {
    try {
      const stackPath = path.join('stacks', stack);
      const files = await fs.readdir(stackPath);
      
      // Filter files matching pattern ###_*.md
      const promptFiles = files.filter(file => /^\d+_.*\.md$/.test(file));
      
      for (const file of promptFiles) {
        const match = file.match(/^(\d+)_/);
        if (match) {
          const number = parseInt(match[1], 10);
          
          // Apply start/end filters if provided
          if ((start === null || number >= start) && 
              (end === null || number <= end)) {
            result.push({
              stack,
              file: path.join(stackPath, file),
              number
            });
          }
        }
      }
    } catch (error) {
      log.error(`Error scanning stack ${stack}: ${error.message}`);
    }
  }

  // Sort by number
  return result.sort((a, b) => a.number - b.number);
}

/**
 * Build a prompt by reading the file and appending context
 * @param {string} filePath - Path to the prompt file
 * @returns {Promise<string>} The complete prompt with context
 */
async function buildPrompt(filePath) {
  try {
    // Read the prompt file
    const content = await fs.readFile(filePath, 'utf8');
    
    // Check if there are context files to include
    const contextMatch = content.match(/## Context: (.+)/);
    if (!contextMatch) {
      return content;
    }
    
    // Parse the list of context files
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    let contextContent = '';
    
    // Read each context file from output/current/
    for (const contextFile of contextFiles) {
      try {
        const contextFilePath = path.join('output', 'current', contextFile);
        const fileContent = await fs.readFile(contextFilePath, 'utf8');
        contextContent += `\n\n### ${contextFile}\n\`\`\`\n${fileContent}\n\`\`\``;
      } catch (error) {
        log.warn(`Warning: Could not read context file ${contextFile}: ${error.message}`);
      }
    }
    
    // Replace the context marker with the actual content
    return content.replace(/## Context: .+/, `## Context:${contextContent}`);
    
  } catch (error) {
    log.error(`Error building prompt from ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Process a prompt through LLM API
 * @param {string} prompt - The prompt to process
 * @param {Object} options - API options
 * @returns {Promise<string>} The LLM response
 */
async function processLlm(prompt, options) {
  if (options.dryRun) {
    log.info('DRY RUN: Would send the following prompt to LLM API:');
    log.info('-------------------');
    log.debug(prompt);
    log.info('-------------------');
    return 'File: example/file\n```lang\ncontent\n```';
  }
  
  if (!options.apiKey) {
    throw new Error('API key is required. Please provide --api-key.');
  }

  try {
    log.info(`Sending request to LLM API: ${options.apiUrl}`);
    
    const response = await fetch(`${options.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
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
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    log.error(`Error processing through LLM: ${error.message}`);
    throw error;
  }
}

/**
 * Parse response to extract files
 * @param {string} response - The LLM response
 * @returns {Array<{path: string, content: string}>} Array of file objects
 */
function parseResponse(response) {
  const files = [];
  const fileRegex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  
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
 * Check if files would be overwritten
 * @param {Array<{path: string, content: string}>} files - Array of file objects
 * @param {number} stage - The current stage number
 * @returns {Promise<boolean>} True if overwrites would occur
 */
async function checkOverwrite(files, stage) {
  for (const file of files) {
    const currentPath = path.join('output', 'current', file.path);
    try {
      await fs.access(currentPath);
      // File exists
      return true;
    } catch (error) {
      // File doesn't exist, continue checking
    }
  }
  return false;
}

/**
 * Write files to output directories
 * @param {Array<{path: string, content: string}>} files - Array of file objects
 * @param {number} stage - The current stage number
 * @returns {Promise<void>}
 */
async function writeFiles(files, stage) {
  // Create stage directory
  const stageDir = path.join('output', 'stages', `${stage}`);
  await fs.mkdir(stageDir, { recursive: true });
  
  for (const file of files) {
    const stagePath = path.join(stageDir, file.path);
    const currentPath = path.join('output', 'current', file.path);
    
    // Create parent directories
    await fs.mkdir(path.dirname(stagePath), { recursive: true });
    await fs.mkdir(path.dirname(currentPath), { recursive: true });
    
    // Write files
    await fs.writeFile(stagePath, file.content);
    await fs.writeFile(currentPath, file.content);
    
    log.success(`Wrote file: ${currentPath}`);
  }
}

/**
 * Run tests if test command is provided
 * @param {string|null} testCmd - The test command to execute
 * @returns {boolean} True if tests passed
 */
function runTests(testCmd) {
  if (!testCmd) return true;
  
  try {
    log.info(`Running tests: ${testCmd}`);
    execSync(testCmd, { stdio: 'inherit' });
    log.success('Tests passed');
    return true;
  } catch (error) {
    log.error('Tests failed:', error.message);
    return false;
  }
}

/**
 * Main function to orchestrate the process
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);
  log.info(`Processing stacks: ${options.stacks.join(', ')}`);
  
  // Get prompt files
  const promptFiles = await getPromptFiles(options.stacks, options.start, options.end);
  if (promptFiles.length === 0) {
    log.info('No prompt files found matching criteria.');
    return;
  }
  
  log.info(`Found ${promptFiles.length} prompt files to process`);
  
  // Process each file
  for (const promptFile of promptFiles) {
    log.info(`Processing ${promptFile.file} (Stage ${promptFile.number})`);
    
    // Build prompt
    const prompt = await buildPrompt(promptFile.file);
    
    // Process through LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    log.info(`Extracted ${files.length} files from response`);
    
    // Check for overwrites
    if (options.noOverwrite && await checkOverwrite(files, promptFile.number)) {
      log.warn('Skipping due to --no-overwrite flag and files would be overwritten');
      continue;
    }
    
    // Write files
    if (!options.dryRun) {
      await writeFiles(files, promptFile.number);
    } else {
      log.info('DRY RUN: Would write the following files:');
      for (const file of files) {
        log.info(`- ${file.path}`);
      }
    }
    
    // Run tests
    if (!options.dryRun && options.testCmd) {
      if (!runTests(options.testCmd)) {
        process.exit(1);
      }
    }
  }
  
  log.success('Processing completed successfully');
}

// Execute main function
main(process.argv).catch(error => {
  log.error('Error:', error.message);
  process.exit(1);
});

// Export functions
module.exports = {
  parseArgs,
  getPromptFiles,
  buildPrompt,
  processLlm,
  parseResponse,
  checkOverwrite,
  writeFiles,
  runTests,
  main,
  log
};