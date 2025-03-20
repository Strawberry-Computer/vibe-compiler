#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

// Log with colors
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  debug: (msg) => process.env.VIBEC_DEBUG && console.log(`${colors.dim}🔍 ${msg}${colors.reset}`),
  highlight: (msg) => `${colors.bright}${msg}${colors.reset}`,
  code: (msg) => `${colors.magenta}${msg}${colors.reset}`
};

// Simple argument parser
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    stacks: (process.env.VIBEC_STACKS || 'core,generation,tests').split(','),
    testCmd: process.env.VIBEC_TEST_CMD || 'npm test',
    retries: parseInt(process.env.VIBEC_RETRIES || '0', 10),
    pluginTimeout: parseInt(process.env.VIBEC_PLUGIN_TIMEOUT || '10000', 10),
    noOverwrite: false,
    apiUrl: process.env.VIBEC_API_URL || 'https://api.openai.com/v1',
    apiModel: process.env.VIBEC_API_MODEL || 'gpt-4',
    apiKey: process.env.VIBEC_API_KEY || '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--stacks=')) {
      options.stacks = arg.substring('--stacks='.length).split(',');
    } else if (arg.startsWith('--test-cmd=')) {
      options.testCmd = arg.substring('--test-cmd='.length);
    } else if (arg.startsWith('--retries=')) {
      options.retries = parseInt(arg.substring('--retries='.length), 10);
    } else if (arg.startsWith('--plugin-timeout=')) {
      options.pluginTimeout = parseInt(arg.substring('--plugin-timeout='.length), 10);
    } else if (arg === '--no-overwrite') {
      options.noOverwrite = true;
    } else if (arg.startsWith('--api-url=')) {
      options.apiUrl = arg.substring('--api-url='.length);
    } else if (arg.startsWith('--api-model=')) {
      options.apiModel = arg.substring('--api-model='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Vibe Compiler (vibec) - A self-compiling tool for LLM-powered code generation

Usage: vibec [options]

Options:
  --stacks=<list>         Comma-separated list of stacks to process (default: core,generation,tests)
  --test-cmd=<command>    Command to run tests (default: npm test)
  --retries=<number>      Number of retries for failed tests (default: 0)
  --plugin-timeout=<ms>   Timeout for JS plugins in milliseconds (default: 10000)
  --no-overwrite          Fail if output/current/ files would be overwritten
  --api-url=<url>         LLM API endpoint URL
  --api-model=<model>     LLM model to use
  --help, -h              Show this help message
  --version, -v           Show version information

Environment Variables:
  VIBEC_STACKS            Same as --stacks
  VIBEC_TEST_CMD          Same as --test-cmd
  VIBEC_RETRIES           Same as --retries
  VIBEC_PLUGIN_TIMEOUT    Same as --plugin-timeout
  VIBEC_API_URL           Same as --api-url
  VIBEC_API_MODEL         Same as --api-model
  VIBEC_API_KEY           API key for LLM service
  VIBEC_DEBUG             Enable debug logging
      `);
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log('vibec version 1.0.0');
      process.exit(0);
    }
  }
  
  return options;
};

// Load config from vibec.json if exists
const loadConfig = async () => {
  try {
    const configData = await fs.readFile('vibec.json', 'utf8');
    return JSON.parse(configData);
  } catch (err) {
    return {};
  }
};

// Ensure directories exist
const ensureDirectories = async (stacks) => {
  await fs.mkdir('output', { recursive: true });
  await fs.mkdir('output/current', { recursive: true });
  await fs.mkdir('output/stages', { recursive: true });
  
  for (const stack of stacks) {
    await fs.mkdir(`output/current/${stack}`, { recursive: true });
  }
};

// Get all prompt files sorted by numerical prefix
const getPromptFiles = async (stacks) => {
  const prompts = [];
  
  for (const stack of stacks) {
    try {
      const files = await fs.readdir(`stacks/${stack}`);
      const mdFiles = files.filter(file => file.endsWith('.md'));
      
      for (const file of mdFiles) {
        const match = file.match(/^(\d+)_/);
        if (match) {
          prompts.push({
            stack,
            file,
            number: parseInt(match[1], 10)
          });
        }
      }
    } catch (err) {
      log.warn(`Stack directory stacks/${stack} not found or empty`);
    }
  }
  
  // Sort by number first, then by stack order (as specified in the stacks array)
  return prompts.sort((a, b) => {
    if (a.number !== b.number) {
      return a.number - b.number;
    }
    return stacks.indexOf(a.stack) - stacks.indexOf(b.stack);
  });
};

// Load hash file
const loadHashFile = async () => {
  try {
    const hashData = await fs.readFile('.vibec_hashes.json', 'utf8');
    return JSON.parse(hashData);
  } catch (err) {
    return {};
  }
};

// Save hash file
const saveHashFile = async (hashData) => {
  await fs.writeFile('.vibec_hashes.json', JSON.stringify(hashData, null, 2));
};

// Hash prompt content
const hashPrompt = (content) => {
  return crypto.createHash('md5').update(content).digest('hex');
};

// Load prompt plugins
const loadPromptPlugins = async (stack) => {
  const plugins = {
    static: [],
    dynamic: []
  };

  try {
    const files = await fs.readdir(`stacks/plugins`);
    
    for (const file of files) {
      const fullPath = path.join('stacks/plugins', file);
      
      if (file.endsWith('.md')) {
        const content = await fs.readFile(fullPath, 'utf8');
        plugins.static.push(content);
      } else if (file.endsWith('.js')) {
        try {
          const plugin = require(path.resolve(fullPath));
          plugins.dynamic.push({ name: file, plugin });
        } catch (err) {
          log.error(`Error loading JS plugin ${file}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    // plugins directory might not exist, which is fine
  }
  
  return plugins;
};

