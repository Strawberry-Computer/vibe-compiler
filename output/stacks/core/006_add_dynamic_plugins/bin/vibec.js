#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * Colored logging utility
 */
export const log = {
  // Default logger
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

  info: function(message, ...args) {
    this.logger(`${this.colors.cyan}${message}${this.colors.reset}`, ...args);
  },

  warn: function(message, ...args) {
    this.logger(`${this.colors.yellow}${message}${this.colors.reset}`, ...args);
  },

  error: function(message, ...args) {
    this.logger(`${this.colors.red}${message}${this.colors.reset}`, ...args);
  },

  success: function(message, ...args) {
    this.logger(`${this.colors.green}${message}${this.colors.reset}`, ...args);
  },

  debug: function(message, ...args) {
    if (process.env.VIBEC_DEBUG) {
      this.logger(`${this.colors.magenta}${message}${this.colors.reset}`, ...args);
    }
  }
};

/**
 * Load vibec.json configuration file
 * @param {string} workdir - Working directory
 * @returns {Promise<Object|null>} - Parsed config or null if no file found
 */
export async function loadConfigFile(workdir) {
  // PROMPT: "Load `vibec.json` from root if present, parse as JSON."
  const configPath = path.join(workdir, 'vibec.json');
  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    try {
      // PROMPT: "IMPORTANT: Throw error if malformed JSON."
      return JSON.parse(configContent);
    } catch (parseError) {
      throw new Error(`Failed to parse vibec.json: ${parseError.message}`);
    }
  } catch (error) {
    // PROMPT: "Don't throw error when no config file is present."
    if (error.code === 'ENOENT') {
      return null;
    }
    // PROMPT: "Let errors propagate"
    throw error;
  }
}

/**
 * Convert config keys to CLI option format
 * @param {Object} config - Configuration object
 * @returns {Object} - Formatted configuration
 */
export function formatConfigKeys(config) {
  // PROMPT: "Merge options with existing CLI args and env vars, using defaults only for unset values."
  if (!config) return {};
  
  const formattedConfig = {};
  
  // Map camelCase config keys to kebab-case CLI options
  const keyMap = {
    workdir: 'workdir',
    stacks: 'stacks',
    dryRun: 'dry-run',
    start: 'start',
    end: 'end',
    apiUrl: 'api-url',
    apiKey: 'api-key',
    apiModel: 'api-model',
    testCmd: 'test-cmd',
    retries: 'retries',
    pluginTimeout: 'plugin-timeout',
    output: 'output',
    // PROMPT: "Add config options: `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`."
    iterations: 'iterations'
  };
  
  for (const [configKey, cliKey] of Object.entries(keyMap)) {
    if (config[configKey] !== undefined) {
      formattedConfig[cliKey] = config[configKey];
    }
  }
  
  return formattedConfig;
}

/**
 * Parse environment variables into options
 * @param {Object} env - Environment variables
 * @returns {Object} - Options from environment
 */
export function parseEnvVars(env) {
  // PROMPT: "Merge options with existing CLI args and env vars, using defaults only for unset values."
  const options = {};
  
  if (env.VIBEC_WORKDIR) options.workdir = env.VIBEC_WORKDIR;
  
  // PROMPT: "Convert `VIBEC_STACKS` to array if string."
  if (env.VIBEC_STACKS) {
    options.stacks = env.VIBEC_STACKS.split(',').map(s => s.trim());
  }
  
  if (env.VIBEC_DRY_RUN !== undefined) {
    options['dry-run'] = env.VIBEC_DRY_RUN.toLowerCase() === 'true';
  }
  
  if (env.VIBEC_START) options.start = parseInt(env.VIBEC_START, 10);
  if (env.VIBEC_END) options.end = parseInt(env.VIBEC_END, 10);
  if (env.VIBEC_API_URL) options['api-url'] = env.VIBEC_API_URL;
  if (env.VIBEC_API_KEY) options['api-key'] = env.VIBEC_API_KEY;
  if (env.VIBEC_API_MODEL) options['api-model'] = env.VIBEC_API_MODEL;
  if (env.VIBEC_TEST_CMD) options['test-cmd'] = env.VIBEC_TEST_CMD;
  
  if (env.VIBEC_PLUGIN_TIMEOUT) {
    options['plugin-timeout'] = parseInt(env.VIBEC_PLUGIN_TIMEOUT, 10);
  }
  
  if (env.VIBEC_RETRIES) options.retries = parseInt(env.VIBEC_RETRIES, 10);
  if (env.VIBEC_OUTPUT) options.output = env.VIBEC_OUTPUT;
  
  // PROMPT: "Add config options: `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`."
  if (env.VIBEC_ITERATIONS) options.iterations = parseInt(env.VIBEC_ITERATIONS, 10);
  
  return options;
}

