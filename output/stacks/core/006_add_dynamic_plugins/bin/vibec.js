#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { execSync, spawn } from 'child_process';

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
 * Show usage information
 */
export function showUsage() {
  console.log(`
Usage: vibec [options]

Options:
  --help                Show this help message and exit
  --version             Show version information and exit
  --workdir=<dir>       Working directory (default: current directory)
  --stacks=<names>      Comma-separated list of stacks to process (default: core)
  --dry-run             Run without making changes (default: false)
  --start=<number>      Start from prompt number (default: None)
  --end=<number>        End at prompt number (default: None)
  --api-url=<url>       API URL for LLM (default: https://openrouter.ai/api/v1)
  --api-key=<key>       API Key for LLM
  --api-model=<model>   Model to use (default: anthropic/claude-3.7-sonnet)
  --test-cmd=<command>  Test command to run after processing
  --retries=<number>    Number of retry attempts (default: 0)
  --plugin-timeout=<ms> Plugin timeout in ms (default: 5000)
  --output=<dir>        Output directory (default: output)
  --iterations=<number> Number of times to run a stage on test failures (default: 2)
`);
}

/**
 * Show version information
 */
export function showVersion() {
  console.log('vibec v0.1.0'); // Replace with actual version
}

/**
 * Load vibec.json configuration file
 * @param {string} workdir - Working directory
 * @returns {Promise<Object|null>} Parsed configuration or null if not found
 */
export async function loadConfig(workdir) {
  const configPath = path.join(workdir, 'vibec.json');
  
  try {
    // Check if config file exists
    try {
      await fs.access(configPath);
    } catch {
      // No config file, return null
      return null;
    }
    
    // Read and parse config file
    const configContent = await fs.readFile(configPath, 'utf8');
    try {
      return JSON.parse(configContent);
    } catch (error) {
      throw new Error(`Failed to parse vibec.json: ${error.message}`);
    }
  } catch (error) {
    // Let errors propagate
    throw error;
  }
}

/**
 * Convert environment variables to options
 * @param {Object} env - Environment variables object
 * @returns {Object} Options derived from environment variables
 */
export function envToOptions(env) {
  const options = {};
  
  if (env.VIBEC_WORKDIR) options.workdir = env.VIBEC_WORKDIR;
  if (env.VIBEC_STACKS) options.stacks = env.VIBEC_STACKS.split(',').map(s => s.trim());
  if (env.VIBEC_DRY_RUN !== undefined) options.dryRun = env.VIBEC_DRY_RUN === 'true';
  if (env.VIBEC_START) options.start = parseInt(env.VIBEC_START, 10);
  if (env.VIBEC_END) options.end = parseInt(env.VIBEC_END, 10);
  if (env.VIBEC_API_URL) options.apiUrl = env.VIBEC_API_URL;
  if (env.VIBEC_API_KEY) options.apiKey = env.VIBEC_API_KEY;
  if (env.VIBEC_API_MODEL) options.apiModel = env.VIBEC_API_MODEL;
  if (env.VIBEC_TEST_CMD) options.testCmd = env.VIBEC_TEST_CMD;
  if (env.VIBEC_RETRIES) options.retries = parseInt(env.VIBEC_RETRIES, 10);
  if (env.VIBEC_PLUGIN_TIMEOUT) options.pluginTimeout = parseInt(env.VIBEC_PLUGIN_TIMEOUT, 10);
  if (env.VIBEC_OUTPUT) options.output = env.VIBEC_OUTPUT;
  if (env.VIBEC_ITERATIONS) options.iterations = parseInt(env.VIBEC_ITERATIONS, 10);
  
  return options;
}

/**
 * Convert config file to options
 * @param {Object} config - Config file content
 * @returns {Object} Options derived from config file
 */
export function configToOptions(config) {
  const options = {};
  
  if (config.workdir) options.workdir = config.workdir;
  if (config.stacks) options.stacks = config.stacks;
  if (config.dryRun !== undefined) options.dryRun = config.dryRun;
  if (config.start !== undefined) options.start = config.start;
  if (config.end !== undefined) options.end = config.end;
  if (config.apiUrl) options.apiUrl = config.apiUrl;
  if (config.apiKey) options.apiKey = config.apiKey;
  if (config.apiModel) options.apiModel = config.apiModel;
  if (config.testCmd) options.testCmd = config.testCmd;
  if (config.retries !== undefined) options.retries = config.retries;
  if (config.pluginTimeout) options.pluginTimeout = config.pluginTimeout;
  if (config.output) options.output = config.output;
  if (config.iterations !== undefined) options.iterations = config.iterations;
  
  return options;
}

