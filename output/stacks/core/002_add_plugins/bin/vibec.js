#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * Colored logging utility
 */
const log = {
  logger: console.log,

  info: function(message, ...args) {
    this.logger(`\x1b[36m${message}\x1b[0m`, ...args);
  },
  
  warn: function(message, ...args) {
    this.logger(`\x1b[33m${message}\x1b[0m`, ...args);
  },
  
  error: function(message, ...args) {
    this.logger(`\x1b[31m${message}\x1b[0m`, ...args);
  },
  
  success: function(message, ...args) {
    this.logger(`\x1b[32m${message}\x1b[0m`, ...args);
  },
  
  debug: function(message, ...args) {
    if (process.env.VIBEC_DEBUG) {
      this.logger(`\x1b[35m${message}\x1b[0m`, ...args);
    }
  }
};

/**
 * Parse command line arguments
 * @param {string[]} argv - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    workdir: '.',
    stacks: ['core'],
    dryRun: false,
    start: null,
    end: null,
    noOverwrite: false,
    apiUrl: 'https://openrouter.ai/api/v1',
    apiKey: null,
    apiModel: 'anthropic/claude-3.7-sonnet',
    testCmd: null,
    pluginTimeout: 5000
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--workdir=')) {
      options.workdir = arg.substring('--workdir='.length);
    } else if (arg === '--workdir' && i + 1 < args.length) {
      options.workdir = args[++i];
    } else if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring('--stacks='.length).split(',');
    } else if (arg === '--stacks' && i + 1 < args.length) {
      options.stacks = args[++i].split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--start=')) {
      options.start = parseInt(arg.substring('--start='.length), 10);
    } else if (arg === '--start' && i + 1 < args.length) {
      options.start = parseInt(args[++i], 10);
    } else if (arg.startsWith('--end=')) {
      options.end = parseInt(arg.substring('--end='.length), 10);
    } else if (arg === '--end' && i + 1 < args.length) {
      options.end = parseInt(args[++i], 10);
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring('--api-url='.length);
    } else if (arg === '--api-url' && i + 1 < args.length) {
      options.apiUrl = args[++i];
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.substring('--api-key='.length);
    } else if (arg === '--api-key' && i + 1 < args.length) {
      options.apiKey = args[++i];
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring('--api-model='.length);
    } else if (arg === '--api-model' && i + 1 < args.length) {
      options.apiModel = args[++i];
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring('--test-cmd='.length);
    } else if (arg === '--test-cmd' && i + 1 < args.length) {
      options.testCmd = args[++i];
    } else if (arg.startsWith('--plugin-timeout=')) {
      options.pluginTimeout = parseInt(arg.substring('--plugin-timeout='.length), 10);
    } else if (arg === '--plugin-timeout' && i + 1 < args.length) {
      options.pluginTimeout = parseInt(args[++i], 10);
    }
  }

  return options;
}

/**
 * Get prompt files from stacks
 * @param {string[]} stacks - Stack names to scan
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{stack: string, file: string, number: number}>>} Sorted prompt files
 */
async function getPromptFiles(stacks, workdir) {
  const promptFiles = [];

  for (const stack of stacks) {
    const stackDir = path.join(workdir, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        const match = file.match(/^(\d+)_.+\.md$/);
        if (match) {
          promptFiles.push({
            stack,
            file: path.join(stackDir, file),
            number: parseInt(match[1], 10)
          });
        }
      }
    } catch (error) {
      log.error(`Error reading stack directory ${stackDir}:`, error.message);
      throw error;
    }
  }

  return promptFiles.sort((a, b) => a.number - b.number);
}

/**
 * Load static plugins (MD files) for a stack
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{name: string, content: string}>>} Loaded static plugins
 */
async function loadStaticPlugins(stack, workdir) {
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  const plugins = [];
  
  try {
    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch (error) {
      log.debug(`No plugins directory found for stack ${stack}`);
      return plugins;
    }
    
    // Get all .md files in the plugins directory
    const files = await fs.readdir(pluginsDir);
    const mdFiles = files.filter(file => file.endsWith('.md')).sort();
    
    // Load content from each .md file
    for (const file of mdFiles) {
      try {
        const content = await fs.readFile(path.join(pluginsDir, file), 'utf8');
        plugins.push({
          name: file,
          content: content
        });
        log.info(`Loaded static plugin: ${stack}/plugins/${file}`);
      } catch (error) {
        log.error(`Error loading static plugin ${file}:`, error.message);
      }
    }
    
    return plugins;
  } catch (error) {
    log.error(`Error scanning for static plugins in ${stack}:`, error.message);
    return plugins;
  }
}