/**
 * Validate options
 * @param {Object} options - Options to validate
 */
export function validateOptions(options) {
  // PROMPT: "Validate: `retries` ≥ 0, `pluginTimeout` > 0, log errors with `log` utility."
  if (options.retries !== undefined && (isNaN(options.retries) || options.retries < 0)) {
    log.error(`Invalid retries value: ${options.retries}. Must be a non-negative integer.`);
    throw new Error(`Invalid retries value: ${options.retries}. Must be a non-negative integer.`);
  }
  
  if (options['plugin-timeout'] !== undefined && 
      (isNaN(options['plugin-timeout']) || options['plugin-timeout'] <= 0)) {
    log.error(`Invalid pluginTimeout value: ${options['plugin-timeout']}. Must be a positive integer.`);
    throw new Error(`Invalid pluginTimeout value: ${options['plugin-timeout']}. Must be a positive integer.`);
  }
  
  // PROMPT: "Add config options: `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`."
  if (options.iterations !== undefined && (isNaN(options.iterations) || options.iterations < 1)) {
    log.error(`Invalid iterations value: ${options.iterations}. Must be a positive integer.`);
    throw new Error(`Invalid iterations value: ${options.iterations}. Must be a positive integer.`);
  }
}

/**
 * Parse command line arguments and merge with environment and config
 * @param {string[]} argv - Command line arguments
 * @param {Object} env - Environment variables
 * @param {Object} configFile - Config file content
 * @returns {Object} Merged options
 */
