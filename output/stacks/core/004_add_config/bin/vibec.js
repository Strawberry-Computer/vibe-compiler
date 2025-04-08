#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Colored logging utility
 */
const log = {
  // Default logger uses console.log
  logger: console.log,
  
  // Color codes
  colors: {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    magenta: '\x1b[35m'
  },
  
  // Logging methods
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

// Package version (loaded from package.json when needed)
let packageVersion = null;

/**
 * Get the package version from package.json
 * @returns {string} Package version
 */
function getPackageVersion() {
  if (!packageVersion) {
    try {
      const packageJson = require(path.resolve(__dirname, '../package.json'));
      packageVersion = packageJson.version || 'unknown';
    } catch (err) {
      packageVersion = 'unknown';
    }
  }
  return packageVersion;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: vibec [options]

Options:
  --help                       Show this help message and exit
  --version                    Show version and exit
  --workdir=<path>             Working directory (default: current directory)
  --stacks=<stack1,stack2>     Comma-separated list of stacks to process (default: core)
  --start=<number>             Start processing from this prompt number
  --end=<number>               End processing at this prompt number
  --dry-run                    Don't make actual API calls, just show what would happen
  --no-overwrite               Don't overwrite existing files
  --api-url=<url>              API URL (default: https://openrouter.ai/api/v1)
  --api-key=<key>              API key for the LLM provider
  --api-model=<model>          Model to use (default: anthropic/claude-3.7-sonnet)
  --test-cmd=<command>         Command to run tests after each prompt
  --retries=<number>           Number of retries for API calls (default: 0)
  --plugin-timeout=<ms>        JS plugin timeout in milliseconds (default: 5000)
  --output=<dir>               Output directory (default: output)
`);
}

/**
 * Show version information
 */
function showVersion() {
  console.log(`vibec v${getPackageVersion()}`);
}

/**
 * Load vibec.json configuration file.
 * @param {string} workdir - Working directory
 * @returns {Promise<Object|null>} Parsed config or null if not found
 */
async function loadConfigFile(workdir) {
  try {
    const configPath = path.join(workdir, 'vibec.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    
    try {
      return JSON.parse(configContent);
    } catch (err) {
      throw new Error(`Invalid JSON in vibec.json: ${err.message}`);
    }
  } catch (err) {
    // Return null if file doesn't exist
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Process environment variables into options object.
 * @param {Object} env - Process environment object
 * @returns {Object} Options derived from environment variables
 */
function processEnvVars(env) {
  const options = {};

  // Map environment variables to option keys
  if (env.VIBEC_WORKDIR) options.workdir = env.VIBEC_WORKDIR;
  
  if (env.VIBEC_STACKS) {
    options.stacks = env.VIBEC_STACKS.split(',').map(s => s.trim());
  }
  
  if (env.VIBEC_NO_OVERWRITE) {
    options['no-overwrite'] = env.VIBEC_NO_OVERWRITE.toLowerCase() === 'true';
  }
  
  if (env.VIBEC_DRY_RUN) {
    options['dry-run'] = env.VIBEC_DRY_RUN.toLowerCase() === 'true';
  }
  
  if (env.VIBEC_START) {
    const num = parseInt(env.VIBEC_START, 10);
    if (!isNaN(num)) options.start = num;
  }
  
  if (env.VIBEC_END) {
    const num = parseInt(env.VIBEC_END, 10);
    if (!isNaN(num)) options.end = num;
  }
  
  if (env.VIBEC_API_URL) options['api-url'] = env.VIBEC_API_URL;
  if (env.VIBEC_API_KEY) options['api-key'] = env.VIBEC_API_KEY;
  if (env.VIBEC_API_MODEL) options['api-model'] = env.VIBEC_API_MODEL;
  if (env.VIBEC_TEST_CMD) options['test-cmd'] = env.VIBEC_TEST_CMD;
  
  if (env.VIBEC_RETRIES) {
    const num = parseInt(env.VIBEC_RETRIES, 10);
    if (!isNaN(num) && num >= 0) options.retries = num;
  }
  
  if (env.VIBEC_PLUGIN_TIMEOUT) {
    const num = parseInt(env.VIBEC_PLUGIN_TIMEOUT, 10);
    if (!isNaN(num) && num > 0) options['plugin-timeout'] = num;
  }

  return options;
}

/**
 * Process config file into options object.
 * @param {Object} config - Config from vibec.json
 * @returns {Object} Options derived from config file
 */
function processConfigFile(config) {
  if (!config) return {};
  
  const options = {};
  
  // Map config properties to option keys
  if (config.workdir !== undefined) options.workdir = config.workdir;
  if (config.stacks !== undefined) {
    options.stacks = Array.isArray(config.stacks) 
      ? config.stacks 
      : String(config.stacks).split(',').map(s => s.trim());
  }
  
  if (config.noOverwrite !== undefined) options['no-overwrite'] = !!config.noOverwrite;
  if (config.dryRun !== undefined) options['dry-run'] = !!config.dryRun;
  
  if (config.start !== undefined && config.start !== null) {
    const num = parseInt(config.start, 10);
    if (!isNaN(num)) options.start = num;
  }
  
  if (config.end !== undefined && config.end !== null) {
    const num = parseInt(config.end, 10);
    if (!isNaN(num)) options.end = num;
  }
  
  if (config.apiUrl !== undefined) options['api-url'] = config.apiUrl;
  if (config.apiKey !== undefined) options['api-key'] = config.apiKey;
  if (config.apiModel !== undefined) options['api-model'] = config.apiModel;
  if (config.testCmd !== undefined) options['test-cmd'] = config.testCmd;
  
  if (config.retries !== undefined) {
    const num = parseInt(config.retries, 10);
    if (isNaN(num) || num < 0) {
      log.error(`Invalid retries value in config: ${config.retries}. Expected a non-negative integer.`);
    } else {
      options.retries = num;
    }
  }
  
  if (config.pluginTimeout !== undefined) {
    const num = parseInt(config.pluginTimeout, 10);
    if (isNaN(num) || num <= 0) {
      log.error(`Invalid pluginTimeout value in config: ${config.pluginTimeout}. Expected a positive integer.`);
    } else {
      options['plugin-timeout'] = num;
    }
  }
  
  return options;
}

/**
 * Parse command line arguments.
 * @param {string[]} argv - Process argv array
 * @param {Object} env - Process environment variables
 * @param {Object|null} configFile - Parsed vibec.json or null
 * @returns {Object} Parsed options
 */
function parseArgs(argv, env = {}, configFile = null) {
  // Set default options
  const defaults = {
    workdir: '.',
    stacks: ['core'],
    'dry-run': false,
    start: null,
    end: null,
    'no-overwrite': false,
    'api-url': 'https://openrouter.ai/api/v1',
    'api-key': null,
    'api-model': 'anthropic/claude-3.7-sonnet',
    'test-cmd': null,
    'plugin-timeout': 5000,
    'retries': 0,
    'output': 'output'
  };

  // Process config file and environment variables
  const configOptions = processConfigFile(configFile);
  const envOptions = processEnvVars(env);

  // Merge defaults with config and env options
  // Priority: defaults -> config -> env
  let options = { ...defaults, ...configOptions, ...envOptions };

  // Handle CLI arguments (highest priority)
  const args = argv || process.argv;

  // Check for help and version flags first
  if (args.includes('--help')) {
    options.help = true;
    return options;
  }

  if (args.includes('--version')) {
    options.version = true;
    return options;
  }

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex !== -1) {
        // --option=value format
        const key = arg.substring(2, equalsIndex);
        const value = arg.substring(equalsIndex + 1);
        
        if (key === 'stacks') {
          options[key] = value.split(',');
        } else if (key === 'start' || key === 'end') {
          const num = parseInt(value, 10);
          if (isNaN(num)) {
            throw new Error(`Invalid value for ${key}: ${value}. Expected a number.`);
          }
          options[key] = num;
        } else if (key === 'plugin-timeout') {
          const num = parseInt(value, 10);
          if (isNaN(num) || num <= 0) {
            throw new Error(`Invalid value for ${key}: ${value}. Expected a positive integer.`);
          }
          options[key] = num;
        } else if (key === 'retries') {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 0) {
            throw new Error(`Invalid value for ${key}: ${value}. Expected a non-negative integer.`);
          }
          options[key] = num;
        } else if (key === 'dry-run' || key === 'no-overwrite') {
          options[key] = value.toLowerCase() !== 'false';
        } else {
          options[key] = value;
        }
      } else {
        // --option format or --option value format
        const key = arg.substring(2);
        
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          // Next arg is a value
          const value = args[i + 1];
          if (key === 'stacks') {
            options[key] = value.split(',');
          } else if (key === 'start' || key === 'end') {
            const num = parseInt(value, 10);
            if (isNaN(num)) {
              throw new Error(`Invalid value for ${key}: ${value}. Expected a number.`);
            }
            options[key] = num;
          } else if (key === 'plugin-timeout') {
            const num = parseInt(value, 10);
            if (isNaN(num) || num <= 0) {
              throw new Error(`Invalid value for ${key}: ${value}. Expected a positive integer.`);
            }
            options[key] = num;
          } else if (key === 'retries') {
            const num = parseInt(value, 10);
            if (isNaN(num) || num < 0) {
              throw new Error(`Invalid value for ${key}: ${value}. Expected a non-negative integer.`);
            }
            options[key] = num;
          } else {
            options[key] = value;
          }
          i++; // Skip the next argument since we used it as a value
        } else {
          // Boolean flag
          options[key] = true;
        }
      }
    }
  }

  return options;
}

/**
 * Get all prompt files from stacks.
 * @param {string[]} stacks - Array of stack names
 * @param {string} workdir - Working directory
 * @param {number|null} start - Starting stage number
 * @param {number|null} end - Ending stage number
 * @returns {Promise<Array<{stack: string, file: string, number: number}>>} Sorted prompt files
 */
async function getPromptFiles(stacks, workdir, start, end) {
  const results = [];

  for (const stack of stacks) {
    const stackDir = path.join(workdir, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        if (file.match(/^\d+_.*\.md$/)) {
          const number = parseInt(file.split('_')[0], 10);
          
          // Filter by start and end if provided
          if ((start === null || number >= start) && 
              (end === null || number <= end)) {
            results.push({
              stack,
              file: path.join(stackDir, file),
              number
            });
          }
        }
      }
    } catch (err) {
      log.error(`Error reading stack directory ${stackDir}: ${err.message}`);
      throw err;
    }
  }

  // Sort by number
  results.sort((a, b) => a.number - b.number);
  return results;
}

/**
 * Load static plugins for a stack.
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{name: string, content: string}>>} Static plugins
 */
async function loadStaticPlugins(stack, workdir) {
  const plugins = [];
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  
  try {
    const files = await fs.readdir(pluginsDir);
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        try {
          const content = await fs.readFile(path.join(pluginsDir, file), 'utf-8');
          plugins.push({
            name: file,
            content
          });
          log.info(`Loaded static plugin: ${stack}/plugins/${file}`);
        } catch (err) {
          log.error(`Error loading static plugin ${file}: ${err.message}`);
        }
      }
    }
    
    // Sort plugins alphabetically
    plugins.sort((a, b) => a.name.localeCompare(b.name));
    
  } catch (err) {
    // It's okay if the plugins directory doesn't exist
    if (err.code !== 'ENOENT') {
      log.error(`Error reading plugins directory for ${stack}: ${err.message}`);
    }
  }
  
  return plugins;
}

/**
 * Load dynamic plugins for a stack.
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{name: string, fn: Function}>>} Dynamic plugins
 */
async function loadDynamicPlugins(stack, workdir) {
  const plugins = [];
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  
  try {
    const files = await fs.readdir(pluginsDir);
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const pluginPath = path.join(pluginsDir, file);
          // Use require to load the plugin
          const plugin = require(pluginPath);
          
          if (typeof plugin === 'function') {
            plugins.push({
              name: file,
              fn: plugin
            });
            log.info(`Loaded dynamic plugin: ${stack}/plugins/${file}`);
          } else {
            log.error(`Plugin ${file} does not export a function`);
          }
        } catch (err) {
          log.error(`Error loading dynamic plugin ${file}: ${err.message}`);
        }
      }
    }
    
    // Sort plugins alphabetically
    plugins.sort((a, b) => a.name.localeCompare(b.name));
    
  } catch (err) {
    // It's okay if the plugins directory doesn't exist
    if (err.code !== 'ENOENT') {
      log.error(`Error reading plugins directory for ${stack}: ${err.message}`);
    }
  }
  
  return plugins;
}

/**
 * Execute dynamic plugins with a timeout.
 * @param {Array<{name: string, fn: Function}>} plugins - Dynamic plugins
 * @param {Object} context - Context object for plugins
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function executeDynamicPlugins(plugins, context, timeout) {
  for (const plugin of plugins) {
    log.debug(`Executing dynamic plugin: ${plugin.name}`);
    
    try {
      // Create a promise that times out
      const result = await Promise.race([
        plugin.fn(context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Plugin execution timed out')), timeout)
        )
      ]);
      
      log.debug(`Plugin ${plugin.name} executed successfully`);
      
      // If plugin returned a modified context, update our context
      if (result && typeof result === 'object') {
        Object.assign(context, result);
        log.debug(`Plugin ${plugin.name} returned modified context`);
      }
    } catch (err) {
      log.error(`Error executing plugin ${plugin.name}: ${err.message}`);
      // Continue with next plugin
    }
  }
}

/**
 * Build a prompt by reading a file and appending context.
 * @param {string} filePath - Path to the prompt file
 * @param {string} workdir - Working directory
 * @param {string} stack - Current stack name
 * @param {number} promptNumber - Current prompt number
 * @param {Object} config - Config object
 * @returns {Promise<string>} Complete prompt
 */
async function buildPrompt(filePath, workdir, stack, promptNumber, config) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    
    // Load static plugins
    const staticPlugins = await loadStaticPlugins(stack, workdir);
    
    // Append static plugin content to the prompt
    for (const plugin of staticPlugins) {
      content += `\n\n${plugin.content}`;
    }
    
    // Extract context files if specified
    const contextMatch = content.match(/## Context: (.*)/);
    let contextContent = '';
    
    if (contextMatch) {
      const contextFiles = contextMatch[1].split(',').map(f => f.trim());
      const outputDir = config.output || 'output';
      
      for (const contextFile of contextFiles) {
        try {
          const contextPath = path.join(workdir, outputDir, 'current', contextFile);
          const fileContent = await fs.readFile(contextPath, 'utf-8');
          contextContent += `\n\nFile: ${contextFile}\n\`\`\`\n${fileContent}\n\`\`\``;
        } catch (err) {
          log.warn(`Warning: Could not read context file ${contextFile}: ${err.message}`);
        }
      }
    }
    
    // Create context for dynamic plugins
    const pluginContext = {
      config: config,
      stack: stack,
      promptNumber: promptNumber,
      promptContent: content,
      workingDir: path.join(workdir, config.output || 'output', 'current')
    };
    
    // Load and execute dynamic plugins
    const dynamicPlugins = await loadDynamicPlugins(stack, workdir);
    
    if (dynamicPlugins.length > 0) {
      await executeDynamicPlugins(
        dynamicPlugins, 
        pluginContext, 
        config['plugin-timeout'] || 5000
      );
      
      // If plugins modified the prompt content, use that
      if (pluginContext.promptContent !== content) {
        log.debug('Prompt content modified by dynamic plugins');
        content = pluginContext.promptContent;
      }
    }
    
    return content + contextContent;
  } catch (err) {
    log.error(`Error building prompt from ${filePath}: ${err.message}`);
    throw err;
  }
}

