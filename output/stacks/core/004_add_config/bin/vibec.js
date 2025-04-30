#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
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

// PROMPT: "Load `vibec.json` from root if present, parse as JSON. IMPORTANT: Throw error if malformed JSON. Don't throw error when no config file is present."
export async function loadConfig(workdir) {
  try {
    const configPath = path.join(workdir, 'vibec.json');
    const configData = await fs.readFile(configPath, 'utf8');
    
    try {
      return JSON.parse(configData);
    } catch (error) {
      throw new Error(`Invalid JSON in vibec.json: ${error.message}`);
    }
  } catch (error) {
    // Only throw if it's not a file not found error
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  }
}

// PROMPT: "Update `parseArgs` to handle `vibec.json` and merge with CLI and env vars. It should take `process.env` and `vibecJson` as arguments in addition to `process.argv`."
export function parseArgs(argv, env = {}, vibecJson = null) {
  // Default options
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
    retries: 0,
    'plugin-timeout': 5000,
    output: 'output',
    help: false,
    version: false
  };

  // PROMPT: "Merge options with existing CLI args and env vars, using defaults only for unset values."
  // Apply config from vibec.json if present
  if (vibecJson) {
    if (vibecJson.workdir !== undefined) options.workdir = vibecJson.workdir;
    if (vibecJson.stacks !== undefined) options.stacks = vibecJson.stacks;
    if (vibecJson.dryRun !== undefined) options['dry-run'] = vibecJson.dryRun;
    if (vibecJson.start !== undefined) options.start = vibecJson.start;
    if (vibecJson.end !== undefined) options.end = vibecJson.end;
    if (vibecJson.apiUrl !== undefined) options['api-url'] = vibecJson.apiUrl;
    if (vibecJson.apiKey !== undefined) options['api-key'] = vibecJson.apiKey;
    if (vibecJson.apiModel !== undefined) options['api-model'] = vibecJson.apiModel;
    if (vibecJson.testCmd !== undefined) options['test-cmd'] = vibecJson.testCmd;
    if (vibecJson.retries !== undefined) options.retries = vibecJson.retries;
    if (vibecJson.pluginTimeout !== undefined) options['plugin-timeout'] = vibecJson.pluginTimeout;
    if (vibecJson.output !== undefined) options.output = vibecJson.output;
  }

  // PROMPT: "Merge options with existing CLI args and env vars, using defaults only for unset values."
  // Apply environment variables
  if (env.VIBEC_WORKDIR) options.workdir = env.VIBEC_WORKDIR;
  if (env.VIBEC_STACKS) {
    // PROMPT: "Convert `VIBEC_STACKS` to array if string."
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
  if (env.VIBEC_RETRIES) options.retries = parseInt(env.VIBEC_RETRIES, 10);
  if (env.VIBEC_PLUGIN_TIMEOUT) options['plugin-timeout'] = parseInt(env.VIBEC_PLUGIN_TIMEOUT, 10);
  if (env.VIBEC_OUTPUT) options.output = env.VIBEC_OUTPUT;

  // Parse command line arguments (highest priority)
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
        options[key] = retries;
      } else if (key === 'plugin-timeout') {
        const timeout = parseInt(value, 10);
        if (isNaN(timeout) || timeout <= 0) {
          throw new Error(`Invalid plugin-timeout value: ${value}. Must be a positive integer.`);
        }
        options[key] = timeout;
      } else if (key === 'stacks') {
        options[key] = value.split(',');
      } else if (key === 'dry-run') {
        options[key] = value.toLowerCase() !== 'false';
      } else if (key === 'start' || key === 'end') {
        options[key] = value ? parseInt(value, 10) : null;
      } else {
        options[key] = value;
      }
    }
    // Handle --option value syntax
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      
      if (key === 'help' || key === 'version') {
        options[key] = true;
        continue;
      }
      
      if (key === 'dry-run') {
        options[key] = true;
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
          options[key] = retries;
        } else if (key === 'plugin-timeout') {
          const timeout = parseInt(value, 10);
          if (isNaN(timeout) || timeout <= 0) {
            throw new Error(`Invalid plugin-timeout value: ${value}. Must be a positive integer.`);
          }
          options[key] = timeout;
        } else if (key === 'stacks') {
          options[key] = value.split(',');
        } else if (key === 'start' || key === 'end') {
          options[key] = value ? parseInt(value, 10) : null;
        } else {
          options[key] = value;
        }
      } else {
        // Flag without value
        options[key] = true;
      }
    }
  }
  
  // PROMPT: "Validate: `retries` ≥ 0, `pluginTimeout` > 0, log errors with `log` utility."
  // Final validation
  if (options.retries < 0) {
    log.error(`Invalid retries value: ${options.retries}. Must be a non-negative integer.`);
    throw new Error(`Invalid retries value: ${options.retries}. Must be a non-negative integer.`);
  }
  
  if (options['plugin-timeout'] <= 0) {
    log.error(`Invalid plugin-timeout value: ${options['plugin-timeout']}. Must be a positive integer.`);
    throw new Error(`Invalid plugin-timeout value: ${options['plugin-timeout']}. Must be a positive integer.`);
  }
  
  return options;
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
  --plugin-timeout=<ms>   Timeout for plugin execution in ms (default: 5000)
  --output=<dir>          Output directory (default: output)
  --help                  Show this help message and exit
  --version               Show version information and exit

