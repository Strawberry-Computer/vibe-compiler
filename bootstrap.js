#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacksDir = ['core', 'tests']) {
  let maxStage = 0;

  for (const stack of stacksDir) {
    const dirPath = path.join('stacks', stack);
    
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (match) {
          const stage = parseInt(match[1], 10);
          if (stage > maxStage) {
            maxStage = stage;
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dirPath}:`, err.message);
    }
  }

  return maxStage;
}

async function runStage(vibecPath, stage, stacks = 'core,tests') {
  console.log('\n\n');
  console.log(`Running stage ${stage}...`);

  const args = [
    vibecPath,
    '--start', stage.toString(),
    '--end', stage.toString(),
    '--stacks', stacks,
    '--test-cmd', 'sh output/current/test.sh',
    '--api-url', process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1',
    '--api-key', process.env.VIBEC_API_KEY,
    '--api-model', process.env.VIBEC_API_MODEL || 'anthropic/claude-3.7-sonnet'
  ];

  const result = spawnSync('node', args, {
    stdio: 'inherit',
    env: process.env
  });

  return result;
}

async function bootstrap() {
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir('output/current', { recursive: true });
    await fs.mkdir('output/current/bin', { recursive: true });

    // Copy test.sh if missing
    const testShPath = 'output/current/test.sh';
    try {
      await fs.access(testShPath);
    } catch (err) {
      console.log('Copying test.sh...');
      await fs.copyFile('bin/test.sh', testShPath);
      await fs.chmod(testShPath, 0o755);
    }

    // Copy vibec.js if missing
    const vibecJsPath = 'output/current/bin/vibec.js';
    try {
      await fs.access(vibecJsPath);
    } catch (err) {
      console.log('Copying vibec.js...');
      await fs.copyFile('bin/vibec.js', vibecJsPath);
      await fs.chmod(vibecJsPath, 0o644);
    }

    // Get highest stage
    const vibecPath = path.join('output/current/bin/vibec.js');
    const stacks = ['core', 'tests'];
    const highestStage = await getHighestStage(stacks);
    console.log(`Highest stage found: ${highestStage}`);

    // Run stages 1 to highest
    for (let stage = 1; stage <= highestStage; stage++) {
      const result = await runStage(vibecPath, stage, stacks.join(','));
      if (result.status !== 0) {
        console.error(`Stage ${stage} failed with code ${result.status}`);
        process.exit(result.status);
      }
    }

    console.log('All stages completed successfully.');
  } catch (err) {
    console.error('Bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