/**
 * Process a prompt through the LLM API with retry logic.
 * @param {string} prompt - The prompt to send
 * @param {Object} options - API options
 * @returns {Promise<string>} LLM response
 */
async function processLlm(prompt, options) {
  if (options['dry-run']) {
    log.info('DRY RUN: Prompt would be sent to LLM API:');
    log.info('-------------------------------------------');
    log.logger(prompt);
    log.info('-------------------------------------------');
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options['api-key']) {
    throw new Error('API key is required for LLM API calls');
  }

  const apiUrl = options['api-url'];
  const apiKey = options['api-key'];
  const apiModel = options['api-model'];
  const retries = options['retries'] || 0;

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      attempt++;
      if (attempt > 1) {
        log.warn(`Retry attempt ${attempt - 1} of ${retries}`);
      }
      
      log.info(`Sending prompt to ${apiUrl} using model ${apiModel}...`);
      
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: apiModel,
          messages: [
            { 
              role: 'system', 
              content: 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.'
            },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorData}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      lastError = err;
      if (attempt <= retries) {
        log.warn(`API request failed: ${err.message}. Retrying...`);
      }
    }
  }

  // If we got here, all retries failed
  log.error(`Error processing prompt with LLM API after ${retries + 1} attempts`);
  throw lastError;
}

