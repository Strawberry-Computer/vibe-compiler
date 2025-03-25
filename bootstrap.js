#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(dir, stacks = ['core', 'tests']) {
  let highest = 0;
  for (const stack of stacks) {
    const stackDir = path.join(dir, 'stacks', stack);
    try {
      const files = await fs.readdir(stackDir);
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > highest) {
            highest = num;
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${stackDir}: ${err}`);
    }
  }
  return highest;
}

async function checkNewFile(stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const outputPath = path.join('output', 'stages', paddedStage, filename);
  
  try {
    await fs.access(outputPath);
    return true;
  } catch (err) {
    return false;
  }
}

function runStage(vibecPath, stage) {
  console.log(`Running stage ${stage}...`);
  const result = spawnSync('node', [
    vibecPath,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh'
  ], { stdio: 'inherit' });
  
  if (result.error) {
    throw new Error(`Failed to run stage ${stage}: ${result.error}`);
  }
  
  return result.status === 0;
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const startArg = args.find(arg => arg.startsWith('--start='));
  const endArg = args.find(arg => arg.startsWith('--end='));
  
  const startStage = startArg ? parseInt(startArg.split('=')[1], 10) : 1;
  let endStage = endArg ? parseInt(endArg.split('=')[1], 10) : await getHighestStage('.');
  
  console.log(`Bootstrapping stages from ${startStage} to ${endStage}`);
  
  // Ensure output directories exist
  await fs.mkdir('output/current/bin', { recursive: true });
  
  // Copy test.sh if missing
  const testShPath = 'output/current/test.sh';
  try {
    await fs.access(testShPath);
  } catch (err) {
    console.log('Creating output/current/test.sh');
    await fs.copyFile('bin/test.sh', testShPath);
    await fs.chmod(testShPath, 0o755);
  }
  
  // Copy vibec.js if missing
  const vibecJsPath = 'output/current/bin/vibec.js';
  try {
    await fs.access(vibecJsPath);
  } catch (err) {
    console.log('Creating output/current/bin/vibec.js');
    await fs.copyFile('bin/vibec.js', vibecJsPath);
    await fs.chmod(vibecJsPath, 0o644);
  }
  
  // Run stages
  for (let stage = startStage; stage <= endStage; stage++) {
    console.log('\n\n');
    console.log(`Stage ${stage}`);
    console.log('='.repeat(80));
    
    // Run the stage
    const success = runStage(vibecJsPath, stage);
    if (!success) {
      console.error(`Stage ${stage} failed`);
      process.exit(1);
    }
    
    // Update files if new versions exist
    const paddedStage = String(stage).padStart(3, '0');
    
    if (await checkNewFile(stage, 'bin/vibec.js')) {
      console.log(`Updating vibec.js from stage ${stage}`);
      await fs.copyFile(
        path.join('output', 'stages', paddedStage, 'bin/vibec.js'),
        vibecJsPath
      );
    }
    
    if (await checkNewFile(stage, 'test.sh')) {
      console.log(`Updating test.sh from stage ${stage}`);
      await fs.copyFile(
        path.join('output', 'stages', paddedStage, 'test.sh'),
        testShPath
      );
      await fs.chmod(testShPath, 0o755);
    }
  }
  
  console.log('\nBootstrap complete!');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
