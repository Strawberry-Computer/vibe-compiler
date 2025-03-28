#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Color logging utility
const log = {
  info: (message) => console.log(`\x1b[36m${message}\x1b[0m`),
  warn: (message) => console.log(`\x1b[33m${message}\x1b[0m`),
  error: (message) => console.log(`\x1b[31m${message}\x1b[0m`),
  success: (message) => console.log(`\x1b[32m${message}\x1b[0m`),
  debug: (message) => {
    if (process.env.VIBEC_DEBUG) {
      console.log(`\x1b[35m${message}\x1b[0m`);
    }
  }
};

/**
 * Parse command-line arguments
 * @param {string[]} argv - Command-line arguments
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
    pluginTimeout: 5000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--workdir=')) {
      options.workdir = arg.split('=')[1];
    } else if (arg === '--workdir' && i + 1 < args.length) {
      options.workdir = args[++i];
    } else if (arg.startsWith('--stacks=')) {
      options.stacks = arg.split('=')[1].split(',');
    } else if (arg === '--stacks' && i + 1 < args.length) {
      options.stacks = args[++i].split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--start=')) {
      options.start = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--start' && i + 1 < args.length) {
      options.start = parseInt(args[++i], 10);
    } else if (arg.startsWith('--end=')) {
      options.end = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--end' && i + 1 < args.length) {
      options.end = parseInt(args[++i], 10);
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.split('=')[1];
    } else if (arg === '--api-url' && i + 1 < args.length) {
      options.apiUrl = args[++i];
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.split('=')[1];
    } else if (arg === '--api-key' && i + 1 < args.length) {
      options.apiKey = args[++i];
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.split('=')[1];
    } else if (arg === '--api-model' && i + 1 < args.length) {
      options.apiModel = args[++i];
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.split('=')[1];
    } else if (arg === '--test-cmd' && i + 1 < args.length) {
      options.testCmd = args[++i];
    } else if (arg.startsWith('--plugin-timeout=')) {
      options.pluginTimeout = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--plugin-timeout' && i + 1 < args.length) {
      options.pluginTimeout = parseInt(args[++i], 10);
    }
  }

  return options;
}

/**
 * Get prompt files from specified stacks
 * @param {string[]} stacks - Array of stack names
 * @param {string} workdir - Working directory
 * @param {number|null} start - Starting stage number
 * @param {number|null} end - Ending stage number
 * @returns {Promise<Array<{stack: string, file: string, number: number}>>} Sorted prompt files
 */
async function getPromptFiles(stacks, workdir, start, end) {
  log.info(`Scanning stacks: ${stacks.join(', ')}`);
  const promptFiles = [];

  for (const stack of stacks) {
    const stackPath = path.join(workdir, 'stacks', stack);
    
    try {
      const files = await fs.readdir(stackPath);
      
      for (const file of files) {
        if (file.match(/^\d{3}_.*\.md$/)) {
          const number = parseInt(file.split('_')[0], 10);
          
          if ((start === null || number >= start) && (end === null || number <= end)) {
            promptFiles.push({
              stack,
              file: path.join(stackPath, file),
              number
            });
          }
        }
      }
    } catch (error) {
      log.error(`Error scanning stack ${stack}: ${error.message}`);
      throw error;
    }
  }

  return promptFiles.sort((a, b) => a.number - b.number);
}

/**
 * Load static plugins (.md files) from a stack
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{name: string, content: string}>>} Array of static plugins
 */
async function loadStaticPlugins(stack, workdir) {
  const pluginsPath = path.join(workdir, 'stacks', stack, 'plugins');
  const staticPlugins = [];

  try {
    const files = await fs.readdir(pluginsPath);
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        try {
          const content = await fs.readFile(path.join(pluginsPath, file), 'utf8');
          staticPlugins.push({
            name: file,
            content
          });
          log.info(`Loaded static plugin: ${stack}/${file}`);
        } catch (error) {
          log.error(`Error loading static plugin ${file}: ${error.message}`);
        }
      }
    }
    
    // Sort plugins by name
    return staticPlugins.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    // If plugins directory doesn't exist, just return empty array
    if (error.code === 'ENOENT') {
      log.debug(`No plugins directory found for stack ${stack}`);
      return [];
    }
    log.error(`Error scanning plugins for stack ${stack}: ${error.message}`);
    return [];
  }
}

/**
 * Load dynamic plugins (.js files) from a stack
 * @param {string} stack - Stack name
 * @param {string} workdir - Working directory
 * @returns {Promise<Array<{name: string, execute: Function}>>} Array of dynamic plugins
 */
