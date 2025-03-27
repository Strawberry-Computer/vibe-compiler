#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Package version - read from package.json or set default
 */
let version = '0.1.0';
try {
  const packageJson = require('../package.json');
  version = packageJson.version || version;
} catch (error) {
  // Use default version if package.json can't be read
}

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
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: vibec [options]

Options:
  --help                    Show this help message and exit
  --version                 Show version and exit
  --stacks=<stack1,stack2>  Comma-separated list of stacks to process (default: core)
  --dry-run                 Show what would be done without making changes
  --start=<number>          Start processing from this stage number
  --end=<number>            End processing at this stage number
  --no-overwrite            Skip stages that would overwrite existing files
  --api-url=<url>           API URL (default: https://openrouter.ai/api/v1)
  --api-key=<key>           API key for authentication
  --api-model=<model>       Model to use (default: anthropic/claude-3.7-sonnet)
  --test-cmd=<command>      Command to run tests after each stage
  --plugin-timeout=<ms>     JS plugin timeout in milliseconds (default: 5000)
  --retries=<number>        Number of retry attempts (default: 0)
  --output=<dir>            Output directory (default: output)
  `);
}

/**
 * Show version
 */
function showVersion() {
  console.log(`vibec v${version}`);
}

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
    pluginTimeout: 5000,
    retries: 0,
    output: 'output',
    help: false,
    version: false
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
        } else if (key === 'plugin-timeout') {
          options.pluginTimeout = parseInt(value, 10);
        } else if (key === 'retries') {
          options.retries = parseInt(value, 10);
          if (isNaN(options.retries) || options.retries < 0) {
            log.error('Retries must be a non-negative integer');
            process.exit(1);
          }
        } else if (key === 'output') {
          options.output = value;
        }
      } 
      // Handle boolean flags without values
      else if (arg === '--dry-run') {
        options.dryRun = true;
      } else if (arg === '--no-overwrite') {
        options.noOverwrite = true;
      } else if (arg === '--help') {
        options.help = true;
      } else if (arg === '--version') {
        options.version = true;
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
          } else if (key === 'plugin-timeout') {
            options.pluginTimeout = parseInt(nextArg, 10);
          } else if (key === 'retries') {
            options.retries = parseInt(nextArg, 10);
            if (isNaN(options.retries) || options.retries < 0) {
              log.error('Retries must be a non-negative integer');
              process.exit(1);
            }
          } else if (key === 'output') {
            options.output = nextArg;
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
 * Load static MD plugins for a stack
 * @param {string} stack - Name of the stack
 * @returns {Promise<string[]>} Array of plugin contents
 */
async function loadStaticPlugins(stack) {
  const plugins = [];
  const pluginsPath = path.join('stacks', stack, 'plugins');
  
  try {
    // Check if plugins directory exists
    try {
      await fs.access(pluginsPath);
    } catch (error) {
      log.debug(`No plugins directory found for stack ${stack}`);
      return plugins;
    }
    
    // Get all .md files in the plugins directory
    const files = await fs.readdir(pluginsPath);
    const mdFiles = files.filter(file => file.endsWith('.md')).sort();
    
    // Load each plugin content
    for (const file of mdFiles) {
      try {
        const content = await fs.readFile(path.join(pluginsPath, file), 'utf8');
        plugins.push(content);
        log.info(`Loaded static plugin: ${file} (stack: ${stack})`);
      } catch (error) {
        log.error(`Error loading static plugin ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    log.error(`Error scanning plugins for stack ${stack}: ${error.message}`);
  }
  
  return plugins;
}

/**
 * Load dynamic JS plugins for a stack
 * @param {string} stack - Name of the stack
 * @returns {Promise<Function[]>} Array of plugin functions
 */
async function loadDynamicPlugins(stack) {
  const plugins = [];
  const pluginsPath = path.join('stacks', stack, 'plugins');
  
  try {
    // Check if plugins directory exists
    try {
      await fs.access(pluginsPath);
    } catch (error) {
      log.debug(`No plugins directory found for stack ${stack}`);
      return plugins;
    }
    
    // Get all .js files in the plugins directory
    const files = await fs.readdir(pluginsPath);
    const jsFiles = files.filter(file => file.endsWith('.js')).sort();
    
    // Load each plugin module
    for (const file of jsFiles) {
      try {
        const pluginPath = path.resolve(path.join(pluginsPath, file));
        const plugin = require(pluginPath);
        
        if (typeof plugin === 'function') {
          plugins.push(plugin);
          log.info(`Loaded dynamic plugin: ${file} (stack: ${stack})`);
        } else {
          log.error(`Dynamic plugin ${file} does not export a function`);
        }
      } catch (error) {
        log.error(`Error loading dynamic plugin ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    log.error(`Error scanning dynamic plugins for stack ${stack}: ${error.message}`);
  }
  
  return plugins;
}

/**
 * Execute dynamic JS plugins
 * @param {Function[]} plugins - Array of plugin functions
 * @param {Object} context - Context object for plugins
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function executeDynamicPlugins(plugins, context, timeout) {
  for (const plugin of plugins) {
    try {
      log.debug(`Executing plugin: ${plugin.name || 'anonymous'}`);
      
      // Execute plugin with timeout
      await Promise.race([
        plugin(context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Plugin execution timed out after ${timeout}ms`)), timeout)
        )
      ]);
      
      log.debug(`Plugin ${plugin.name || 'anonymous'} executed successfully`);
    } catch (error) {
      log.error(`Plugin execution error: ${error.message}`);
      // Continue with next plugin
    }
  }
}

