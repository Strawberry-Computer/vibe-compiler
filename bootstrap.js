#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacks = ['core', 'tests']) {
  let highest = 0;
  
  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      for (const file of files) {
        if (file.match(/^\d+_.*\.md$/)) {
          const stageNum = parseInt(file.split('_')[0], 10);
          highest = Math.max(highest, stageNum);
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${stackDir}:`, err);
    }
  }
  
  return highest;
}

async function checkNewFile(stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = path.join('output', 'stages', paddedStage, filename);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runStage(vibecPath, stage) {
  console.log(`Running stage ${stage}...`);
  
  const result = spawnSync('node', [
    vibecPath,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh'
  ], {
    stdio: 'inherit'
  });
  
  if (result.error) {
    throw new Error(`Failed to run stage ${stage}: ${result.error.message}`);
  }
  
  if (result.status !== 0) {
    throw new Error(`Stage ${stage} exited with code ${result.status}`);
  }
  
  return result;
}

async function bootstrap() {
  // Create output directories if they don't exist
  await fs.mkdir(path.join('output', 'current'), { recursive: true });
  await fs.mkdir(path.join('output', 'current', 'bin'), { recursive: true });
  await fs.mkdir(path.join('output', 'stages'), { recursive: true });
  
  // Copy test.sh if it doesn't exist
  const testShPath = path.join('output', 'current', 'test.sh');
  try {
    await fs.access(testShPath);
    console.log('test.sh already exists, skipping...');
  } catch {
    console.log('Copying test.sh...');
    await fs.copyFile(path.join('bin', 'test.sh'), testShPath);
    await fs.chmod(testShPath, 0o755);
  }
  
  // Copy vibec.js if it doesn't exist
  const vibecPath = path.join('output', 'current', 'bin', 'vibec.js');
  try {
    await fs.access(vibecPath);
    console.log('vibec.js already exists, skipping...');
  } catch {
    console.log('Copying vibec.js...');
    await fs.copyFile(path.join('bin', 'vibec.js'), vibecPath);
    await fs.chmod(vibecPath, 0o644);
  }
  
  // Get highest stage
  const highestStage = await getHighestStage();
  console.log(`Highest stage is ${highestStage}`);
  
  // Run stages from 1 to highest
  for (let stage = 1; stage <= highestStage; stage++) {
    await runStage(vibecPath, stage);
    
    // Update vibec.js if a new version exists
    if (await checkNewFile(stage, 'bin/vibec.js')) {
      const paddedStage = String(stage).padStart(3, '0');
      const newVibecPath = path.join('output', 'stages', paddedStage, 'bin', 'vibec.js');
      console.log(`Updating vibec.js from stage ${stage}...`);
      await fs.copyFile(newVibecPath, vibecPath);
      await fs.chmod(vibecPath, 0o644);
    }
    
    // Update test.sh if a new version exists
    if (await checkNewFile(stage, 'test.sh')) {
      const paddedStage = String(stage).padStart(3, '0');
      const newTestShPath = path.join('output', 'stages', paddedStage, 'test.sh');
      console.log(`Updating test.sh from stage ${stage}...`);
      await fs.copyFile(newTestShPath, testShPath);
      await fs.chmod(testShPath, 0o755);
    }
  }
  
  console.log('Bootstrap complete!');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