/**
 * Adjust option keys for consistency
 * @param {Object} options - Options with possible variations in key format
 * @returns {Object} Options with consistent key format
 */
export function normalizeOptions(options) {
  const normalized = {};
  
  // Map to consistent keys
  const keyMap = {
    'dry-run': 'dryRun',
    'api-url': 'apiUrl',
    'api-key': 'apiKey',
    'api-model': 'apiModel',
    'test-cmd': 'testCmd',
    'plugin-timeout': 'pluginTimeout'
  };
  
  // Copy all values, normalizing keys
  for (const key in options) {
    const normalizedKey = keyMap[key] || key;
    normalized[normalizedKey] = options[key];
  }
  
  return normalized;
}

/**
 * Validate options
 * @param {Object} options - Options to validate
 * @returns {void} Throws error for invalid options
 */
export function validateOptions(options) {
  if (options.retries !== undefined && (isNaN(options.retries) || options.retries < 0)) {
    log.error('Invalid value for retries: must be a non-negative integer');
    throw new Error('Invalid value for retries: must be a non-negative integer');
  }
  
  if (options.pluginTimeout !== undefined && (isNaN(options.pluginTimeout) || options.pluginTimeout <= 0)) {
    log.error('Invalid value for pluginTimeout: must be a positive integer');
    throw new Error('Invalid value for pluginTimeout: must be a positive integer');
  }
  
  if (options.iterations !== undefined && (isNaN(options.iterations) || options.iterations < 1)) {
    log.error('Invalid value for iterations: must be a positive integer');
    throw new Error('Invalid value for iterations: must be a positive integer');
  }
}

/**
 * Parse command line arguments and merge with config and env vars
 * @param {string[]} argv - Command line arguments
 * @param {Object} env - Environment variables object
 * @param {Object|null} vibecJson - Parsed vibec.json or null if not available
 * @returns {Object} Merged and normalized options
 */
export function parseArgs(argv, env = {}, vibecJson = null) {
  // Default options
  const defaultOptions = {
    workdir: '.',
    stacks: ['core'],
    dryRun: false,
    start: null,
    end: null,
    apiUrl: 'https://openrouter.ai/api/v1',
    apiKey: null,
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
    retries: 0,
    pluginTimeout: 5000,
    output: 'output',
    iterations: 2
  };

  // Check for help or version flags first
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  
  if (argv.includes('--version') || argv.includes('-v')) {
    return { version: true };
  }
  
  // Parse CLI arguments
  const cliOptions = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    // Handle --option=value syntax
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=');
      
      if (key === 'stacks') {
        cliOptions[key] = value.split(',');
      } else if (key === 'dry-run') {
        cliOptions[key] = value.toLowerCase() !== 'false';
      } else if (key === 'start' || key === 'end') {
        cliOptions[key] = value ? parseInt(value, 10) : null;
      } else if (key === 'retries' || key === 'plugin-timeout' || key === 'iterations') {
        cliOptions[key] = parseInt(value, 10);
      } else {
        cliOptions[key] = value;
      }
    }
    // Handle --option value syntax
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      
      if (key === 'dry-run') {
        cliOptions[key] = true;
        continue;
      }
      
      // Check if there's a next argument and it doesn't start with --
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        const value = argv[i + 1];
        i++; // Skip the next argument since we've consumed it
        
        if (key === 'stacks') {
          cliOptions[key] = value.split(',');
        } else if (key === 'start' || key === 'end') {
          cliOptions[key] = value ? parseInt(value, 10) : null;
        } else if (key === 'retries' || key === 'plugin-timeout' || key === 'iterations') {
          cliOptions[key] = parseInt(value, 10);
        } else {
          cliOptions[key] = value;
        }
      } else {
        // Flag without value
        cliOptions[key] = true;
      }
    }
  }

  // Get options from environment variables
  const envOptions = envToOptions(env);
  
  // Get options from config file
  const configOptions = vibecJson ? configToOptions(vibecJson) : {};
  
  // Merge options with priority: CLI > env > config > defaults
  let mergedOptions = {
    ...defaultOptions,
    ...configOptions,
    ...envOptions,
    ...normalizeOptions(cliOptions)
  };

  // Validate options
  validateOptions(mergedOptions);
  
  return mergedOptions;
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
 * Load and execute dynamic JS plugins for a stack
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {Object} context - Context object for plugins
 * @param {number} pluginTimeout - Timeout for plugins in milliseconds
 * @returns {Promise<void>} 
 */