/**
 * Load dynamic plugins (JS files) for a stack
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{name: string, plugin: Function}>>} Loaded dynamic plugins
 */
async function loadDynamicPlugins(stack, workdir) {
  const pluginsDir = path.join(workdir, 'stacks', stack, 'plugins');
  const plugins = [];
  
  try {
    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch (error) {
      log.debug(`No plugins directory found for stack ${stack}`);
      return plugins;
    }
    
    // Get all .js files in the plugins directory
    const files = await fs.readdir(pluginsDir);
    const jsFiles = files.filter(file => file.endsWith('.js')).sort();
    
    // Load each .js file
    for (const file of jsFiles) {
      try {
        const pluginPath = path.join(pluginsDir, file);
        const plugin = require(pluginPath);
        
        if (typeof plugin === 'function') {
          plugins.push({
            name: file,
            plugin: plugin
          });
          log.info(`Loaded dynamic plugin: ${stack}/plugins/${file}`);
        } else {
          log.warn(`Plugin ${file} does not export a function`);
        }
      } catch (error) {
        log.error(`Error loading dynamic plugin ${file}:`, error.message);
      }
    }
    
    return plugins;
  } catch (error) {
    log.error(`Error scanning for dynamic plugins in ${stack}:`, error.message);
    return plugins;
  }
}

/**
 * Execute dynamic plugins
 * @param {Array<{name: string, plugin: Function}>} plugins - Plugins to execute
 * @param {Object} context - Context for plugin execution
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function executeDynamicPlugins(plugins, context, timeout) {
  log.debug('Executing dynamic plugins with context:', context);
  
  for (const { name, plugin } of plugins) {
    log.debug(`Executing dynamic plugin: ${name}`);
    
    try {
      // Execute the plugin with a timeout
      await Promise.race([
        plugin(context),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Plugin execution timed out (${timeout}ms)`)), timeout))
      ]);
      
      log.debug(`Plugin ${name} executed successfully`);
    } catch (error) {
      log.error(`Error executing plugin ${name}:`, error.message);
      // Continue with next plugin
    }
  }
}

/**
 * Build a prompt by reading a file and appending context
 * @param {string} filePath - Path to the prompt file
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {number} promptNumber - Prompt number
 * @param {Object} config - Config object
 * @returns {Promise<string>} The built prompt
 */
async function buildPrompt(filePath, workdir, stack, promptNumber, config) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    
    // Extract context files from the prompt content
    const contextMatch = content.match(/## Context: (.+)/);
    if (contextMatch) {
      const contextFiles = contextMatch[1].split(',').map(file => file.trim());
      let contextContent = '';
      
      for (const file of contextFiles) {
        const contextFilePath = path.join(workdir, 'output', 'current', file);
        try {
          const fileContent = await fs.readFile(contextFilePath, 'utf8');
          contextContent += `\n\n### ${file}:\n\`\`\`\n${fileContent}\n\`\`\``;
        } catch (error) {
          log.warn(`Warning: Could not read context file ${contextFilePath}: ${error.message}`);
        }
      }
      
      content = content.replace(/## Context: .+/, `## Context: ${contextMatch[1]}${contextContent}`);
    }
    
    // Load and append static plugins
    const staticPlugins = await loadStaticPlugins(stack, workdir);
    for (const plugin of staticPlugins) {
      content += `\n\n${plugin.content}`;
    }
    
    // Execute dynamic plugins
    const dynamicPlugins = await loadDynamicPlugins(stack, workdir);
    if (dynamicPlugins.length > 0) {
      const context = {
        config,
        stack,
        promptNumber,
        promptContent: content,
        workingDir: path.join(workdir, 'output', 'current')
      };
      
      await executeDynamicPlugins(dynamicPlugins, context, config.pluginTimeout);
      
      // Note: dynamic plugins may modify files but don't modify the prompt content directly
    }
    
    return content;
  } catch (error) {
    log.error(`Error building prompt from ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Process a prompt using the LLM API
 * @param {string} prompt - The prompt to process
 * @param {Object} options - API options
 * @returns {Promise<string>} The LLM response
 */
async function processLlm(prompt, options) {
  if (options.dryRun) {
    log.info('DRY RUN - Prompt:', prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required for LLM processing');
  }

  try {
    log.info('Sending request to LLM API...');
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
      const errorData = await response.text();
      throw new Error(`LLM API request failed with status ${response.status}: ${errorData}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    log.error('Error processing prompt with LLM:', error.message);
    throw error;
  }
}

/**
 * Parse the LLM response to extract files
 * @param {string} response - LLM response
 * @returns {Array<{path: string, content: string}>} Extracted files
 */
function parseResponse(response) {
  const files = [];
  const regex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    files.push({
      path: match[1],
      content: match[2]
    });
  }

  log.info(`Extracted ${files.length} file(s) from LLM response`);
  return files;
}

