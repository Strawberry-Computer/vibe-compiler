#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(baseDir, stacks = ['core', 'tests']) {
  let highestStage = 0;
  
  for (const stack of stacks) {
    const stackDir = path.join(baseDir, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (match) {
          const stage = parseInt(match[1], 10);
          if (stage > highestStage) {
            highestStage = stage;
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${stackDir}:`, err.message);
    }
  }
  
  return highestStage;
}

async function runStage(vibecPath, stage, stacks = 'core,tests') {
  console.log(`\n\nRunning stage ${stage}...`);
  
  const apiUrl = process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1';
  const apiKey = process.env.VIBEC_API_KEY;
  const model = process.env.VIBEC_MODEL || 'anthropic/claude-3.7-sonnet';
  
  const args = [
    vibecPath,
    '--start', String(stage),
    '--end', String(stage),
    '--stacks', stacks,
    '--test-cmd', 'sh output/current/test.sh',
    '--api-url', apiUrl,
    '--api-key', apiKey,
    '--model', model
  ];
  
  console.log(`Executing: node ${args.join(' ')}`);
  
  const result = spawnSync('node', args, {
    stdio: 'inherit',
    env: process.env
  });
  
  return result;
}

async function bootstrap() {
  try {
    const currentDir = process.cwd();
    const outputDir = path.join(currentDir, 'output', 'current');
    const binDir = path.join(outputDir, 'bin');
    
    // Ensure directories exist
    await fs.mkdir(path.join(outputDir, 'bin'), { recursive: true });
    
    // Copy test.sh if missing
    const testShPath = path.join(outputDir, 'test.sh');
    try {
      await fs.access(testShPath);
      console.log('test.sh already exists, skipping copy');
    } catch (err) {
      console.log('Copying test.sh to output/current/');
      await fs.copyFile(path.join(currentDir, 'bin', 'test.sh'), testShPath);
      await fs.chmod(testShPath, 0o755);
    }
    
    // Copy vibec.js if missing
    const vibecJsPath = path.join(binDir, 'vibec.js');
    try {
      await fs.access(vibecJsPath);
      console.log('vibec.js already exists, skipping copy');
    } catch (err) {
      console.log('Copying vibec.js to output/current/bin/');
      await fs.copyFile(path.join(currentDir, 'bin', 'vibec.js'), vibecJsPath);
      await fs.chmod(vibecJsPath, 0o644);
    }
    
    // Get the highest stage
    const stacks = ['core', 'tests'];
    const highestStage = await getHighestStage(currentDir, stacks);
    console.log(`Highest stage found: ${highestStage}`);
    
    // Run stages 1 to highest
    for (let stage = 1; stage <= highestStage; stage++) {
      const result = await runStage(vibecJsPath, stage, stacks.join(','));
      if (result.error || result.status !== 0) {
        console.error(`Stage ${stage} failed with status ${result.status}`);
        process.exit(result.status || 1);
      }
    }
    
    console.log('\nAll stages completed successfully!');
  } catch (error) {
    console.error('Error during bootstrap:', error);
    process.exit(1);
  }
}

bootstrap().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
