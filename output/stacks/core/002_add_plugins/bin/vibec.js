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

/**
 * Parse command line arguments.
 * @param {string[]} args - Process argv array
 * @returns {Object} Parsed options
 */
function parseArgs(args) {
  const options = {
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
    'plugin-timeout': 5000
  };

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
        } else if (key === 'start' || key === 'end' || key === 'plugin-timeout') {
          options[key] = parseInt(value, 10);
        } else if (key === 'dry-run' || key === 'no-overwrite') {
          options[key] = value.toLowerCase() !== 'false';
        } else {
          options[key] = value;
        }
      } else {
        // --option value format or boolean flag
        const key = arg.substring(2);
        
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          // Next arg is a value
          const value = args[i + 1];
          if (key === 'stacks') {
            options[key] = value.split(',');
          } else if (key === 'start' || key === 'end' || key === 'plugin-timeout') {
            options[key] = parseInt(value, 10);
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
      
      for (const contextFile of contextFiles) {
        try {
          const contextPath = path.join(workdir, 'output', 'current', contextFile);
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
      workingDir: path.join(workdir, 'output', 'current')
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
 * Process a prompt through the LLM API.
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

  try {
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
    log.error(`Error processing prompt with LLM API: ${err.message}`);
    throw err;
  }
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
 * @returns {Promise<boolean>} True if overwriting would occur and is disabled
 */
async function checkOverwrite(files, workdir, noOverwrite) {
  if (!noOverwrite) {
    return false;
  }
  
  for (const file of files) {
    const filePath = path.join(workdir, 'output', 'current', file.path);
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
 * @returns {Promise<void>}
 */
async function writeFiles(files, workdir, stack, promptFile) {
  const promptName = path.basename(promptFile, '.md');
  
  for (const file of files) {
    // Write to output/current/
    const currentPath = path.join(workdir, 'output', 'current', file.path);
    const currentDir = path.dirname(currentPath);
    
    // Write to output/stacks/stack/promptName/
    const stackPath = path.join(workdir, 'output', 'stacks', stack, promptName, file.path);
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
  const currentDir = path.join(workdir, 'output', 'current');
  const bootstrapDir = path.join(workdir, 'output', 'bootstrap');
  
  // Clear and recreate current directory
  try {
    await fs.rm(currentDir, { recursive: true, force: true });
    await fs.mkdir(currentDir, { recursive: true });
    
    // Copy bootstrap files first
    await copyDirectory(bootstrapDir, currentDir);
    log.info('Copied bootstrap files to output/current/');
    
    // If start is specified, copy files from previous prompts
    if (options.start !== null) {
      const promptFiles = await getPromptFiles(options.stacks, workdir, null, options.start - 1);
      
      for (const prompt of promptFiles) {
        const promptName = path.basename(prompt.file, '.md');
        const stackOutputDir = path.join(workdir, 'output', 'stacks', prompt.stack, promptName);
        
        try {
          await copyDirectory(stackOutputDir, currentDir);
          log.info(`Copied files from ${prompt.stack}/${promptName} to output/current/`);
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
  log.info('Starting LLM code generation process...');
  const options = parseArgs(args);
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
    const wouldOverwrite = await checkOverwrite(files, options.workdir, options['no-overwrite']);
    if (wouldOverwrite) {
      throw new Error('File overwrite prevented by --no-overwrite flag.');
    }
    
    // Write files
    await writeFiles(
      files, 
      options.workdir, 
      promptFile.stack, 
      path.basename(promptFile.file)
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
}

// Execute main if script is run directly
if (require.main === module) {
  main(process.argv).catch(err => {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  });
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
  main
};