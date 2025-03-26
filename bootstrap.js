#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacks = ['core', 'tests']) {
  let highestStage = 0;

  for (const stack of stacks) {
    const dir = `stacks/${stack}/`;
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (match) {
          const stage = parseInt(match[1], 10);
          highestStage = Math.max(highestStage, stage);
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err);
    }
  }

  return highestStage;
}

async function checkNewFile(stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = `output/stages/${paddedStage}/${filename}`;
  
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

function runStage(vibecPath, stage) {
  console.log(`\n\nRunning stage ${stage}...`);
  
  const result = spawnSync('node', [
    vibecPath,
    `--start=${stage}`,
    `--end=${stage}`,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh'
  ], {
    stdio: 'inherit'
  });
  
  if (result.error) {
    throw new Error(`Failed to run stage ${stage}: ${result.error.message}`);
  }
  
  if (result.status !== 0) {
    throw new Error(`Stage ${stage} failed with exit code ${result.status}`);
  }
  
  return result;
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const startStageArg = args.find(arg => arg.startsWith('--start='));
  const endStageArg = args.find(arg => arg.startsWith('--end='));
  
  const startStage = startStageArg ? parseInt(startStageArg.split('=')[1], 10) : 1;
  let endStage = endStageArg ? parseInt(endStageArg.split('=')[1], 10) : await getHighestStage();
  
  console.log(`Bootstrapping stages ${startStage} to ${endStage}`);
  
  // Create necessary directories
  await fs.mkdir('output/current/bin', { recursive: true });
  
  // Copy test script if it doesn't exist
  const testShPath = 'output/current/test.sh';
  try {
    await fs.access(testShPath);
    console.log('test.sh already exists, skipping copy');
  } catch (err) {
    console.log('Copying test.sh...');
    await fs.copyFile('bin/test.sh', testShPath);
    await fs.chmod(testShPath, 0o755);
  }
  
  // Copy vibec.js if it doesn't exist
  const vibecPath = 'output/current/bin/vibec.js';
  try {
    await fs.access(vibecPath);
    console.log('vibec.js already exists, skipping copy');
  } catch (err) {
    console.log('Copying vibec.js...');
    await fs.mkdir(path.dirname(vibecPath), { recursive: true });
    await fs.copyFile('bin/vibec.js', vibecPath);
    await fs.chmod(vibecPath, 0o644);
  }
  
  // Run each stage
  for (let stage = startStage; stage <= endStage; stage++) {
    runStage(vibecPath, stage);
    
    // Update vibec.js if a new version exists
    if (await checkNewFile(stage, 'bin/vibec.js')) {
      console.log(`Updating vibec.js from stage ${stage}...`);
      const paddedStage = String(stage).padStart(3, '0');
      await fs.copyFile(`output/stages/${paddedStage}/bin/vibec.js`, vibecPath);
      await fs.chmod(vibecPath, 0o644);
    }
    
    // Update test.sh if a new version exists
    if (await checkNewFile(stage, 'test.sh')) {
      console.log(`Updating test.sh from stage ${stage}...`);
      const paddedStage = String(stage).padStart(3, '0');
      await fs.copyFile(`output/stages/${paddedStage}/test.sh`, testShPath);
      await fs.chmod(testShPath, 0o755);
    }
  }
  
  console.log('Bootstrap complete!');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