export function parseArgs(argv, env = process.env, configFile = null) {
  // PROMPT: "Update `parseArgs` to handle `vibec.json` and merge with CLI and env vars. It should take `process.env` and `vibecJson` as arguments in addition to `process.argv`."
  
  // Default options
  const defaults = {
    workdir: '.',
    stacks: ['core'],
    'dry-run': false,
    start: null,
    end: null,
    'api-url': 'https://openrouter.ai/api/v1',
    'api-key': null,
    'api-model': 'anthropic/claude-3.7-sonnet',
    'test-cmd': null,
    retries: 0,
    'plugin-timeout': 5000,
    output: 'output',
    help: false,
    version: false,
    // PROMPT: "Add config options: `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`."
    iterations: 2
  };

  // Get options from config file
  const configOptions = formatConfigKeys(configFile);
  
  // Get options from environment variables
  const envOptions = parseEnvVars(env);
  
  // Parse command line arguments
  const cliOptions = {};
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    // Handle --option=value syntax
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=');
      
      if (key === 'retries') {
        const retries = parseInt(value, 10);
        if (isNaN(retries) || retries < 0) {
          throw new Error(`Invalid retries value: ${value}. Must be a non-negative integer.`);
        }
        cliOptions[key] = retries;
      } else if (key === 'stacks') {
        cliOptions[key] = value.split(',');
      } else if (key === 'dry-run') {
        cliOptions[key] = value.toLowerCase() !== 'false';
      } else if (key === 'start' || key === 'end') {
        cliOptions[key] = value ? parseInt(value, 10) : null;
      } else if (key === 'plugin-timeout') {
        const timeout = parseInt(value, 10);
        if (isNaN(timeout) || timeout <= 0) {
          throw new Error(`Invalid plugin-timeout value: ${value}. Must be a positive integer.`);
        }
        cliOptions[key] = timeout;
      // PROMPT: "Add config options: `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`."
      } else if (key === 'iterations') {
        const iterations = parseInt(value, 10);
        if (isNaN(iterations) || iterations < 1) {
          throw new Error(`Invalid iterations value: ${value}. Must be a positive integer.`);
        }
        cliOptions[key] = iterations;
      } else {
        cliOptions[key] = value;
      }
    }
    // Handle --option value syntax
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      
      if (key === 'help' || key === 'version') {
        cliOptions[key] = true;
        continue;
      }
      
      if (key === 'dry-run') {
        cliOptions[key] = true;
        continue;
      }
      
      // Check if there's a next argument and it doesn't start with --
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        const value = argv[i + 1];
        i++; // Skip the next argument since we've consumed it
        
        if (key === 'retries') {
          const retries = parseInt(value, 10);
          if (isNaN(retries) || retries < 0) {
            throw new Error(`Invalid retries value: ${value}. Must be a non-negative integer.`);
          }
          cliOptions[key] = retries;
        } else if (key === 'plugin-timeout') {
          const timeout = parseInt(value, 10);
          if (isNaN(timeout) || timeout <= 0) {
            throw new Error(`Invalid plugin-timeout value: ${value}. Must be a positive integer.`);
          }
          cliOptions[key] = timeout;
        // PROMPT: "Add config options: `iterations`: Number, the number of times a stage should be executed to try to resolve test failures. Default: `2`."
        } else if (key === 'iterations') {
          const iterations = parseInt(value, 10);
          if (isNaN(iterations) || iterations < 1) {
            throw new Error(`Invalid iterations value: ${value}. Must be a positive integer.`);
          }
          cliOptions[key] = iterations;
        } else if (key === 'stacks') {
          cliOptions[key] = value.split(',');
        } else if (key === 'start' || key === 'end') {
          cliOptions[key] = value ? parseInt(value, 10) : null;
        } else {
          cliOptions[key] = value;
        }
      } else {
        // Flag without value
        cliOptions[key] = true;
      }
    }
  }
  
  // Merge options with priority: CLI > env > config > defaults
  const mergedOptions = {
    ...defaults,
    ...configOptions,
    ...envOptions,
    ...cliOptions
  };
  
  // Validate the merged options
  validateOptions(mergedOptions);
  
  return mergedOptions;
}

/**
 * Show the help message
 */
export function showHelp() {
  console.log(`
Usage: vibec [options]

Options:
  --workdir=<dir>         Working directory (default: .)
  --stacks=<stack1,stack2> Stacks to process (default: core)
  --dry-run               Run without making actual API calls or file changes
  --start=<number>        Start processing from this prompt number
  --end=<number>          End processing at this prompt number
  --api-url=<url>         API URL (default: https://openrouter.ai/api/v1)
  --api-key=<key>         API key for LLM service
  --api-model=<model>     API model to use (default: anthropic/claude-3.7-sonnet)
  --test-cmd=<command>    Command to run tests
  --retries=<number>      Number of retries for failed LLM requests (default: 0)
  --plugin-timeout=<ms>   Timeout for plugins in milliseconds (default: 5000)
  --output=<dir>          Output directory (default: output)
  --iterations=<number>   Number of times to retry a stage on test failure (default: 2)
  --help                  Show this help message and exit
  --version               Show version information and exit
  `);
}

/**
 * Show the version information
 */
export async function showVersion() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    console.log(`vibec v${packageJson.version}`);
  } catch (error) {
    console.error('Error reading version information:', error.message);
    process.exit(1);
  }
}

/**
 * Get prompt files from stacks
 * @param {string} workdir - Working directory
 * @param {string[]} stacks - Stack names to scan
 * @returns {Promise<Array<{stack: string, file: string, number: number}>>} Prompt files
 */
export async function getPromptFiles(workdir, stacks) {
  const results = [];

  for (const stack of stacks) {
    const stackDir = path.join(workdir, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (match) {
          results.push({
            stack,
            file: path.join(stackDir, file),
            number: parseInt(match[1], 10)
          });
        }
      }
    } catch (error) {
      log.error(`Error reading stack directory ${stackDir}:`, error);
      throw error;
    }
  }

  return results.sort((a, b) => a.number - b.number);
}

