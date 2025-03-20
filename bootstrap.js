#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { spawnSync, execSync } = require('child_process');

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
  highlight: (msg) => `${colors.bright}${msg}${colors.reset}`
};

/**
 * Find the best available vibec implementation
 */
async function findBestVibec() {
  // Try the bin version first (should always exist)
  const binPath = path.join('bin', 'vibec.js');
  
  try {
    await fs.access(binPath);
    log.info(`Found base vibec implementation at ${log.highlight(binPath)}`);
    return binPath;
  } catch (err) {
    log.error(`No vibec implementation found at ${binPath}`);
    log.error(`Please ensure bin/vibec.js exists before running bootstrap`);
    process.exit(1);
  }
}

/**
 * Check if a stage generated a new vibec
 */
async function checkForGeneratedVibec(stageNum) {
  const stagePath = path.join('output', 'stages', stageNum.toString().padStart(3, '0'), 'core', 'vibec.js');
  
  try {
    await fs.access(stagePath);
    const stats = await fs.stat(stagePath);
    
    if (stats.size > 0) {
      log.success(`Stage ${stageNum} generated a new vibec implementation`);
      return stagePath;
    }
  } catch (err) {
    // No vibec found, which is fine
  }
  
  return null;
}

/**
 * Get the highest stage number from stacks
 */
async function getHighestStage() {
  const stacks = ['core', 'generation', 'tests'];
  let highestStage = 0;
  
  for (const stack of stacks) {
    try {
      const stackDir = path.join('stacks', stack);
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        if (file.endsWith('.md')) {
          const match = file.match(/^(\d+)_/);
          if (match) {
            const stage = parseInt(match[1], 10);
            highestStage = Math.max(highestStage, stage);
          }
        }
      }
    } catch (err) {
      // Stack dir doesn't exist, which is fine
    }
  }
  
  return highestStage;
}

/**
 * Run vibec for a specific stage
 */
async function runVibecForStage(vibecPath, stage, config) {
  const stageStr = stage.toString().padStart(3, '0');
  log.info(`Running stage ${stageStr} with vibec from ${log.highlight(vibecPath)}`);
  
  // Build CLI args from config
  const cliArgs = [
    `--stacks=${config.stacks.join(',')}`,
    `--test-cmd="${config.testCmd}"`,
    `--retries=${config.retries}`
  ];
  
  if (config.pluginTimeout) {
    cliArgs.push(`--plugin-timeout=${config.pluginTimeout}`);
  }
  
  if (config.apiUrl) {
    cliArgs.push(`--api-url=${config.apiUrl}`);
  }
  
  if (config.apiModel) {
    cliArgs.push(`--api-model=${config.apiModel}`);
  }
  
  // Filter stacks to only include those with prompts for this stage
  const filteredStacks = [];
  log.info(`Looking for stage ${stageStr} prompts in stacks: ${config.stacks.join(', ')}`);
  
  for (const stack of config.stacks) {
    try {
      const stackDir = path.join('stacks', stack);
      log.debug(`Checking directory: ${stackDir}`);
      
      const files = await fs.readdir(stackDir);
      const stagePrompts = files.filter(file => file.startsWith(`${stage}_`) && file.endsWith('.md'));
      
      if (stagePrompts.length > 0) {
        filteredStacks.push(stack);
        log.info(`Found ${stagePrompts.length} prompts in ${stack} stack: ${stagePrompts.join(', ')}`);
      } else {
        log.debug(`No matching prompts found in ${stack} stack`);
      }
    } catch (err) {
      log.debug(`Error reading stack directory ${stack}: ${err.message}`);
    }
  }
  
  if (filteredStacks.length === 0) {
    log.warn(`No prompts found for stage ${stageStr} in any stack, skipping`);
    return true;
  }
  
  // Override stacks with filtered ones
  cliArgs[0] = `--stacks=${filteredStacks.join(',')}`;
  log.info(`Processing stage ${stageStr} with stacks: ${filteredStacks.join(', ')}`);
  
  // Make vibec executable
  try {
    await fs.chmod(vibecPath, 0o755);
  } catch (err) {
    log.warn(`Could not make ${vibecPath} executable: ${err.message}`);
  }
  
  // Run vibec
  const result = spawnSync('node', [vibecPath, ...cliArgs], {
    stdio: 'inherit',
    shell: true
  });
  
  if (result.status !== 0) {
    log.error(`Stage ${stageStr} failed with exit code ${result.status}`);
    return false;
  }
  
  log.success(`Stage ${stageStr} completed successfully`);
  return true;
}

/**
 * Main bootstrap function
 */
async function bootstrap() {
  log.info(`Starting progressive bootstrap process for vibec`);
  
  // Load config if it exists
  let config = {
    stacks: ['core', 'generation', 'tests'],
    testCmd: 'npm test',
    retries: 2
  };
  
  try {
    const configData = await fs.readFile('vibec.json', 'utf8');
    const userConfig = JSON.parse(configData);
    config = { ...config, ...userConfig };
    log.success(`Loaded configuration from vibec.json`);
    log.debug(`Config: ${JSON.stringify(config, null, 2)}`);
  } catch (err) {
    log.warn(`No vibec.json found, using default configuration`);
  }
  
  // Find the initial vibec implementation
  let currentVibec = await findBestVibec();
  
  // Get the highest stage number
  const highestStage = await getHighestStage();
  log.info(`Found ${highestStage} stages to process`);
  
  // Process each stage in order
  for (let stage = 1; stage <= highestStage; stage++) {
    // Run vibec for this stage
    const success = await runVibecForStage(currentVibec, stage, config);
    
    if (!success) {
      log.error(`Bootstrap process failed at stage ${stage}`);
      process.exit(1);
    }
    
    // Check if this stage generated a new vibec
    const generatedVibec = await checkForGeneratedVibec(stage);
    
    if (generatedVibec) {
      log.info(`Switching to newly generated vibec for subsequent stages`);
      currentVibec = generatedVibec;
    }
  }
  
  log.success(`Bootstrap process completed successfully!`);
  log.info(`Final vibec implementation: ${log.highlight(currentVibec)}`);
  
  // Copy final implementation to output/current if needed
  const finalDir = path.join('output', 'current', 'core');
  const finalPath = path.join(finalDir, 'vibec.js');
  
  try {
    await fs.mkdir(finalDir, { recursive: true });
    await fs.copyFile(currentVibec, finalPath);
    await fs.chmod(finalPath, 0o755);
    log.success(`Final vibec implementation copied to ${log.highlight(finalPath)}`);
  } catch (err) {
    log.warn(`Could not copy final implementation: ${err.message}`);
  }
}

// Run bootstrap
bootstrap().catch(err => {
  log.error(`Bootstrap error: ${err.message}`);
  process.exit(1);
});
