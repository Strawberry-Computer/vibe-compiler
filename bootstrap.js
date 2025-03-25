#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(projectRoot, stacks = ['core', 'tests']) {
  let highest = 0;
  for (const stack of stacks) {
    const stackDir = path.join(projectRoot, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      for (const file of files) {
        if (/^\d+_.*\.md$/.test(file)) {
          const stageNum = parseInt(file.split('_')[0], 10);
          highest = Math.max(highest, stageNum);
        }
      }
    } catch (err) {
      console.error(`Error reading stack directory ${stackDir}:`, err.message);
    }
  }
  return highest;
}

async function checkNewFile(projectRoot, stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = path.join(projectRoot, 'output', 'stages', paddedStage, filename);
  try {
    await fs.access(filePath);
    return filePath;
  } catch (err) {
    return null;
  }
}

function runStage(projectRoot, vibecPath, stage) {
  console.log(`\n\nRunning stage ${stage}...`);
  
  const result = spawnSync('node', [
    vibecPath,
    `--start=${stage}`,
    `--end=${stage}`,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh'
  ], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  
  if (result.error) {
    throw new Error(`Failed to run stage ${stage}: ${result.error.message}`);
  }
  
  if (result.status !== 0) {
    throw new Error(`Stage ${stage} exited with code ${result.status}`);
  }
  
  return result.status === 0;
}

async function bootstrap() {
  const projectRoot = process.cwd();
  let startStage = 1;
  let endStage = null;
  
  // Parse command line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--start=')) {
      startStage = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--end=')) {
      endStage = parseInt(arg.split('=')[1], 10);
    }
  }
  
  // Ensure output directory exists
  await fs.mkdir(path.join(projectRoot, 'output', 'current', 'bin'), { recursive: true });
  
  // Copy test.sh if it doesn't exist
  const testShPath = path.join(projectRoot, 'output', 'current', 'test.sh');
  try {
    await fs.access(testShPath);
    console.log('test.sh already exists, skipping copy');
  } catch (err) {
    console.log('Copying test.sh...');
    await fs.copyFile(
      path.join(projectRoot, 'bin', 'test.sh'),
      testShPath
    );
    await fs.chmod(testShPath, 0o755);
  }
  
  // Copy vibec.js if it doesn't exist
  const vibecPath = path.join(projectRoot, 'output', 'current', 'bin', 'vibec.js');
  try {
    await fs.access(vibecPath);
    console.log('vibec.js already exists, skipping copy');
  } catch (err) {
    console.log('Copying vibec.js...');
    await fs.copyFile(
      path.join(projectRoot, 'bin', 'vibec.js'),
      vibecPath
    );
    await fs.chmod(vibecPath, 0o644);
  }
  
  // Find the highest stage
  const highestStage = await getHighestStage(projectRoot);
  console.log(`Highest stage found: ${highestStage}`);
  
  if (endStage === null) {
    endStage = highestStage;
  }
  
  // Run each stage sequentially
  for (let stage = startStage; stage <= endStage; stage++) {
    if (await runStage(projectRoot, vibecPath, stage)) {
      // Update vibec.js if a new version is available
      const newVibecPath = await checkNewFile(projectRoot, stage, 'bin/vibec.js');
      if (newVibecPath) {
        console.log(`Updating vibec.js from stage ${stage}`);
        await fs.copyFile(newVibecPath, vibecPath);
        await fs.chmod(vibecPath, 0o644);
      }
      
      // Update test.sh if a new version is available
      const newTestShPath = await checkNewFile(projectRoot, stage, 'test.sh');
      if (newTestShPath) {
        console.log(`Updating test.sh from stage ${stage}`);
        await fs.copyFile(newTestShPath, testShPath);
        await fs.chmod(testShPath, 0o755);
      }
      
      console.log(`Stage ${stage} completed successfully`);
    } else {
      console.error(`Stage ${stage} failed`);
      process.exit(1);
    }
  }
  
  console.log('All stages completed successfully');
}

bootstrap().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