// Execute plugins with timeout
const executePlugin = async (plugin, context, timeout) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Plugin execution timed out after ${timeout}ms`));
    }, timeout);
    
    Promise.resolve(plugin(context))
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
};

// Parse prompt output sections
const parseOutputSections = (content) => {
  const outputFiles = [];
  const lines = content.split('\n');
  
  let currentOutput = null;
  let currentContent = [];
  
  for (const line of lines) {
    const outputMatch = line.match(/^## Output: (.+)$/);
    if (outputMatch) {
      if (currentOutput) {
        outputFiles.push({
          path: currentOutput,
          content: currentContent.join('\n')
        });
      }
      currentOutput = outputMatch[1];
      currentContent = [];
    } else if (currentOutput) {
      currentContent.push(line);
    }
  }
  
  if (currentOutput) {
    outputFiles.push({
      path: currentOutput,
      content: currentContent.join('\n')
    });
  }
  
  return outputFiles;
};

// Write output files
const writeOutputFiles = async (stageDir, files) => {
  for (const file of files) {
    const filePath = path.join(stageDir, file.path);
    const fileDir = path.dirname(filePath);
    
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.content);
  }
};

// Run tests
const runTests = async (testCmd) => {
  try {
    const output = execSync(testCmd, { encoding: 'utf8' });
    return { success: true, errorCode: 0, stdout: output, stderr: '' };
  } catch (err) {
    return { 
      success: false, 
      errorCode: err.status || 1, 
      stdout: err.stdout || '', 
      stderr: err.stderr || '' 
    };
  }
};

// Process an LLM request using OpenAI-compatible API
const processLlmRequest = async (prompt, options) => {
  if (!options.apiKey) {
    log.warn('No API key provided. Using prompt parsing only (demo mode).');
    log.warn('Set VIBEC_API_KEY environment variable for full functionality.');
    return prompt;
  }

  log.info(`Processing prompt with LLM (${prompt.length} chars)`);
  
  const url = new URL('/chat/completions', options.apiUrl);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const requestData = JSON.stringify({
    model: options.apiModel,
    messages: [
      { role: 'system', content: 'You are a helpful assistant that generates code based on prompts. Please provide code that matches the requirements.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 4000
  });
  
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`,
          'Content-Length': Buffer.byteLength(requestData)
        }
      },
      (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              const generatedText = response.choices[0].message.content;
              resolve(generatedText);
            } catch (err) {
              reject(new Error(`Failed to parse API response: ${err.message}`));
            }
          } else {
            reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    
    req.on('error', (err) => {
      reject(new Error(`API request error: ${err.message}`));
    });
    
    req.write(requestData);
    req.end();
  });
};

// Check if current output would be overwritten
const checkOverwrite = async (stacks, noOverwrite) => {
  if (!noOverwrite) {
    return;
  }
  
  let hasExistingFiles = false;
  
  for (const stack of stacks) {
    try {
      const currentDir = `output/current/${stack}`;
      const files = await fs.readdir(currentDir);
      
      if (files.length > 0) {
        hasExistingFiles = true;
        break;
      }
    } catch (err) {
      // Directory doesn't exist, which is fine
    }
  }
  
  if (hasExistingFiles) {
    log.error('Files would be overwritten in output/current/ and --no-overwrite is set');
    process.exit(1);
  }
};

