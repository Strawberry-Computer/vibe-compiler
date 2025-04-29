#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
 * Display help message
 */
export async function showHelp() {
  console.log(`
Usage: vibec [options]

Options:
  --workdir=<dir>           Working directory (default: '.')
  --stacks=<stack1,stack2>  Comma-separated list of stacks to process (default: 'core')
  --dry-run                 Run without making any changes (default: false)
  --start=<number>          Start at specific prompt number
  --end=<number>            End at specific prompt number
  --api-url=<url>           API URL (default: 'https://openrouter.ai/api/v1')
  --api-key=<key>           API key (required)
  --api-model=<model>       API model (default: 'anthropic/claude-3.7-sonnet')
  --test-cmd=<command>      Command to run tests
  --retries=<number>        Number of times to retry API calls (default: 0)
  --plugin-timeout=<number> Timeout for plugins in milliseconds (default: 5000)
  --output=<dir>            Output directory (default: 'output')
  --iterations=<number>     Number of times to retry a stage on test failure (default: 2)
  --help                    Show this help message
  --version                 Show version information
`);
}

/**
 * Display version information
 */
export async function showVersion() {
  try {
    // Get package.json path relative to current file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    console.log(`vibec v${packageJson.version || '0.0.0'}`);
  } catch (error) {
    console.error('Unable to determine version:', error.message);
  }
}

/**
 * Load config file from the working directory
 * @param {string} workdir - Working directory 
 * @returns {Promise<Object>} Parsed config or empty object
 */