export async function executeJsPlugins(workdir, stack, context, pluginTimeout = 5000) {
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  
  try {
    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      // No plugins directory, return
      log.debug(`No plugins directory found for stack ${stack}`);
      return;
    }
    
    // Get all .js files in the plugins directory
    const files = await fs.readdir(pluginsDir);
    const jsPluginFiles = files
      .filter(file => file.endsWith('.js'))
      .sort(); // Sort alphabetically
    
    if (jsPluginFiles.length === 0) {
      log.debug(`No JS plugins found for stack ${stack}`);
      return;
    }
    
    // Execute each JS plugin
    for (const file of jsPluginFiles) {
      const filePath = path.join(pluginsDir, file);
      log.info(`Loading JS plugin: ${stack}/${file}`);
      
      try {
        // Import the plugin dynamically
        const pluginModule = await import(`file://${filePath}`);
        
        // Get the default export which should be a function
        const pluginFunc = pluginModule.default;
        
        if (typeof pluginFunc !== 'function') {
          log.error(`Plugin ${file} does not export a function as default export`);
          continue;
        }
        
        log.debug(`Executing plugin: ${stack}/${file}`);
        
        // Execute the plugin function with timeout
        const result = await Promise.race([
          pluginFunc(context),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Plugin execution timeout: ${file} (${pluginTimeout}ms)`)), pluginTimeout)
          )
        ]);
        
        log.debug(`Plugin ${file} executed successfully:`, result);
      } catch (error) {
        log.error(`Error executing plugin ${file}:`, error.message);
        // Skip this plugin but continue with others
      }
    }
  } catch (error) {
    log.error(`Error processing JS plugins for stack ${stack}:`, error.message);
  }
}

/**
 * Load plugins for a stack
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {number} pluginTimeout - Timeout for plugins in milliseconds
 * @returns {Promise<string>} Concatenated plugin content
 */
export async function loadPlugins(workdir, stack, pluginTimeout = 5000) {
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
    
    // Get all .md files in the plugins directory
    const files = await fs.readdir(pluginsDir);
    const pluginFiles = files
      .filter(file => file.endsWith('.md'))
      .sort(); // Sort alphabetically
    
    if (pluginFiles.length === 0) {
      return '';
    }
    
    // Load each plugin and append content
    for (const file of pluginFiles) {
      const filePath = path.join(pluginsDir, file);
      
      // Use a promise with timeout for plugin loading
      const content = await Promise.race([
        fs.readFile(filePath, 'utf8'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Plugin loading timeout: ${file}`)), pluginTimeout)
        )
      ]);
      
      pluginContent += `\n\n${content}`;
      log.info(`Loaded plugin: ${stack}/${file}`);
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
 * @param {string} testOutput - Optional test output to include in context
 * @returns {Promise<string>} Assembled prompt
 */
export async function buildPrompt(filePath, workdir, outputDir, testOutput = '') {
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
  if (stackMatch) {
    const stack = stackMatch[1];
    pluginContent = await loadPlugins(workdir, stack);
  }

  // Add test output if provided
  let testContext = '';
  if (testOutput) {
    testContext = `\n## Test Output\nThe following test output was produced when running the generated code:\n\`\`\`\n${testOutput}\n\`\`\`\n`;
    testContext += `\nPlease fix any issues identified in the test output.\n`;
  }

  // Assemble prompt sandwich
  const systemMessage = 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.';
  
  return `${systemMessage}\n\n${promptContent}${pluginContent}${testContext}\n\n${contextContent}\n\n${systemMessage}\n\n${promptContent}${pluginContent}${testContext}`;
}

/**
 * Process a prompt through the LLM API
 * @param {string} prompt - Prompt to send to LLM
 * @param {Object} options - Options for LLM API
 * @returns {Promise<string>} LLM response
 */