Environment variables:
  VIBEC_WORKDIR           Working directory path
  VIBEC_STACKS            Comma-separated stacks
  VIBEC_DRY_RUN           true/false
  VIBEC_START             Numeric stage value
  VIBEC_END               Numeric stage value
  VIBEC_API_URL           URL string
  VIBEC_API_KEY           API key string
  VIBEC_API_MODEL         Model string
  VIBEC_TEST_CMD          Command string
  VIBEC_RETRIES           Integer string
  VIBEC_PLUGIN_TIMEOUT    Integer string
  VIBEC_OUTPUT            Output directory string

Configuration file: vibec.json in the working directory
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
 * Load plugins for a stack
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {number} pluginTimeout - Plugin timeout in milliseconds
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
 * @param {number} pluginTimeout - Plugin timeout in milliseconds
 * @returns {Promise<string>} Assembled prompt
 */
export async function buildPrompt(filePath, workdir, outputDir, pluginTimeout) {
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
    pluginContent = await loadPlugins(workdir, stack, pluginTimeout);
  }

  // Assemble prompt sandwich
  const systemMessage = 'Generate code files in this exact format for each file: "File: path/to/file\n```lang\ncontent\n```". Ensure every response includes ALL files requested in the prompt\'s ## Output: sections. Do not skip any requested outputs.';
  
  return `${systemMessage}\n\n${promptContent}${pluginContent}\n\n${contextContent}\n\n${systemMessage}\n\n${promptContent}${pluginContent}`;
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
 * @returns {Promise<void>}
 */
export async function runTests(testCmd) {
  if (!testCmd) return;
  
  log.info(`Running tests: ${testCmd}`);
  try {
    const output = execSync(testCmd, { stdio: 'inherit' });
    log.success('Tests completed successfully');
    return output;
  } catch (error) {
    log.error('Tests failed:', error);
    throw error;
  }
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
 * Main function
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<void>}
 */
export async function main(argv) {
  try {
    // PROMPT: "Load `vibec.json` from root if present, parse as JSON."
    // Default workdir is current directory 
    const initialWorkdir = '.';
    const vibecJson = await loadConfig(initialWorkdir);
    
    // Parse arguments, now also passing env vars and config
    const options = parseArgs(argv, process.env, vibecJson);
    
    // Check for help or version flags first
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
    
    // Process each prompt file
    for (const promptFile of filteredPromptFiles) {
      log.info(`Processing: ${promptFile.file} (${promptFile.number})`);
      
      // Build prompt
      const prompt = await buildPrompt(promptFile.file, options.workdir, options.output, options['plugin-timeout']);
      
      // Process with LLM
      const response = await processLlm(prompt, options);
      
      // Parse response
      const files = parseResponse(response);
      log.info(`Extracted ${files.length} files from LLM response`);
      
      // Write files unless in dry-run mode
      if (!options['dry-run']) {
        await writeFiles(files, options.workdir, promptFile.stack, promptFile.number, path.basename(promptFile.file), options.output);
      } else {
        log.info('Dry run mode - files not written');
      }
    }
    
    // Run tests if test command is provided
    if (options['test-cmd']) {
      await runTests(options['test-cmd']);
    }
    
    log.success('Processing completed successfully');
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