export async function loadConfig(workdir) {
  try {
    const configPath = path.join(workdir, 'vibec.json');
    
    // Check if config file exists
    try {
      await fs.access(configPath);
    } catch {
      // No config file, return empty object
      return {};
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
 * Parse command line arguments and merge with env vars and config file
 * @param {string[]} argv - Command line arguments
 * @param {Object} env - Environment variables
 * @param {Object} configFile - Config file contents
 * @returns {Object} Parsed options
 */
export function parseArgs(argv, env = {}, configFile = {}) {
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
    iterations: 2
  };

  // Map config file keys to CLI option keys
  const configOptions = {
    workdir: configFile.workdir,
    stacks: configFile.stacks,
    'dry-run': configFile.dryRun,
    start: configFile.start,
    end: configFile.end,
    'api-url': configFile.apiUrl,
    'api-key': configFile.apiKey,
    'api-model': configFile.apiModel,
    'test-cmd': configFile.testCmd,
    retries: configFile.retries,
    'plugin-timeout': configFile.pluginTimeout,
    output: configFile.output,
    iterations: configFile.iterations
  };

  // Get options from environment variables
  const envOptions = {
    workdir: env.VIBEC_WORKDIR,
    stacks: env.VIBEC_STACKS ? env.VIBEC_STACKS.split(',') : undefined,
    'dry-run': env.VIBEC_DRY_RUN === 'true' ? true : 
               env.VIBEC_DRY_RUN === 'false' ? false : undefined,
    start: env.VIBEC_START !== undefined ? parseInt(env.VIBEC_START, 10) : undefined,
    end: env.VIBEC_END !== undefined ? parseInt(env.VIBEC_END, 10) : undefined,
    'api-url': env.VIBEC_API_URL,
    'api-key': env.VIBEC_API_KEY,
    'api-model': env.VIBEC_API_MODEL,
    'test-cmd': env.VIBEC_TEST_CMD,
    retries: env.VIBEC_RETRIES !== undefined ? parseInt(env.VIBEC_RETRIES, 10) : undefined,
    'plugin-timeout': env.VIBEC_PLUGIN_TIMEOUT !== undefined ? 
                     parseInt(env.VIBEC_PLUGIN_TIMEOUT, 10) : undefined,
    output: env.VIBEC_OUTPUT,
    iterations: env.VIBEC_ITERATIONS !== undefined ? parseInt(env.VIBEC_ITERATIONS, 10) : undefined
  };

  // Get options from CLI arguments
  const cliOptions = {};

  // Handle special flags first
  if (argv.includes('--help')) {
    return { help: true, ...defaults };
  }
  
  if (argv.includes('--version')) {
    return { version: true, ...defaults };
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    // Handle --option=value syntax
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=');
      
      if (key === 'stacks') {
        cliOptions[key] = value.split(',');
      } else if (key === 'dry-run') {
        cliOptions[key] = value.toLowerCase() !== 'false';
      } else if (key === 'start' || key === 'end' || key === 'retries' || key === 'plugin-timeout' || key === 'iterations') {
        cliOptions[key] = value ? parseInt(value, 10) : null;
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
        } else if (key === 'start' || key === 'end' || key === 'retries' || key === 'plugin-timeout' || key === 'iterations') {
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
  
  // Merge options with precedence: CLI > env > config > defaults
  const options = { ...defaults };
  
  for (const key in defaults) {
    if (configOptions[key] !== undefined) {
      options[key] = configOptions[key];
    }
    if (envOptions[key] !== undefined) {
      options[key] = envOptions[key];
    }
    if (cliOptions[key] !== undefined) {
      options[key] = cliOptions[key];
    }
  }

  // Add special flags if present
  if (cliOptions.help) options.help = true;
  if (cliOptions.version) options.version = true;
  
  // Validate options
  if (options.retries < 0) {
    log.error(`Invalid value for retries: ${options.retries}. Must be a non-negative integer.`);
    throw new Error(`Invalid value for retries: ${options.retries}. Must be a non-negative integer.`);
  }
  
  if (options['plugin-timeout'] <= 0) {
    log.error(`Invalid value for plugin-timeout: ${options['plugin-timeout']}. Must be a positive integer.`);
    throw new Error(`Invalid value for plugin-timeout: ${options['plugin-timeout']}. Must be a positive integer.`);
  }
  
  if (options.iterations < 0) {
    log.error(`Invalid value for iterations: ${options.iterations}. Must be a non-negative integer.`);
    throw new Error(`Invalid value for iterations: ${options.iterations}. Must be a non-negative integer.`);
  }
  
  return options;
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
 * Load plugins for a stack
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @returns {Promise<string>} Concatenated plugin content
 */
export async function loadPlugins(workdir, stack) {
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
      const content = await fs.readFile(filePath, 'utf8');
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
 * @param {string} [testOutput] - Output from test execution
 * @returns {Promise<string>} Assembled prompt
 */
export async function buildPrompt(filePath, workdir, outputDir, testOutput = null) {
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
  let testFeedback = '';
  if (testOutput) {
    testFeedback = `\n\n## Test Output\nThe previous implementation failed tests. Please fix the issues:\n\`\`\`\n${testOutput}\n\`\`\`\n`;
  }

  // Assemble prompt sandwich
  const systemMessage = 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.';
  
  return `${systemMessage}\n\n${promptContent}${testFeedback}${pluginContent}\n\n${contextContent}\n\n${systemMessage}\n\n${promptContent}${testFeedback}${pluginContent}`;
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
  const maxRetries = options.retries || 0;

  log.info(`Sending request to ${apiUrl} with model ${model}`);

  let attempts = 0;
  let lastError = null;

  while (attempts <= maxRetries) {
    try {
      if (attempts > 0) {
        log.info(`Retry attempt ${attempts}/${maxRetries}`);
      }

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
      lastError = error;
      log.error(`Error processing LLM request (attempt ${attempts + 1}/${maxRetries + 1}):`, error);
      attempts++;
      
      if (attempts <= maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        log.info(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If we've exhausted all retries
  throw lastError || new Error('Failed to process LLM request after all retry attempts');
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
 * Run tests with the provided command and capture output
 * @param {string} testCmd - Test command to run
 * @returns {Promise<{success: boolean, output: string}>} Test results
 */
export function runTestsWithCapture(testCmd) {
  if (!testCmd) return { success: true, output: '' };
  
  log.info(`Running tests: ${testCmd}`);
  
  return new Promise((resolve) => {
    // Split the command into the program and its arguments
    const parts = testCmd.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    
    const process = spawn(cmd, args, { shell: true });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data;
    });
    
    process.stderr.on('data', (data) => {
      stderr += data;
    });
    
    process.on('close', (code) => {
      const output = stdout + (stderr ? '\n' + stderr : '');
      
      if (code === 0) {
        log.success('Tests completed successfully');
        resolve({ success: true, output });
      } else {
        log.error(`Tests failed with exit code ${code}`);
        resolve({ success: false, output });
      }
    });
    
    process.on('error', (err) => {
      log.error(`Failed to run tests: ${err.message}`);
      resolve({ success: false, output: err.message });
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
 * Process a single prompt file with support for iterations on test failures
 * @param {Object} promptFile - Prompt file object
 * @param {Object} options - Command line options
 * @param {string} outputDir - Output directory
 * @returns {Promise<void>}
 */
export async function processPromptFile(promptFile, options, outputDir) {
  log.info(`Processing: ${promptFile.file} (${promptFile.number})`);
  
  let iterationCount = 0;
  let maxIterations = options.iterations;
  let testOutput = null;
  let success = false;

  while (iterationCount <= maxIterations && !success) {
    // If this is not the first attempt, log the iteration
    if (iterationCount > 0) {
      log.info(`Iteration ${iterationCount}/${maxIterations} for ${promptFile.file}`);
    }

    // Build prompt, including test output for iterations after the first
    const prompt = await buildPrompt(promptFile.file, options.workdir, outputDir, testOutput);
    
    // Process with LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    log.info(`Extracted ${files.length} files from LLM response`);
    
    // Write files unless in dry-run mode
    if (!options['dry-run']) {
      await writeFiles(files, options.workdir, promptFile.stack, promptFile.number, path.basename(promptFile.file), outputDir);
      
      // Run tests if test command is provided
      if (options['test-cmd']) {
        const testResult = await runTestsWithCapture(options['test-cmd']);
        success = testResult.success;
        
        // If tests failed and we have iterations left
        if (!success && iterationCount < maxIterations) {
          testOutput = testResult.output;
          iterationCount++;
        } else {
          // Either tests succeeded or we've exhausted iterations
          if (success) {
            log.success(`Tests passed${iterationCount > 0 ? ` after ${iterationCount} iteration(s)` : ''}`);
          } else if (iterationCount === maxIterations) {
            log.error(`Failed to resolve test failures after ${maxIterations} iterations`);
          }
          break;
        }
      } else {
        // No test command, assume success and exit the loop
        success = true;
        break;
      }
    } else {
      log.info('Dry run mode - files not written, skipping tests');
      success = true;
      break;
    }
  }
}

/**
 * Main function
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<void>}
 */
export async function main(argv) {
  try {
    // Load configuration file
    const workdirArg = argv.find(arg => arg.startsWith('--workdir='));
    const workdir = workdirArg ? workdirArg.split('=')[1] : '.';
    
    // Load config file from workdir
    let configFile = {};
    try {
      configFile = await loadConfig(workdir);
      if (Object.keys(configFile).length > 0) {
        log.info('Loaded configuration from vibec.json');
      }
    } catch (error) {
      log.error('Error loading vibec.json:', error);
      throw error;
    }
    
    // Parse arguments with config and env vars
    const options = parseArgs(argv, process.env, configFile);
    
    // Handle special options first
    if (options.help) {
      await showHelp();
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
    
    const outputDir = options.output || 'output';
    
    // Initialize output/current directory
    await initializeOutputCurrent(options.workdir, outputDir);
    
    // Copy generated files if needed
    if (options.start) {
      await copyGeneratedFiles(options.workdir, options.start, outputDir);
    }
    
    // Process each prompt file
    for (const promptFile of filteredPromptFiles) {
      await processPromptFile(promptFile, options, outputDir);
    }
    
    log.success('Processing completed successfully');
  } catch (error) {
    log.error('Error in main execution:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv);
}