/**
 * Parse LLM response to extract file content.
 * @param {string} response - LLM response
 * @returns {Array<{path: string, content: string}>} Parsed files
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
 * Check if files would be overwritten if --no-overwrite is set.
 * @param {Array<{path: string, content: string}>} files - Files to check
 * @param {string} workdir - Working directory
 * @param {boolean} noOverwrite - Whether overwriting is disabled
 * @param {string} outputDir - Output directory
 * @returns {Promise<boolean>} True if overwriting would occur and is disabled
 */
async function checkOverwrite(files, workdir, noOverwrite, outputDir) {
  if (!noOverwrite) {
    return false;
  }
  
  outputDir = outputDir || 'output';
  
  for (const file of files) {
    const filePath = path.join(workdir, outputDir, 'current', file.path);
    try {
      await fs.access(filePath);
      log.error(`Error: File ${file.path} already exists and --no-overwrite is set.`);
      return true;
    } catch (err) {
      // File doesn't exist, which is what we want
    }
  }
  
  return false;
}

/**
 * Write generated files to output directories.
 * @param {Array<{path: string, content: string}>} files - Files to write
 * @param {string} workdir - Working directory
 * @param {string} stack - Current stack name
 * @param {string} promptFile - Current prompt file name
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
async function writeFiles(files, workdir, stack, promptFile, outputDir) {
  outputDir = outputDir || 'output';
  const promptName = path.basename(promptFile, '.md');
  
  for (const file of files) {
    // Write to output/current/
    const currentPath = path.join(workdir, outputDir, 'current', file.path);
    const currentDir = path.dirname(currentPath);
    
    // Write to output/stacks/stack/promptName/
    const stackPath = path.join(workdir, outputDir, 'stacks', stack, promptName, file.path);
    const stackDir = path.dirname(stackPath);
    
    try {
      // Create directories if they don't exist
      await fs.mkdir(currentDir, { recursive: true });
      await fs.mkdir(stackDir, { recursive: true });
      
      // Write files
      await fs.writeFile(currentPath, file.content);
      await fs.writeFile(stackPath, file.content);
      
      log.success(`Written: ${file.path}`);
    } catch (err) {
      log.error(`Error writing file ${file.path}: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Prepare the output/current directory based on the start parameter.
 * @param {Object} options - CLI options
 * @returns {Promise<void>}
 */