async function loadDynamicPlugins(stack, workdir) {
  const pluginsPath = path.join(workdir, 'stacks', stack, 'plugins');
  const dynamicPlugins = [];

  try {
    const files = await fs.readdir(pluginsPath);
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const pluginPath = path.join(pluginsPath, file);
          const plugin = require(pluginPath);
          
          if (typeof plugin === 'function') {
            dynamicPlugins.push({
              name: file,
              execute: plugin
            });
            log.info(`Loaded dynamic plugin: ${stack}/${file}`);
          } else {
            log.error(`Plugin ${file} does not export a function`);
          }
        } catch (error) {
          log.error(`Error loading dynamic plugin ${file}: ${error.message}`);
        }
      }
    }
    
    // Sort plugins by name
    return dynamicPlugins.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    // If plugins directory doesn't exist, just return empty array
    if (error.code === 'ENOENT') {
      log.debug(`No plugins directory found for stack ${stack}`);
      return [];
    }
    log.error(`Error scanning plugins for stack ${stack}: ${error.message}`);
    return [];
  }
}

/**
 * Execute dynamic plugins with a timeout
 * @param {Array<{name: string, execute: Function}>} plugins - Dynamic plugins to execute
 * @param {Object} context - Context object for plugins
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function executeDynamicPlugins(plugins, context, timeout) {
  for (const plugin of plugins) {
    log.debug(`Executing dynamic plugin: ${plugin.name}`);
    
    try {
      const pluginPromise = plugin.execute(context);
      await Promise.race([
        pluginPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Plugin ${plugin.name} timed out after ${timeout}ms`)), timeout)
        )
      ]);
      log.debug(`Plugin ${plugin.name} executed successfully`);
    } catch (error) {
      log.error(`Error executing plugin ${plugin.name}: ${error.message}`);
      // Continue with next plugin
    }
  }
}

/**
 * Build a prompt from a file, including context files and static plugins
 * @param {string} filePath - Path to the prompt file
 * @param {string} workdir - Working directory
 * @param {string} stack - Stack name
 * @param {Array<{name: string, content: string}>} staticPlugins - Static plugins to include
 * @returns {Promise<string>} Complete prompt with context and plugins
 */