/**
 * Execute a JavaScript plugin asynchronously with timeout
 * @param {string} pluginPath - Path to JS plugin file
 * @param {Object} context - Context object for the plugin
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
// PROMPT: "Execute as async functions in alphabetical order with 5000ms timeout (configurable via `--plugin-timeout`)."
export async function executeJsPlugin(pluginPath, context, timeout) {
  try {
    log.debug(`Executing JS plugin: ${pluginPath}`);
    
    // Create a promise that resolves when the plugin completes or rejects on timeout
    const pluginPromise = (async () => {
      try {
        const module = await import(`file://${pluginPath}`);
        if (typeof module.default === 'function') {
          return await module.default(context);
        } else {
          throw new Error(`Plugin ${pluginPath} does not export a default function`);
        }
      } catch (error) {
        throw error;
      }
    })();
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Plugin execution timed out after ${timeout}ms`)), timeout);
    });
    
    // Race the plugin execution against the timeout
    await Promise.race([pluginPromise, timeoutPromise]);
    
    log.debug(`Successfully executed JS plugin: ${pluginPath}`);
  } catch (error) {
    // PROMPT: "On plugin error: - log with `log.error` - skip plugin - continue execution."
    log.error(`Error executing JS plugin ${pluginPath}: ${error.message}`);
    // We don't rethrow the error to allow execution to continue
  }
}

/**
 * Load plugins for a stack
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {number} pluginTimeout - Plugin execution timeout in ms
 * @param {Object} config - Configuration object
 * @param {number} promptNumber - Current prompt number
 * @param {string} promptContent - Content of the current prompt
 * @returns {Promise<string>} Concatenated plugin content
 */
export async function loadPlugins(workdir, stack, pluginTimeout = 5000, config = null, promptNumber = null, promptContent = '') {
  // PROMPT: "Add dynamic (`.js`) plugin support to `bin/vibec.js`"
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  let pluginContent = '';
  
  try {
    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      // No plugins directory, return empty string
      return '';
    }
    
    // Get all plugin files (.md and .js) in the plugins directory
    const files = await fs.readdir(pluginsDir);
    
    // PROMPT: "Scan for `.js` files"
    const mdPluginFiles = files.filter(file => file.endsWith('.md')).sort();
    const jsPluginFiles = files.filter(file => file.endsWith('.js')).sort();
    
    if (mdPluginFiles.length === 0 && jsPluginFiles.length === 0) {
      return '';
    }
    
    // Load each .md plugin and append content
    for (const file of mdPluginFiles) {
      const filePath = path.join(pluginsDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      pluginContent += `\n\n${content}`;
      log.info(`Loaded plugin: ${stack}/${file}`);
    }
    
    // PROMPT: "Context object: { config: vibec.json, stack: string, promptNumber: int, promptContent: string, workingDir: output/current path }"
    if (jsPluginFiles.length > 0) {
      // Create context object for JS plugins
      const pluginContext = {
        config: config,
        stack: stack,
        promptNumber: promptNumber,
        promptContent: promptContent,
        workingDir: path.join(workdir, 'output', 'current')
      };
      
      // PROMPT: "Execute as async functions in alphabetical order with 5000ms timeout"
      for (const file of jsPluginFiles) {
        const filePath = path.join(pluginsDir, file);
        log.info(`Loaded JS plugin: ${stack}/${file}`);
        
        // Execute JS plugin
        await executeJsPlugin(filePath, pluginContext, pluginTimeout);
      }
    }
    
    return pluginContent;
  } catch (error) {
    log.warn(`Warning: Error loading plugins for stack ${stack}:`, error.message);
    return '';
  }
}

/**
 * Build a prompt from a file and context
 * @param {string} filePath - Path to prompt file
 * @param {string} workdir - Working directory
 * @param {string} outputDir - Output directory
 * @param {number} pluginTimeout - Plugin execution timeout in ms
 * @param {string} testOutput - Test output to include in the prompt
 * @param {Object} config - Configuration object
 * @returns {Promise<string>} Assembled prompt
 */
