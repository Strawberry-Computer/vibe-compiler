#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

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
    testCmd: null
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
      console.error(`Error reading stack directory ${stackDir}:`, error.message);
      throw error;
    }
  }

  return promptFiles.sort((a, b) => a.number - b.number);
}

/**
 * Build a prompt by reading a file and appending context
 * @param {string} filePath - Path to the prompt file
 * @param {string} workdir - Working directory
 * @returns {Promise<string>} The built prompt
 */
async function buildPrompt(filePath, workdir) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Extract context files from the prompt content
    const contextMatch = content.match(/## Context: (.+)/);
    if (!contextMatch) {
      return content;
    }
    
    const contextFiles = contextMatch[1].split(',').map(file => file.trim());
    let contextContent = '';
    
    for (const file of contextFiles) {
      const contextFilePath = path.join(workdir, 'output', 'current', file);
      try {
        const fileContent = await fs.readFile(contextFilePath, 'utf8');
        contextContent += `\n\n### ${file}:\n\`\`\`\n${fileContent}\n\`\`\``;
      } catch (error) {
        console.warn(`Warning: Could not read context file ${contextFilePath}: ${error.message}`);
      }
    }
    
    return content.replace(/## Context: .+/, `## Context: ${contextMatch[1]}${contextContent}`);
  } catch (error) {
    console.error(`Error building prompt from ${filePath}:`, error.message);
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
    console.log('DRY RUN - Prompt:', prompt);
    return 'File: example/file\n```lang\ncontent\n```';
  }

  if (!options.apiKey) {
    throw new Error('API key is required for LLM processing');
  }

  try {
    console.log('Sending request to LLM API...');
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
    console.error('Error processing prompt with LLM:', error.message);
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

  console.log(`Extracted ${files.length} file(s) from LLM response`);
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
    console.log(`Running tests with command: ${testCmd}`);
    execSync(testCmd, { cwd: workdir, stdio: 'inherit' });
    console.log('Tests passed successfully');
    return true;
  } catch (error) {
    console.error('Tests failed:', error.message);
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
    console.log('DRY RUN - Would write files:', files.map(f => f.path).join(', '));
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

    console.log(`Wrote file: ${file.path}`);
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
    console.log('Cleared current directory for reconstruction');
  } catch (error) {
    console.error('Error clearing current directory:', error.message);
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
      
      console.log(`Reconstructed output from ${prompt.stack}/${baseName}`);
    } catch (error) {
      console.warn(`Warning: Could not reconstruct output from ${stackOutputDir}: ${error.message}`);
    }
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
    console.log('Running with options:', options);

    // Get all prompt files
    let promptFiles = await getPromptFiles(options.stacks, options.workdir);
    console.log(`Found ${promptFiles.length} prompt files in stacks: ${options.stacks.join(', ')}`);

    // Filter based on start/end if provided
    if (options.start !== null) {
      promptFiles = promptFiles.filter(p => p.number >= options.start);
    }
    if (options.end !== null) {
      promptFiles = promptFiles.filter(p => p.number <= options.end);
    }
    console.log(`Processing ${promptFiles.length} prompt files after filtering by range`);

    // Reconstruct current directory if starting from a higher number
    await reconstructCurrent(options.start, await getPromptFiles(options.stacks, options.workdir), options.workdir);

    // Process each prompt file
    for (const promptFile of promptFiles) {
      console.log(`\nProcessing prompt file: ${promptFile.file} (${promptFile.number})`);
      
      // Build the prompt
      const prompt = await buildPrompt(promptFile.file, options.workdir);
      
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
    
    console.log('\nProcessing completed successfully');
  } catch (error) {
    console.error('Error in main process:', error.message);
    throw error;
  }
}

// Execute main only if run directly
if (require.main === module) {
  main(process.argv).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export functions
module.exports = {
  parseArgs,
  getPromptFiles,
  buildPrompt,
  processLlm,
  parseResponse,
  runTests,
  checkOverwrite,
  writeFiles,
  reconstructCurrent,
  main
};