async function prepareCurrentDirectory(options) {
  const workdir = options.workdir;
  const outputDir = options.output || 'output';
  const currentDir = path.join(workdir, outputDir, 'current');
  const bootstrapDir = path.join(workdir, outputDir, 'bootstrap');
  
  // Clear and recreate current directory
  try {
    await fs.rm(currentDir, { recursive: true, force: true });
    await fs.mkdir(currentDir, { recursive: true });
    
    // Copy bootstrap files first
    await copyDirectory(bootstrapDir, currentDir);
    log.info(`Copied bootstrap files to ${outputDir}/current/`);
    
    // If start is specified, copy files from previous prompts
    if (options.start !== null) {
      const promptFiles = await getPromptFiles(options.stacks, workdir, null, options.start - 1);
      
      for (const prompt of promptFiles) {
        const promptName = path.basename(prompt.file, '.md');
        const stackOutputDir = path.join(workdir, outputDir, 'stacks', prompt.stack, promptName);
        
        try {
          await copyDirectory(stackOutputDir, currentDir);
          log.info(`Copied files from ${prompt.stack}/${promptName} to ${outputDir}/current/`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }
          // Skip if directory doesn't exist
        }
      }
    }
  } catch (err) {
    log.error(`Error preparing current directory: ${err.message}`);
    throw err;
  }
}