/**
 * Run tests if a test command is provided
 * @param {string|null} testCmd - Test command to run
 * @param {string} workdir - Working directory
 * @returns {boolean} True if tests pass, false otherwise
 */
function runTests(testCmd, workdir) {
  if (!testCmd) {
    return true;
  }

  try {
    log.info(`Running tests with command: ${testCmd}`);
    execSync(testCmd, { cwd: workdir, stdio: 'inherit' });
    log.success('Tests passed successfully');
    return true;
  } catch (error) {
    log.error('Tests failed:', error.message);
    return false;
  }
}

/**
 * Check if files would be overwritten
 * @param {Array<{path: string, content: string}>} files - Files to check
 * @param {string} workdir - Working directory
 * @returns {Promise<boolean>} True if any file would be overwritten
 */
async function checkOverwrite(files, workdir) {
  for (const file of files) {
    const filePath = path.join(workdir, 'output', 'current', file.path);
    try {
      await fs.access(filePath);
      return true; // File exists, would be overwritten
    } catch {
      // File doesn't exist, no overwrite
    }
  }
  return false;
}

/**
 * Write files to output directories
 * @param {Array<{path: string, content: string}>} files - Files to write
 * @param {string} promptFileName - Prompt file name
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @param {boolean} dryRun - Whether to perform a dry run
 * @returns {Promise<void>}
 */
async function writeFiles(files, promptFileName, stack, workdir, dryRun) {
  if (dryRun) {
    log.info('DRY RUN - Would write files:', files.map(f => f.path).join(', '));
    return;
  }

  const baseName = path.basename(promptFileName, '.md');
  const stackOutputDir = path.join(workdir, 'output', 'stacks', stack, baseName);

  // Ensure output directories exist
  await fs.mkdir(stackOutputDir, { recursive: true });

  for (const file of files) {
    // Write to stack-specific output
    const stackFilePath = path.join(stackOutputDir, file.path);
    await fs.mkdir(path.dirname(stackFilePath), { recursive: true });
    await fs.writeFile(stackFilePath, file.content);

    // Write to current output
    const currentFilePath = path.join(workdir, 'output', 'current', file.path);
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    await fs.writeFile(currentFilePath, file.content);

    log.success(`Wrote file: ${file.path}`);
  }
}

/**
 * Reconstruct the current directory by copying files from previously generated outputs
 * @param {number} startNumber - Starting prompt number
 * @param {Array<{stack: string, file: string, number: number}>} promptFiles - All prompt files
 * @param {string} workdir - Working directory
 * @returns {Promise<void>}
 */