async function buildPrompt(filePath, workdir, stack, staticPlugins) {
  log.info(`Building prompt from ${filePath}`);
  
  try {
    let promptContent = await fs.readFile(filePath, 'utf8');
    
    // Check for context references
    const contextMatch = promptContent.match(/## Context: (.+)/);
    if (contextMatch) {
      const contextFiles = contextMatch[1].split(',').map(f => f.trim());
      
      for (const contextFile of contextFiles) {
        const contextPath = path.join(workdir, 'output', 'current', contextFile);
        try {
          const contextContent = await fs.readFile(contextPath, 'utf8');
          promptContent = promptContent.replace(
            `## Context: ${contextMatch[1]}`,
            `## Context: ${contextMatch[1]}\n\n\`\`\`\n${contextContent}\n\`\`\``
          );
        } catch (error) {
          log.error(`Error reading context file ${contextPath}: ${error.message}`);
          throw error;
        }
      }
    }
    
    // Append static plugin content
    if (staticPlugins.length > 0) {
      for (const plugin of staticPlugins) {
        log.debug(`Appending static plugin content: ${plugin.name}`);
        promptContent += `\n\n## Plugin: ${plugin.name}\n\n${plugin.content}`;
      }
    }
    
    return promptContent;
  } catch (error) {
    log.error(`Error building prompt from ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Process a prompt using an LLM API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - API options
 * @returns {Promise<string>} LLM response
 */
async function processLlm(prompt, options) {
  log.info('Processing prompt with LLM');
  
  if (options.dryRun) {
    log.warn('Dry run mode - would send prompt:');
    console.log(prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }
  
  if (!options.apiKey) {
    throw new Error('API key is required for LLM processing');
  }
  
  try {
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
    log.error(`Error calling LLM API: ${error.message}`);
    throw error;
  }
}

/**
 * Parse the LLM response to extract files
 * @param {string} response - LLM response
 * @returns {Array<{path: string, content: string}>} Extracted files
 */
function parseResponse(response) {
  log.info('Parsing LLM response');
  
  const files = [];
  const fileRegex = /File: (.+?)\n```(?:\w+)?\n([\s\S]+?)\n```/g;
  let match;
  
  while ((match = fileRegex.exec(response)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2]
    });
  }
  
  log.info(`Extracted ${files.length} files from response`);
  return files;
}

/**
 * Check if files would be overwritten
 * @param {Array<{path: string, content: string}>} files - Files to check
 * @param {string} outputDir - Output directory
 * @returns {Promise<boolean>} True if no files would be overwritten
 */
async function checkOverwrite(files, outputDir) {
  log.info('Checking for file overwrites');
  
  for (const file of files) {
    const filePath = path.join(outputDir, file.path);
    try {
      await fs.access(filePath);
      log.error(`File would be overwritten: ${filePath}`);
      return false;
    } catch (error) {
      // File doesn't exist, which is what we want
    }
  }
  
  return true;
}

/**
 * Write files to output directories
 * @param {Array<{path: string, content: string}>} files - Files to write
 * @param {string} stackOutputDir - Stack-specific output directory
 * @param {string} currentOutputDir - Current output directory
 * @returns {Promise<void>}
 */
async function writeFiles(files, stackOutputDir, currentOutputDir) {
  log.info(`Writing ${files.length} files`);
  
  for (const file of files) {
    const stackFilePath = path.join(stackOutputDir, file.path);
    const currentFilePath = path.join(currentOutputDir, file.path);
    
    // Ensure directories exist
    await fs.mkdir(path.dirname(stackFilePath), { recursive: true });
    await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
    
    // Write files
    await fs.writeFile(stackFilePath, file.content);
    await fs.writeFile(currentFilePath, file.content);
    
    log.success(`Written: ${file.path}`);
  }
}

/**
 * Run test command if provided
 * @param {string|null} testCmd - Test command to run
 * @returns {Promise<void>}
 */
async function runTests(testCmd) {
  if (!testCmd) {
    log.info('No test command provided, skipping tests');
    return;
  }
  
  log.info(`Running tests: ${testCmd}`);
  try {
    const output = execSync(testCmd, { encoding: 'utf8' });
    log.info('Test output:');
    console.log(output);
  } catch (error) {
    log.error(`Tests failed: ${error.message}`);
    throw error;
  }
}

/**
 * Load config from vibec.json
 * @param {string} workdir - Working directory
 * @returns {Promise<Object>} Configuration object
 */
async function loadConfig(workdir) {
  try {
    const configPath = path.join(workdir, 'vibec.json');
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    // If config doesn't exist, return empty object
    if (error.code === 'ENOENT') {
      log.debug('No vibec.json config found');
      return {};
    }
    log.error(`Error loading config: ${error.message}`);
    return {};
  }
}

/**
 * Main function
 * @param {string[]} argv - Command-line arguments
 * @returns {Promise<void>}
 */
async function main(argv) {
  log.info('Starting processing');
  
  const options = parseArgs(argv);
  log.debug('Options: ' + JSON.stringify(options));
  
  // Load config
  const config = await loadConfig(options.workdir);
  log.debug('Config: ' + JSON.stringify(config));
  
  // Get prompt files
  const promptFiles = await getPromptFiles(options.stacks, options.workdir, options.start, options.end);
  log.info(`Found ${promptFiles.length} prompt files to process`);
  
  for (const promptFile of promptFiles) {
    log.info(`\nProcessing ${promptFile.file} (${promptFile.number})`);
    
    // Load static plugins for each stack
    const staticPlugins = await loadStaticPlugins(promptFile.stack, options.workdir);
    
    // Load dynamic plugins for each stack
    const dynamicPlugins = await loadDynamicPlugins(promptFile.stack, options.workdir);
    
    // Build prompt with static plugins
    const prompt = await buildPrompt(promptFile.file, options.workdir, promptFile.stack, staticPlugins);
    
    // Setup output directory paths for this prompt
    const promptFileName = path.basename(promptFile.file, '.md');
    const stackOutputDir = path.join(options.workdir, 'output', 'stacks', promptFile.stack, promptFileName);
    const currentOutputDir = path.join(options.workdir, 'output', 'current');
    
    // Execute dynamic plugins with context
    const pluginContext = {
      config,
      stack: promptFile.stack,
      promptNumber: promptFile.number,
      promptContent: prompt,
      workingDir: currentOutputDir
    };
    
    await executeDynamicPlugins(dynamicPlugins, pluginContext, options.pluginTimeout);
    
    // Process with LLM
    const response = await processLlm(prompt, options);
    
    // Parse response
    const files = parseResponse(response);
    
    if (files.length === 0) {
      log.warn('Warning: No files extracted from LLM response');
      continue;
    }
    
    // Check for overwrites if needed
    if (options.noOverwrite) {
      const canWrite = await checkOverwrite(files, currentOutputDir);
      if (!canWrite) {
        throw new Error('File overwrite prevented by --no-overwrite flag');
      }
    }
    
    // Write files
    await writeFiles(files, stackOutputDir, currentOutputDir);
  }
  
  // Run tests
  await runTests(options.testCmd);
  
  log.success('Processing completed successfully');
}

// Run main function if script is executed directly
if (require.main === module) {
  main(process.argv).catch(error => {
    log.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  log,
  parseArgs,
  getPromptFiles,
  loadStaticPlugins,
  loadDynamicPlugins,
  executeDynamicPlugins,
  buildPrompt,
  processLlm,
  parseResponse,
  checkOverwrite,
  writeFiles,
  runTests,
  main
};