/**
 * Build a prompt by reading the file and appending context
 * @param {string} filePath - Path to the prompt file
 * @param {string} stack - Current stack name
 * @param {number} promptNumber - Current prompt number
 * @param {Object} config - Configuration object
 * @returns {Promise<string>} The complete prompt with context
 */
async function buildPrompt(filePath, stack, promptNumber, config) {
  try {
    // Read the prompt file
    const content = await fs.readFile(filePath, 'utf8');
    
    // Check if there are context files to include
    const contextMatch = content.match(/## Context: (.+)/);
    let basePrompt = content;
    
    if (contextMatch) {
      // Parse the list of context files
      const contextFiles = contextMatch[1].split(',').map(f => f.trim());
      let contextContent = '';
      
      // Read each context file from output/current/
      for (const contextFile of contextFiles) {
        try {
          const contextFilePath = path.join(config.output || 'output', 'current', contextFile);
          const fileContent = await fs.readFile(contextFilePath, 'utf8');
          contextContent += `\n\n### ${contextFile}\n\`\`\`\n${fileContent}\n\`\`\``;
        } catch (error) {
          log.warn(`Warning: Could not read context file ${contextFile}: ${error.message}`);
        }
      }
      
      // Replace the context marker with the actual content
      basePrompt = content.replace(/## Context: .+/, `## Context:${contextContent}`);
    }
    
    // Load static plugins
    const staticPlugins = await loadStaticPlugins(stack);
    
    // Append static plugin content
    if (staticPlugins.length > 0) {
      basePrompt += '\n\n## Plugins:\n\n' + staticPlugins.join('\n\n---\n\n');
    }
    
    return basePrompt;
    
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

  let retryCount = 0;
  let lastError = null;

  while (retryCount <= options.retries) {
    try {
      log.info(`Sending request to LLM API: ${options.apiUrl}${retryCount > 0 ? ` (retry ${retryCount}/${options.retries})` : ''}`);
      
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
      lastError = error;
      if (retryCount < options.retries) {
        log.warn(`Error processing through LLM (will retry): ${error.message}`);
        retryCount++;
      } else {
        log.error(`Error processing through LLM: ${error.message}`);
        throw error;
      }
    }
  }

  // This should never be reached if retries are exhausted (we would throw above)
  throw lastError || new Error('Unknown error occurred during API request');
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
 * @param {string} outputDir - The output directory
 * @returns {Promise<boolean>} True if overwrites would occur
 */
async function checkOverwrite(files, stage, outputDir) {
  for (const file of files) {
    const currentPath = path.join(outputDir, 'current', file.path);
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
 * @param {string} outputDir - The output directory
 * @returns {Promise<void>}
 */
async function writeFiles(files, stage, outputDir) {
  // Create stage directory
  const stageDir = path.join(outputDir, 'stages', `${stage}`);
  await fs.mkdir(stageDir, { recursive: true });
  
  for (const file of files) {
    const stagePath = path.join(stageDir, file.path);
    const currentPath = path.join(outputDir, 'current', file.path);
    
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
 * Load configuration from vibec.json
 * @returns {Promise<Object>} The configuration object
 */
async function loadConfig() {
  try {
    const configData = await fs.readFile('vibec.json', 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    log.debug(`No vibec.json found or error reading it: ${error.message}`);
    return {};
  }
}

/**
 * Main function to orchestrate the process
 * @param {string[]} args - Command line arguments
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);

  // Handle --help flag
  if (options.help) {
    showHelp();
    return;
  }

  // Handle --version flag
  if (options.version) {
    showVersion();
    return;
  }
  
  log.info(`Processing stacks: ${options.stacks.join(', ')}`);
  
  // Load configuration
  const config = await loadConfig();
  
  // Merge CLI options into config
  config.output = options.output || config.output || 'output';
  
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
    
    // Build prompt with static plugins
    const prompt = await buildPrompt(promptFile.file, promptFile.stack, promptFile.number, config);
    
    // Load dynamic plugins
    const dynamicPlugins = await loadDynamicPlugins(promptFile.stack);
    
    // Create context object for dynamic plugins
    const pluginContext = {
      config,
      stack: promptFile.stack,
      promptNumber: promptFile.number,
      promptContent: prompt,
      workingDir: path.join(config.output, 'current')
    };
    
    // Execute dynamic plugins
    if (dynamicPlugins.length > 0) {
      await executeDynamicPlugins(dynamicPlugins, pluginContext, options.pluginTimeout);
    }
    
    // Process through LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    log.info(`Extracted ${files.length} files from response`);
    
    // Check for overwrites
    if (options.noOverwrite && await checkOverwrite(files, promptFile.number, config.output)) {
      log.warn('Skipping due to --no-overwrite flag and files would be overwritten');
      continue;
    }
    
    // Write files
    if (!options.dryRun) {
      await writeFiles(files, promptFile.number, config.output);
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
  loadStaticPlugins,
  loadDynamicPlugins,
  executeDynamicPlugins,
  loadConfig,
  showHelp,
  showVersion,
  log,
  version
};