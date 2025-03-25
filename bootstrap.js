#!/usr/bin/env node

const { promises: fs } = require('fs');
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
          const stageNum = parseInt(match[1], 10);
          highestStage = Math.max(highestStage, stageNum);
        }
      }
    } catch (error) {
      console.error(`Error reading stack directory ${stackDir}:`, error.message);
    }
  }

  return highestStage;
}

async function checkNewFile(baseDir, stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = path.join(baseDir, 'output', 'stages', paddedStage, filename);
  
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function runStage(vibecPath, stage) {
  console.log(`Running stage ${stage}...`);
  
  const result = spawnSync('node', [
    vibecPath,
    `--stage=${stage}`,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh'
  ], {
    stdio: 'inherit'
  });
  
  if (result.error) {
    throw new Error(`Error running stage ${stage}: ${result.error.message}`);
  }
  
  if (result.status !== 0) {
    throw new Error(`Stage ${stage} exited with code ${result.status}`);
  }
  
  return result;
}

async function bootstrap() {
  const baseDir = process.cwd();
  const args = process.argv.slice(2);
  const startStageArg = args.find(arg => arg.startsWith('--start='));
  const endStageArg = args.find(arg => arg.startsWith('--end='));
  
  const startStage = startStageArg ? parseInt(startStageArg.split('=')[1], 10) : 1;
  const endStage = endStageArg ? parseInt(endStageArg.split('=')[1], 10) : await getHighestStage(baseDir);
  
  console.log(`Bootstrap will run stages ${startStage} through ${endStage}`);

  // Ensure output/current directory exists
  await fs.mkdir(path.join(baseDir, 'output', 'current', 'bin'), { recursive: true });
  
  // Copy test.sh if it doesn't exist
  const testShPath = path.join(baseDir, 'output', 'current', 'test.sh');
  try {
    await fs.access(testShPath);
    console.log('test.sh already exists, skipping copy');
  } catch (error) {
    console.log('Copying bin/test.sh to output/current/test.sh');
    await fs.copyFile(path.join(baseDir, 'bin', 'test.sh'), testShPath);
    await fs.chmod(testShPath, 0o755);
  }
  
  // Copy vibec.js if it doesn't exist
  const vibecJsPath = path.join(baseDir, 'output', 'current', 'bin', 'vibec.js');
  try {
    await fs.access(vibecJsPath);
    console.log('vibec.js already exists, skipping copy');
  } catch (error) {
    console.log('Copying bin/vibec.js to output/current/bin/vibec.js');
    await fs.copyFile(path.join(baseDir, 'bin', 'vibec.js'), vibecJsPath);
    await fs.chmod(vibecJsPath, 0o644);
  }
  
  // Run stages
  for (let stage = startStage; stage <= endStage; stage++) {
    console.log('\n\n');
    runStage(vibecJsPath, stage);
    
    // Update vibec.js if a new version is available
    if (await checkNewFile(baseDir, stage, 'bin/vibec.js')) {
      console.log(`Updating vibec.js from stage ${stage}`);
      const paddedStage = String(stage).padStart(3, '0');
      await fs.copyFile(
        path.join(baseDir, 'output', 'stages', paddedStage, 'bin', 'vibec.js'),
        vibecJsPath
      );
      await fs.chmod(vibecJsPath, 0o644);
    }
    
    // Update test.sh if a new version is available
    if (await checkNewFile(baseDir, stage, 'test.sh')) {
      console.log(`Updating test.sh from stage ${stage}`);
      const paddedStage = String(stage).padStart(3, '0');
      await fs.copyFile(
        path.join(baseDir, 'output', 'stages', paddedStage, 'test.sh'),
        testShPath
      );
      await fs.chmod(testShPath, 0o755);
    }
  }
  
  console.log('\nBootstrap completed successfully!');
}

bootstrap().catch(error => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
