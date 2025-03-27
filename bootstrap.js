#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacks = ['core', 'tests']) {
  let highestStage = 0;
  
  for (const stack of stacks) {
    const stackDir = path.join('stacks', stack);
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
    } catch (error) {
      console.error(`Error reading stack directory ${stackDir}:`, error);
    }
  }
  
  return highestStage;
}

async function checkNewFile(stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = path.join('output', 'stages', paddedStage, filename);
  
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function runStage(vibecPath, stage, stacks = 'core,tests') {
  console.log('\n\n');
  console.log(`Running stage ${stage}...`);
  
  const apiUrl = process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1';
  const apiKey = process.env.VIBEC_API_KEY;
  const model = process.env.VIBEC_MODEL || 'anthropic/claude-3.7-sonnet';
  
  const args = [
    vibecPath,
    `--start=${stage}`,
    `--end=${stage}`,
    `--stacks=${stacks}`,
    `--test-cmd=output/current/test.sh`,
    `--api-url=${apiUrl}`,
    `--api-key=${apiKey}`,
    `--model=${model}`
  ];
  
  console.log(`Executing: node ${args.join(' ')}`);
  const result = spawnSync('node', args, { 
    stdio: 'inherit',
    encoding: 'utf-8'
  });
  
  return result;
}

async function bootstrap() {
  try {
    // Create output directories if they don't exist
    await fs.mkdir(path.join('output', 'current'), { recursive: true });
    await fs.mkdir(path.join('output', 'current', 'bin'), { recursive: true });
    
    // Copy test.sh if missing
    const testShPath = path.join('output', 'current', 'test.sh');
    try {
      await fs.access(testShPath);
      console.log('test.sh already exists in output/current/');
    } catch (error) {
      console.log('Copying test.sh to output/current/');
      await fs.copyFile(path.join('bin', 'test.sh'), testShPath);
      await fs.chmod(testShPath, 0o755);
    }
    
    // Copy vibec.js if missing
    const vibecJsPath = path.join('output', 'current', 'bin', 'vibec.js');
    try {
      await fs.access(vibecJsPath);
      console.log('vibec.js already exists in output/current/bin/');
    } catch (error) {
      console.log('Copying vibec.js to output/current/bin/');
      await fs.copyFile(path.join('bin', 'vibec.js'), vibecJsPath);
      await fs.chmod(vibecJsPath, 0o644);
    }
    
    const stacks = ['core', 'tests'];
    const highestStage = await getHighestStage(stacks);
    console.log(`Highest stage found: ${highestStage}`);
    
    const vibecPath = path.join('output', 'current', 'bin', 'vibec.js');
    
    for (let stage = 1; stage <= highestStage; stage++) {
      const result = await runStage(vibecPath, stage, stacks.join(','));
      
      if (result.status !== 0) {
        console.error(`Stage ${stage} failed with exit code ${result.status}`);
        process.exit(result.status);
      }
      
      // Check and update vibec.js if a new version exists
      const hasNewVibec = await checkNewFile(stage, path.join('bin', 'vibec.js'));
      if (hasNewVibec) {
        console.log(`Updating vibec.js from stage ${stage}`);
        const paddedStage = String(stage).padStart(3, '0');
        const newVibecPath = path.join('output', 'stages', paddedStage, 'bin', 'vibec.js');
        await fs.copyFile(newVibecPath, vibecPath);
        await fs.chmod(vibecPath, 0o644);
      }
      
      // Check and update test.sh if a new version exists
      const hasNewTest = await checkNewFile(stage, 'test.sh');
      if (hasNewTest) {
        console.log(`Updating test.sh from stage ${stage}`);
        const paddedStage = String(stage).padStart(3, '0');
        const newTestPath = path.join('output', 'stages', paddedStage, 'test.sh');
        await fs.copyFile(newTestPath, testShPath);
        await fs.chmod(testShPath, 0o755);
      }
    }
    
    console.log('\nBootstrap completed successfully!');
  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap().catch(error => {
  console.error('Unhandled error during bootstrap:', error);
  process.exit(1);
});