/**
 * Helper function to copy a directory recursively.
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @returns {Promise<void>}
 */
async function copyDirectory(src, dest) {
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Source directory doesn't exist, just return
      return;
    }
    throw err;
  }
}

/**
 * Run tests using the provided test command.
 * @param {string|null} testCmd - Test command to execute
 * @param {string} workdir - Working directory
 * @returns {boolean} True if tests pass
 */
function runTests(testCmd, workdir) {
  if (!testCmd) {
    return true;
  }
  
  try {
    log.info(`Running tests: ${testCmd}`);
    execSync(testCmd, { 
      cwd: workdir, 
      stdio: 'inherit' 
    });
    log.success('Tests passed');
    return true;
  } catch (err) {
    log.error(`Tests failed: ${err.message}`);
    return false;
  }
}

/**
 * Main function to orchestrate the entire process.
 * @param {string[]} args - Process argv array
 * @returns {Promise<void>}
 */
async function main(args) {
  try {
    // Load vibec.json if it exists
    let configFile = null;
    try {
      configFile = await loadConfigFile(process.env.VIBEC_WORKDIR || '.');
      if (configFile) {
        log.info('Loaded configuration from vibec.json');
        log.debug('Config: ' + JSON.stringify(configFile, null, 2));
      }
    } catch (err) {
      log.error(`Error loading vibec.json: ${err.message}`);
      throw err;
    }

    const options = parseArgs(args, process.env, configFile);

    // Handle special flags
    if (options.help) {
      showHelp();
      return;
    }
    
    if (options.version) {
      showVersion();
      return;
    }
    
    log.info('Starting LLM code generation process...');
    log.debug('Options: ' + JSON.stringify(options, null, 2));
    
    // Prepare output/current directory
    await prepareCurrentDirectory(options);
    
    // Get prompt files
    const promptFiles = await getPromptFiles(
      options.stacks, 
      options.workdir, 
      options.start, 
      options.end
    );
    
    log.info(`Found ${promptFiles.length} prompt files to process.`);
    
    for (const [index, promptFile] of promptFiles.entries()) {
      log.info(`\nProcessing [${index+1}/${promptFiles.length}]: ${promptFile.stack}/${path.basename(promptFile.file)}`);
      
      // Build prompt with plugin support
      const prompt = await buildPrompt(
        promptFile.file, 
        options.workdir, 
        promptFile.stack, 
        promptFile.number,
        options
      );
      
      // Process with LLM
      const response = await processLlm(prompt, options);
      
      // Parse response
      const files = parseResponse(response);
      log.info(`Extracted ${files.length} files from LLM response.`);
      
      // Check for overwrites
      const wouldOverwrite = await checkOverwrite(
        files, 
        options.workdir, 
        options['no-overwrite'],
        options.output
      );
      
      if (wouldOverwrite) {
        throw new Error('File overwrite prevented by --no-overwrite flag.');
      }
      
      // Write files
      await writeFiles(
        files, 
        options.workdir, 
        promptFile.stack, 
        path.basename(promptFile.file),
        options.output
      );
      
      // Run tests
      if (options['test-cmd']) {
        const testsPassed = runTests(options['test-cmd'], options.workdir);
        if (!testsPassed) {
          throw new Error('Tests failed, stopping execution.');
        }
      }
    }
    
    log.success('\nCode generation completed successfully.');
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Execute main if script is run directly
if (require.main === module) {
  main(process.argv);
}

module.exports = {
  log,
  parseArgs,
  getPromptFiles,
  buildPrompt,
  loadStaticPlugins,
  loadDynamicPlugins,
  executeDynamicPlugins,
  processLlm,
  parseResponse,
  checkOverwrite,
  writeFiles,
  prepareCurrentDirectory,
  copyDirectory,
  runTests,
  main,
  showHelp,
  showVersion,
  loadConfigFile,
  processEnvVars,
  processConfigFile
};