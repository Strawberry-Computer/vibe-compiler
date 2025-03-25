#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(basePath, stacks = ['core', 'tests']) {
  let highestStage = 0;

  for (const stack of stacks) {
    const stackPath = path.join(basePath, 'stacks', stack);
    try {
      const files = await fs.readdir(stackPath);
      for (const file of files) {
        if (file.match(/^(\d+)_.*\.md$/)) {
          const stage = parseInt(RegExp.$1, 10);
          if (stage > highestStage) {
            highestStage = stage;
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${stackPath}: ${error.message}`);
    }
  }

  return highestStage;
}

async function checkNewFile(outputPath, stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = path.join(outputPath, 'stages', paddedStage, filename);
  
  try {
    await fs.access(filePath);
    return filePath;
  } catch (e) {
    return null;
  }
}

function runStage(vibecPath, stage) {
  console.log(`Running stage ${stage}...`);
  
  const result = spawnSync('node', [
    vibecPath,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh',
    `--stage=${stage}`
  ], {
    stdio: 'inherit'
  });
  
  if (result.error) {
    throw new Error(`Failed to run stage ${stage}: ${result.error.message}`);
  }

  return result.status === 0;
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const startArg = args.find(arg => arg.startsWith('--start='));
  const endArg = args.find(arg => arg.startsWith('--end='));
  
  const start = startArg ? parseInt(startArg.split('=')[1], 10) : 1;
  const end = endArg ? parseInt(endArg.split('=')[1], 10) : await getHighestStage(process.cwd());
  
  const outputDir = path.join(process.cwd(), 'output');
  const currentDir = path.join(outputDir, 'current');
  const currentBinDir = path.join(currentDir, 'bin');
  
  // Create output directories if they don't exist
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(currentDir, { recursive: true });
  await fs.mkdir(currentBinDir, { recursive: true });
  
  // Copy test.sh if missing
  const testShPath = path.join(currentDir, 'test.sh');
  try {
    await fs.access(testShPath);
    console.log('test.sh already exists, skipping copy');
  } catch (e) {
    await fs.copyFile(path.join(process.cwd(), 'bin', 'test.sh'), testShPath);
    await fs.chmod(testShPath, 0o755);
    console.log('Copied test.sh to output/current/test.sh');
  }
  
  // Copy vibec.js if missing
  const vibecJsPath = path.join(currentBinDir, 'vibec.js');
  try {
    await fs.access(vibecJsPath);
    console.log('vibec.js already exists, skipping copy');
  } catch (e) {
    await fs.copyFile(path.join(process.cwd(), 'bin', 'vibec.js'), vibecJsPath);
    await fs.chmod(vibecJsPath, 0o644);
    console.log('Copied vibec.js to output/current/bin/vibec.js');
  }
  
  // Run stages
  for (let stage = start; stage <= end; stage++) {
    console.log('\n\n');
    console.log(`=== Stage ${stage} ===`);
    
    const success = runStage(vibecJsPath, stage);
    if (!success) {
      console.error(`Stage ${stage} failed, stopping bootstrap process`);
      process.exit(1);
    }
    
    // Check for new vibec.js
    const newVibecJsPath = await checkNewFile(outputDir, stage, 'bin/vibec.js');
    if (newVibecJsPath) {
      await fs.copyFile(newVibecJsPath, vibecJsPath);
      await fs.chmod(vibecJsPath, 0o644);
      console.log(`Updated vibec.js from stage ${stage}`);
    }
    
    // Check for new test.sh
    const newTestShPath = await checkNewFile(outputDir, stage, 'test.sh');
    if (newTestShPath) {
      await fs.copyFile(newTestShPath, testShPath);
      await fs.chmod(testShPath, 0o755);
      console.log(`Updated test.sh from stage ${stage}`);
    }
    
    console.log(`Stage ${stage} completed successfully`);
  }
  
  console.log('\nBootstrap process completed successfully');
}

bootstrap().catch(error => {
  console.error(`Bootstrap failed: ${error.message}`);
  process.exit(1);
});
