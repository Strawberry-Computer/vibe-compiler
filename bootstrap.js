#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacksDir, stacks = ['core', 'tests']) {
  let highestStage = 0;

  for (const stack of stacks) {
    const stackPath = path.join(stacksDir, stack);
    try {
      const files = await fs.readdir(stackPath);
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (match) {
          const stageNum = parseInt(match[1], 10);
          highestStage = Math.max(highestStage, stageNum);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${stackPath}:`, error);
    }
  }
  
  return highestStage;
}

async function checkNewFile(outputDir, stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = path.join(outputDir, 'stages', paddedStage, filename);
  
  try {
    await fs.access(filePath);
    return filePath;
  } catch (error) {
    return null;
  }
}

function runStage(vibecPath, stage) {
  console.log(`Running stage ${stage}...`);
  
  const args = [
    vibecPath,
    `--stacks=core,tests`,
    `--test-cmd=output/current/test.sh`,
    `--stage=${stage}`
  ];
  
  console.log(`Command: node ${args.join(' ')}`);
  const result = spawnSync('node', args, { stdio: 'inherit' });
  
  if (result.error) {
    throw new Error(`Failed to run stage ${stage}: ${result.error.message}`);
  }
  
  if (result.status !== 0) {
    throw new Error(`Stage ${stage} failed with exit code ${result.status}`);
  }
}

async function bootstrap() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const startStage = args.find(arg => arg.startsWith('--start='))
    ? parseInt(args.find(arg => arg.startsWith('--start=')).split('=')[1], 10)
    : 1;
  const endStage = args.find(arg => arg.startsWith('--end='))
    ? parseInt(args.find(arg => arg.startsWith('--end=')).split('=')[1], 10)
    : null;
    
  // Create necessary directories
  await fs.mkdir('output/current/bin', { recursive: true });
  
  // Ensure test.sh exists and has execute permissions
  const testShPath = 'output/current/test.sh';
  try {
    await fs.access(testShPath);
    console.log(`${testShPath} already exists, skipping...`);
  } catch (error) {
    console.log(`Copying bin/test.sh to ${testShPath}...`);
    await fs.copyFile('bin/test.sh', testShPath);
    await fs.chmod(testShPath, 0o755);
  }
  
  // Ensure vibec.js exists
  const vibecPath = 'output/current/bin/vibec.js';
  try {
    await fs.access(vibecPath);
    console.log(`${vibecPath} already exists, skipping...`);
  } catch (error) {
    console.log(`Copying bin/vibec.js to ${vibecPath}...`);
    await fs.copyFile('bin/vibec.js', vibecPath);
    await fs.chmod(vibecPath, 0o644);
  }
  
  // Find the highest stage
  const highestStage = await getHighestStage('stacks');
  const finalEndStage = endStage || highestStage;
  
  console.log(`Highest stage found: ${highestStage}`);
  console.log(`Running stages from ${startStage} to ${finalEndStage}`);
  
  // Run stages
  for (let stage = startStage; stage <= finalEndStage; stage++) {
    console.log('\n\n');
    runStage(vibecPath, stage);
    
    // Check for updated files and copy them
    const newVibecPath = await checkNewFile('output', stage, 'vibec.js');
    if (newVibecPath) {
      console.log(`Updating vibec.js from stage ${stage}...`);
      await fs.copyFile(newVibecPath, vibecPath);
      await fs.chmod(vibecPath, 0o644);
    }
    
    const newTestShPath = await checkNewFile('output', stage, 'test.sh');
    if (newTestShPath) {
      console.log(`Updating test.sh from stage ${stage}...`);
      await fs.copyFile(newTestShPath, testShPath);
      await fs.chmod(testShPath, 0o755);
    }
  }
  
  console.log('Bootstrap completed successfully!');
}

bootstrap().catch(error => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