async function reconstructCurrent(startNumber, promptFiles, workdir) {
  if (!startNumber || startNumber <= 1) {
    // No reconstruction needed if starting from the beginning
    return;
  }

  // Clear current directory
  const currentDir = path.join(workdir, 'output', 'current');
  try {
    await fs.rm(currentDir, { recursive: true, force: true });
    await fs.mkdir(currentDir, { recursive: true });
    log.info('Cleared current directory for reconstruction');
  } catch (error) {
    log.error('Error clearing current directory:', error.message);
    throw error;
  }

  // Find all prompt files with number < startNumber
  const previousPrompts = promptFiles.filter(p => p.number < startNumber);
  
  for (const prompt of previousPrompts) {
    const baseName = path.basename(prompt.file, '.md');
    const stackOutputDir = path.join(workdir, 'output', 'stacks', prompt.stack, baseName);
    
    try {
      // Check if this output directory exists
      await fs.access(stackOutputDir);
      
      // Copy all files from this directory to current
      const files = await fs.readdir(stackOutputDir, { recursive: true });
      for (const file of files) {
        const srcPath = path.join(stackOutputDir, file);
        const destPath = path.join(currentDir, file);
        
        const stat = await fs.stat(srcPath);
        if (stat.isFile()) {
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(srcPath, destPath);
        }
      }
      
      log.info(`Reconstructed output from ${prompt.stack}/${baseName}`);
    } catch (error) {
      log.warn(`Warning: Could not reconstruct output from ${stackOutputDir}: ${error.message}`);
    }
  }
}

/**
 * Load config file if it exists
 * @param {string} workdir - Working directory
 * @returns {Promise<Object>} Config object
 */
async function loadConfig(workdir) {
  const configPath = path.join(workdir, 'vibec.json');
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    log.debug(`No config file found at ${configPath} or error reading it: ${error.message}`);
    return {};
  }
}

/**
 * Main function to orchestrate the entire process
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<void>}
 */
async function main(argv) {
  try {
    const options = parseArgs(argv);
    log.info('Running with options:', options);

    // Load config if available
    const config = await loadConfig(options.workdir);
    const mergedConfig = { ...config, ...options };
    log.debug('Running with merged config:', mergedConfig);

    // Get all prompt files
    let promptFiles = await getPromptFiles(options.stacks, options.workdir);
    log.info(`Found ${promptFiles.length} prompt files in stacks: ${options.stacks.join(', ')}`);

    // Filter based on start/end if provided
    if (options.start !== null) {
      promptFiles = promptFiles.filter(p => p.number >= options.start);
    }
    if (options.end !== null) {
      promptFiles = promptFiles.filter(p => p.number <= options.end);
    }
    log.info(`Processing ${promptFiles.length} prompt files after filtering by range`);

    // Reconstruct current directory if starting from a higher number
    await reconstructCurrent(options.start, await getPromptFiles(options.stacks, options.workdir), options.workdir);

    // Process each prompt file
    for (const promptFile of promptFiles) {
      log.info(`\nProcessing prompt file: ${promptFile.file} (${promptFile.number})`);
      
      // Build the prompt
      const prompt = await buildPrompt(
        promptFile.file, 
        options.workdir, 
        promptFile.stack, 
        promptFile.number,
        mergedConfig
      );
      
      // Process with LLM
      const response = await processLlm(prompt, options);
      
      // Parse the response
      const files = parseResponse(response);
      
      // Check for overwrites if no-overwrite is set
      if (options.noOverwrite && !options.dryRun) {
        const wouldOverwrite = await checkOverwrite(files, options.workdir);
        if (wouldOverwrite) {
          throw new Error('Some files would be overwritten and --no-overwrite is set');
        }
      }
      
      // Write the files
      const promptFileName = path.basename(promptFile.file);
      await writeFiles(files, promptFileName, promptFile.stack, options.workdir, options.dryRun);
      
      // Run tests if provided
      if (options.testCmd && !options.dryRun) {
        const testsPass = runTests(options.testCmd, options.workdir);
        if (!testsPass) {
          throw new Error('Tests failed after processing prompt');
        }
      }
    }
    
    log.success('\nProcessing completed successfully');
  } catch (error) {
    log.error('Error in main process:', error.message);
    throw error;
  }
}

// Execute main only if run directly
if (require.main === module) {
  main(process.argv).catch(error => {
    log.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export functions
module.exports = {
  log,
  parseArgs,
  getPromptFiles,
  buildPrompt,
  processLlm,
  parseResponse,
  runTests,
  checkOverwrite,
  writeFiles,
  reconstructCurrent,
  loadStaticPlugins,
  loadDynamicPlugins,
  executeDynamicPlugins,
  loadConfig,
  main
};