export async function processLlm(prompt, options) {
  if (options.dryRun) {
    log.info('--- DRY RUN MODE ---');
    log.info('Prompt:', prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required for LLM processing');
  }

  const apiUrl = options.apiUrl;
  const apiKey = options.apiKey;
  const model = options.apiModel;
  const maxRetries = options.retries;
  
  log.info(`Sending request to ${apiUrl} with model ${model}`);
  
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      log.info(`Retry attempt ${attempt}/${maxRetries}...`);
    }
    
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
      log.error(`Error processing LLM request (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
      lastError = error;
      
      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        // Simple exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
        log.info(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
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
 * Run tests with the provided command, capturing stdout and stderr
 * @param {string} testCmd - Test command to run
 * @returns {Promise<{success: boolean, output: string}>} Test results
 */
export async function runTests(testCmd) {
  if (!testCmd) return { success: true, output: '' };
  
  log.info(`Running tests: ${testCmd}`);
  
  return new Promise((resolve) => {
    const [cmd, ...args] = testCmd.split(' ');
    const process = spawn(cmd, args, { shell: true });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });
    
    process.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });
    
    process.on('close', (code) => {
      const success = code === 0;
      const output = stdout + stderr;
      
      if (success) {
        log.success('Tests completed successfully');
      } else {
        log.error('Tests failed');
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
    log.success(`Initialized ${outputDir}/current with bootstrap files`);
  } catch (error) {
    log.error(`Error initializing ${outputDir}/current:`, error);
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
 * Process a prompt file with iterations for test fixes
 * @param {Object} promptFile - Prompt file information
 * @param {Object} options - Processing options
 * @param {Object} config - Configuration from vibec.json
 * @returns {Promise<boolean>} Success status
 */
export async function processPromptWithIterations(promptFile, options, config) {
  log.info(`Processing: ${promptFile.file} (${promptFile.number})`);
  
  let testOutput = '';
  let success = true;
  
  // Read prompt content once for plugin context
  const promptContent = await fs.readFile(promptFile.file, 'utf8');
  
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    // On first iteration, don't include test output
    // On subsequent iterations, include test output from previous run
    const prompt = await buildPrompt(
      promptFile.file, 
      options.workdir, 
      options.output, 
      iteration > 0 ? testOutput : ''
    );
    
    // Create context for dynamic plugins
    const pluginContext = {
      config: config,
      stack: promptFile.stack,
      promptNumber: promptFile.number,
      promptContent: promptContent,
      workingDir: path.join(options.workdir, options.output, 'current')
    };
    
    // Execute JavaScript plugins
    await executeJsPlugins(
      options.workdir, 
      promptFile.stack, 
      pluginContext, 
      options.pluginTimeout
    );
    
    // If not the first iteration, log that we're trying to fix test failures
    if (iteration > 0) {
      log.info(`Iteration ${iteration + 1}/${options.iterations}: Attempting to fix test failures`);
    }
    
    // Process with LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    log.info(`Extracted ${files.length} files from LLM response`);
    
    // Write files unless in dry-run mode
    if (!options.dryRun) {
      await writeFiles(
        files, 
        options.workdir, 
        promptFile.stack, 
        promptFile.number, 
        path.basename(promptFile.file), 
        options.output
      );
    } else {
      log.info('Dry run mode - files not written');
    }
    
    // Run tests if test command is provided
    if (options.testCmd) {
      const testResult = await runTests(options.testCmd);
      success = testResult.success;
      testOutput = testResult.output;
      
      // If tests passed, no need for more iterations
      if (success) {
        log.success(`Tests passed on iteration ${iteration + 1}`);
        break;
      }
      
      // If this was the last iteration and tests still failed, log a warning
      if (iteration === options.iterations - 1 && !success) {
        log.warn(`Failed to fix all test issues after ${options.iterations} iterations`);
      }
    } else {
      // No test command provided, so we're done after one iteration
      break;
    }
  }
  
  return success;
}

/**
 * Main function
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<void>}
 */
export async function main(argv) {
  try {
    // Get default workdir for loading config
    const defaultWorkdir = '.';
    
    // Load configuration file
    let config = null;
    try {
      config = await loadConfig(defaultWorkdir);
      if (config) {
        log.info('Loaded configuration from vibec.json');
      }
    } catch (error) {
      log.error('Error loading configuration:', error.message);
      throw error;
    }
    
    // Parse arguments with environment variables and config
    const options = parseArgs(argv, process.env, config);
    
    // Handle special flags
    if (options.help) {
      showUsage();
      return;
    }
    
    if (options.version) {
      showVersion();
      return;
    }
    
    log.info('Running with options:', JSON.stringify(options, null, 2));
    
    const outputDir = options.output;
    
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
    await initializeOutputCurrent(options.workdir, outputDir);
    
    // Copy generated files if needed
    if (options.start) {
      await copyGeneratedFiles(options.workdir, options.start, outputDir);
    }
    
    // Process each prompt file with iterations for test fixes
    for (const promptFile of filteredPromptFiles) {
      await processPromptWithIterations(promptFile, options, config);
    }
    
    log.success('Processing completed successfully');
  } catch (error) {
    log.error('Error in main execution:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (process.argv[1] === import.meta.url.substring('file://'.length)) {
  main(process.argv);
}