// Merge stage outputs to current
const mergeStagesToCurrent = async (stacks) => {
  const stagesDir = 'output/stages';
  const currentDir = 'output/current';
  
  // Get all stage directories
  const stageDirs = await fs.readdir(stagesDir);
  const sortedStageDirs = stageDirs.sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    return numA - numB;
  });
  
  log.info(`Merging ${sortedStageDirs.length} stages to output/current/`);
  
  // Process each stage directory
  for (const stageDir of sortedStageDirs) {
    const fullStageDir = path.join(stagesDir, stageDir);
    
    for (const stack of stacks) {
      const stageStackDir = path.join(fullStageDir, stack);
      const currentStackDir = path.join(currentDir, stack);
      
      try {
        // Create output directory if it doesn't exist
        await fs.mkdir(currentStackDir, { recursive: true });
        
        // Copy all files from stage stack to current stack
        const files = await fs.readdir(stageStackDir);
        
        for (const file of files) {
          const sourceFile = path.join(stageStackDir, file);
          const targetFile = path.join(currentStackDir, file);
          
          // Check if it's a directory
          const stats = await fs.stat(sourceFile);
          
          if (stats.isDirectory()) {
            // Recursively copy directories
            const copyDir = async (src, dest) => {
              await fs.mkdir(dest, { recursive: true });
              const entries = await fs.readdir(src);
              
              for (const entry of entries) {
                const srcPath = path.join(src, entry);
                const destPath = path.join(dest, entry);
                const entryStats = await fs.stat(srcPath);
                
                if (entryStats.isDirectory()) {
                  await copyDir(srcPath, destPath);
                } else {
                  await fs.copyFile(srcPath, destPath);
                }
              }
            };
            
            await copyDir(sourceFile, targetFile);
          } else {
            // Copy file
            await fs.copyFile(sourceFile, targetFile);
          }
        }
      } catch (err) {
        // Stack directory might not exist in this stage, which is fine
      }
    }
  }
};