export async function buildPrompt(filePath, workdir, outputDir, pluginTimeout = 5000, testOutput = '', config = null) {
  const promptContent = await fs.readFile(filePath, 'utf8');
  
  // Extract context files
  const contextMatch = promptContent.match(/## Context: (.+)/);
  let contextContent = '';
  
  if (contextMatch) {
    const contextFiles = contextMatch[1].split(',').map(f => f.trim());
    
    for (const file of contextFiles) {
      try {
        const currentFilePath = path.join(workdir, outputDir, 'current', file);
        const fileContent = await fs.readFile(currentFilePath, 'utf8');
        contextContent += `\nFile: ${file}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
      } catch (error) {
        log.warn(`Warning: Could not read context file ${file}:`, error.message);
      }
    }
  }
  
  // Get the stack name from filePath
  const stackMatch = filePath.match(/stacks\/([^/]+)\//);
  let pluginContent = '';
  
  // Extract prompt number from filePath
  const promptNumberMatch = path.basename(filePath).match(/^(\d+)_/);
  const promptNumber = promptNumberMatch ? parseInt(promptNumberMatch[1], 10) : null;
  
  if (stackMatch) {
    const stack = stackMatch[1];
    // PROMPT: "Execute as async functions in alphabetical order with 5000ms timeout (configurable via `--plugin-timeout`)."
    pluginContent = await loadPlugins(workdir, stack, pluginTimeout, config, promptNumber, promptContent);
  }

  // Assemble prompt sandwich
  const systemMessage = 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.';
  
  let testOutputContent = '';
  if (testOutput) {
    testOutputContent = `\n\n## Test Output\nThe previous implementation failed with this test output:\n\`\`\`\n${testOutput}\n\`\`\`\nPlease fix the issues in your implementation.`;
  }
  
  return `${systemMessage}\n\n${promptContent}${pluginContent}${testOutputContent}\n\n${contextContent}\n\n${systemMessage}\n\n${promptContent}${pluginContent}${testOutputContent}`;
}

/**
 * Process a prompt through the LLM API
 * @param {string} prompt - Prompt to send to LLM
 * @param {Object} options - Options for LLM API
 * @returns {Promise<string>} LLM response
 */
export async function processLlm(prompt, options) {
  if (options['dry-run']) {
    log.info('--- DRY RUN MODE ---');
    log.info('Prompt:', prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options['api-key']) {
    throw new Error('API key is required for LLM processing');
  }

  const apiUrl = options['api-url'];
  const apiKey = options['api-key'];
  const model = options['api-model'];
  const maxRetries = options.retries;

  log.info(`Sending request to ${apiUrl} with model ${model}`);

  let retries = 0;
  while (true) {
    try {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
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
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      retries++;
      if (retries <= maxRetries) {
        log.warn(`Attempt ${retries}/${maxRetries} failed. Retrying...`);
        // Add exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        log.error('Error processing LLM request after retries:', error);
        throw error;
      }
    }
  }
}

/**
 * Parse LLM response to extract files
 * @param {string} response - LLM response
 * @returns {Array<{path: string, content: string}>} Extracted files
 */
export function parseResponse(response) {
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
 * Run tests with the provided command
 * @param {string} testCmd - Test command to run
 * @returns {Promise<{success: boolean, output: string}>} Test result and output
 */
export function runTests(testCmd) {
  if (!testCmd) return { success: true, output: '' };
  
  log.info(`Running tests: ${testCmd}`);
  
  return new Promise((resolve) => {
    // Split command into command and args
    const cmdParts = testCmd.split(' ');
    const cmd = cmdParts[0];
    const args = cmdParts.slice(1);
    
    const process = spawn(cmd, args, { shell: true });
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      const success = code === 0;
      const output = stdout + stderr;
      
      if (success) {
        log.success('Tests completed successfully');
      } else {
        log.error('Tests failed with code:', code);
      }
      
      resolve({ success, output });
    });
  });
}

/**
 * Write files to output directories
 * @param {Array<{path: string, content: string}>} files - Files to write
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {number} promptNumber - Prompt number
 * @param {string} promptFile - Prompt file name
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
export async function writeFiles(files, workdir, stack, promptNumber, promptFile, outputDir) {
  const promptName = path.basename(promptFile, '.md');
  const stackOutputDir = path.join(workdir, outputDir, 'stacks', stack, promptName);
  
  // Ensure directories exist
  await fs.mkdir(stackOutputDir, { recursive: true });
  
  for (const file of files) {
    const filePath = file.path;
    const content = file.content;
    
    // Write to stack-specific output directory
    const stackFilePath = path.join(stackOutputDir, filePath);
    await fs.mkdir(path.dirname(stackFilePath), { recursive: true });
    await fs.writeFile(stackFilePath, content);
    
    // Write to current directory
    const currentFilePath = path.join(workdir, outputDir, 'current', filePath);
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    await fs.writeFile(currentFilePath, content);
    
    log.success(`Wrote file: ${filePath}`);
  }
}

/**
 * Initialize the output/current directory with bootstrap files
 * @param {string} workdir - Working directory
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
export async function initializeOutputCurrent(workdir, outputDir) {
  const bootstrapDir = path.join(workdir, outputDir, 'bootstrap');
  const currentDir = path.join(workdir, outputDir, 'current');
  
  // Create current directory if it doesn't exist
  await fs.mkdir(currentDir, { recursive: true });
  
  try {
    // Clear current directory
    const currentFiles = await fs.readdir(currentDir, { recursive: true });
    for (const file of currentFiles) {
      const filePath = path.join(currentDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        await fs.unlink(filePath);
      }
    }
    
    // Copy bootstrap files to current directory
    await copyDirectory(bootstrapDir, currentDir);
    log.success('Initialized output/current with bootstrap files');
  } catch (error) {
    log.error('Error initializing output/current:', error);
    throw error;
  }
}

/**
 * Copy files from one directory to another
 * @param {string} sourceDir - Source directory
 * @param {string} targetDir - Target directory
 * @returns {Promise<void>}
 */
export async function copyDirectory(sourceDir, targetDir) {
  try {
    // Check if source directory exists
    try {
      await fs.access(sourceDir);
    } catch {
      log.info(`Source directory ${sourceDir} does not exist, skipping copy operation.`);
      return;
    }
    
    // Create target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });
    
    // Read all files and directories from source
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursive copy for directories
        await copyDirectory(sourcePath, targetPath);
      } else {
        // Copy file
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  } catch (error) {
    log.error(`Error copying directory from ${sourceDir} to ${targetDir}:`, error);
    throw error;
  }
}

/**
 * Copy generated files from stacks to output/current up to a specific stage
 * @param {string} workdir - Working directory
 * @param {number} startStage - Stage to start from
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
export async function copyGeneratedFiles(workdir, startStage, outputDir) {
  if (!startStage) return;

  try {
    const stacksDir = path.join(workdir, outputDir, 'stacks');
    const stacks = await fs.readdir(stacksDir);

    for (const stack of stacks) {
      const stackDir = path.join(stacksDir, stack);
      const stackStat = await fs.stat(stackDir);
      
      if (!stackStat.isDirectory()) continue;
      
      const promptDirs = await fs.readdir(stackDir);
      
      for (const promptDir of promptDirs) {
        const match = promptDir.match(/^(\d+)_/);
        if (match) {
          const promptNumber = parseInt(match[1], 10);
          
          if (promptNumber < startStage) {
            const sourceDir = path.join(stackDir, promptDir);
            const currentDir = path.join(workdir, outputDir, 'current');
            
            await copyDirectory(sourceDir, currentDir);
            log.info(`Copied files from ${sourceDir} to ${outputDir}/current`);
          }
        }
      }
    }
  } catch (error) {
    log.error('Error copying generated files:', error);
    throw error;
  }
}

/**
 * Process a single prompt with iteration support
 * @param {Object} promptFile - Prompt file metadata
 * @param {Object} options - Application options
 * @param {Object} config - Configuration object
 * @returns {Promise<boolean>} Success status
 */
export async function processPromptWithIterations(promptFile, options, config) {
  log.info(`Processing: ${promptFile.file} (${promptFile.number})`);
  
  let testOutput = '';
  let iteration = 0;
  const maxIterations = options.iterations;
  
  while (iteration < maxIterations) {
    if (iteration > 0) {
      log.info(`Iteration ${iteration+1}/${maxIterations} for prompt ${promptFile.number}`);
    }
    
    // Build prompt with plugin timeout from options and test output if available
    const prompt = await buildPrompt(
      promptFile.file, 
      options.workdir, 
      options.output, 
      options['plugin-timeout'],
      testOutput,
      config
    );
    
    // Process with LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    log.info(`Extracted ${files.length} files from LLM response`);
    
    // Write files unless in dry-run mode
    if (!options['dry-run']) {
      await writeFiles(
        files, 
        options.workdir, 
        promptFile.stack, 
        promptFile.number, 
        path.basename(promptFile.file), 
        options.output
      );
      
      // Run tests if test command is provided
      if (options['test-cmd']) {
        const testResult = await runTests(options['test-cmd']);
        
        if (testResult.success) {
          log.success(`Prompt ${promptFile.number} processed successfully on iteration ${iteration+1}`);
          return true;
        } else {
          testOutput = testResult.output;
          
          if (iteration + 1 >= maxIterations) {
            log.error(`Failed to resolve test failures after ${maxIterations} iterations for prompt ${promptFile.number}`);
            return false;
          }
        }
      } else {
        // No tests to run, assume success
        return true;
      }
    } else {
      log.info('Dry run mode - files not written');
      return true;
    }
    
    iteration++;
  }
  
  return false;
}

/**
 * Main function
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<void>}
 */
export async function main(argv) {
  try {
    let vibecJson = null;
    try {
      vibecJson = await loadConfigFile('.');
      if (vibecJson) {
        log.info('Loaded configuration from vibec.json');
      }
    } catch (error) {
      log.error('Failed to load vibec.json:', error.message);
      throw error;
    }
    
    // Parse arguments with config and environment variables
    const options = parseArgs(argv, process.env, vibecJson);
    
    if (options.help) {
      showHelp();
      return;
    }
    
    if (options.version) {
      await showVersion();
      return;
    }
    
    log.info('Running with options:', JSON.stringify(options, null, 2));
    
    // Get prompt files within the specified range
    const promptFiles = await getPromptFiles(options.workdir, options.stacks);
    log.info(`Found ${promptFiles.length} prompt files across ${options.stacks.length} stacks`);
    
    // Filter prompt files based on start and end values
    const filteredPromptFiles = promptFiles.filter(file => {
      if (options.start !== null && file.number < options.start) return false;
      if (options.end !== null && file.number > options.end) return false;
      return true;
    });
    
    log.info(`Will process ${filteredPromptFiles.length} prompt files`);
    
    // Initialize output/current directory
    await initializeOutputCurrent(options.workdir, options.output);
    
    // Copy generated files if needed
    if (options.start) {
      await copyGeneratedFiles(options.workdir, options.start, options.output);
    }
    
    // Process each prompt file with iteration support
    let allSucceeded = true;
    for (const promptFile of filteredPromptFiles) {
      const success = await processPromptWithIterations(promptFile, options, vibecJson);
      if (!success) {
        allSucceeded = false;
        if (!options['dry-run']) {
          log.error(`Processing failed at prompt ${promptFile.number}`);
          process.exit(1);
        }
      }
    }
    
    if (allSucceeded) {
      log.success('Processing completed successfully');
    } else {
      log.error('Processing completed with errors');
      process.exit(1);
    }
  } catch (error) {
    log.error('Error:', error.message);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (process.argv[1] === import.meta.url.substring('file://'.length)) {
  main(process.argv).catch(error => {
    log.error('Error in main execution:', error);
    process.exit(1);
  });
}