// Main function
const main = async () => {
  log.info('Vibe Compiler (vibec) - Starting compilation process');
  
  // Parse CLI args
  const cliArgs = parseArgs();
  
  // Load config
  const config = await loadConfig();
  
  // Merge config with CLI args (CLI args take precedence)
  const options = {
    stacks: cliArgs.stacks || config.stacks || ['core', 'generation', 'tests'],
    testCmd: cliArgs.testCmd || config.testCmd || 'npm test',
    retries: cliArgs.retries !== undefined ? cliArgs.retries : (config.retries || 0),
    pluginTimeout: cliArgs.pluginTimeout || config.pluginTimeout || 10000,
    noOverwrite: cliArgs.noOverwrite || false,
    apiUrl: cliArgs.apiUrl || config.apiUrl || 'https://api.openai.com/v1',
    apiModel: cliArgs.apiModel || config.apiModel || 'gpt-4',
    apiKey: process.env.VIBEC_API_KEY || '',
    pluginParams: config.pluginParams || {}
  };
  
  // Check if current output would be overwritten
  await checkOverwrite(options.stacks, options.noOverwrite);
  
  // Ensure directories exist
  await ensureDirectories(options.stacks);
  
  // Get all prompt files
  const promptFiles = await getPromptFiles(options.stacks);
  
  if (promptFiles.length === 0) {
    log.warn('No prompt files found in specified stacks');
    process.exit(0);
  }
  
  log.info(`Found ${promptFiles.length} prompt files across ${options.stacks.length} stacks`);
  
  // Load hash file
  const hashData = await loadHashFile();
  
  // Group prompts by numerical stage
  const stagePrompts = {};
  for (const prompt of promptFiles) {
    if (!stagePrompts[prompt.number]) {
      stagePrompts[prompt.number] = [];
    }
    stagePrompts[prompt.number].push(prompt);
  }
  
  // Process each stage
  for (const [stage, prompts] of Object.entries(stagePrompts)) {
    log.info(`\nProcessing Stage ${stage} (${prompts.length} prompts)`);
    
    // Create stage directory
    const stageDir = path.join('output/stages', stage.padStart(3, '0'));
    await fs.mkdir(stageDir, { recursive: true });
    
    // Process each prompt in the stage
    for (const prompt of prompts) {
      const promptPath = path.join('stacks', prompt.stack, prompt.file);
      log.info(`\nProcessing ${log.highlight(promptPath)}`);
      
      // Load prompt content
      const promptContent = await fs.readFile(promptPath, 'utf8');
      const promptHash = hashPrompt(promptContent);
      
      // Check if hash has changed
      const hashKey = `${prompt.stack}/${prompt.file}`;
      const cachedHash = hashData[hashKey]?.hash;
      
      if (cachedHash === promptHash && hashData[hashKey]?.success) {
        log.success(`Prompt unchanged and previously succeeded, skipping`);
        continue;
      }
      
      // Load plugins
      const plugins = await loadPromptPlugins(prompt.stack);
      
      log.info(`Loaded ${plugins.static.length} static and ${plugins.dynamic.length} dynamic plugins`);
      
      // Create context for dynamic plugins
      const pluginContext = {
        config: { ...config, pluginParams: options.pluginParams },
        stack: prompt.stack,
        promptNumber: prompt.number,
        promptContent,
        workingDir: path.resolve('output/current'),
        testCmd: options.testCmd,
        testResult: hashData[hashKey]?.testResult
      };
      
      // Process dynamic plugins
      let dynamicContent = [];
      for (const { name, plugin } of plugins.dynamic) {
        try {
          log.info(`Executing plugin ${log.code(name)}`);
          const result = await executePlugin(plugin, pluginContext, options.pluginTimeout);
          dynamicContent.push(result);
        } catch (err) {
          log.error(`Error executing plugin ${name}: ${err.message}`);
        }
      }
      
      // Build final prompt
      const finalPrompt = [
        promptContent,
        ...plugins.static,
        ...dynamicContent
      ].join('\n\n');
      
      // Process with LLM
      let llmResponse;
      try {
        llmResponse = await processLlmRequest(finalPrompt, options);
      } catch (err) {
        log.error(`LLM request failed: ${err.message}`);
        if (!options.apiKey) {
          log.info('Falling back to prompt parsing for demo mode');
          llmResponse = finalPrompt;
        } else {
          continue; // Skip this prompt if LLM request failed
        }
      }
      
      // Parse output sections
      const outputFiles = parseOutputSections(llmResponse);
      
      log.info(`Generated ${outputFiles.length} output files`);
      
      // Create stack directory in stage
      const stageStackDir = path.join(stageDir, prompt.stack);
      await fs.mkdir(stageStackDir, { recursive: true });
      
      // Write output files
      await writeOutputFiles(stageStackDir, outputFiles);
      
      // Run tests
      let testResult = null;
      let success = false;
      let attemptsLeft = options.retries + 1;
      
      while (attemptsLeft > 0 && !success) {
        log.info(`Running tests (${log.code(options.testCmd)}), attempts left: ${attemptsLeft}`);
        
        testResult = await runTests(options.testCmd);
        success = testResult.success;
        
        if (success) {
          log.success(`Tests passed successfully`);
        } else {
          log.error(`Tests failed with exit code ${testResult.errorCode}`);
          
          // Print test output for debugging
          if (testResult.stdout) {
            log.debug(`Test stdout:\n${testResult.stdout}`);
          }
          if (testResult.stderr) {
            log.debug(`Test stderr:\n${testResult.stderr}`);
          }
          
          attemptsLeft--;
          
          if (attemptsLeft > 0) {
            log.info(`Retrying (${attemptsLeft} attempts left)...`);
            
            // Update plugin context with test result
            pluginContext.testResult = testResult;
            
            // Re-run dynamic plugins
            dynamicContent = [];
            for (const { name, plugin } of plugins.dynamic) {
              try {
                log.info(`Re-executing plugin ${log.code(name)} with test results`);
                const result = await executePlugin(plugin, pluginContext, options.pluginTimeout);
                dynamicContent.push(result);
              } catch (err) {
                log.error(`Error executing plugin ${name}: ${err.message}`);
              }
            }
            
            // Rebuild prompt with test results
            const retryPrompt = [
              promptContent,
              ...plugins.static,
              ...dynamicContent
            ].join('\n\n');
            
            // Process with LLM again
            try {
              const retryResponse = await processLlmRequest(retryPrompt, options);
              
              // Parse output sections
              const retryOutputFiles = parseOutputSections(retryResponse);
              
              log.info(`Generated ${retryOutputFiles.length} output files in retry`);
              
              // Write output files
              await writeOutputFiles(stageStackDir, retryOutputFiles);
            } catch (err) {
              log.error(`LLM retry request failed: ${err.message}`);
              // Continue to next retry
            }
          }
        }
      }
      
      // Update hash data
      hashData[hashKey] = {
        hash: promptHash,
        success,
        testResult
      };
      
      // Save hash file after each prompt
      await saveHashFile(hashData);
    }
  }
  
  // Merge stages to current
  await mergeStagesToCurrent(options.stacks);
  
  log.success('\nCompilation completed successfully!');
};

// Run main function
main().catch(err => {
  log.error(`Error: ${err.message}`);
  process.exit(1);
});
