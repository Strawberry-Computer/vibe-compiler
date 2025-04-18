#!/usr/bin/env node

const { promises: fs } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacks = ['core', 'tests']) {
  let highestStage = 0;

  for (const stack of stacks) {
    const dirPath = path.join('stacks', stack);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (file.match(/^(\d+)_.*\.md$/)) {
          const stage = parseInt(RegExp.$1, 10);
          if (stage > highestStage) {
            highestStage = stage;
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning directory ${dirPath}:`, err);
    }
  }

  return highestStage;
}

function runStage(stage, stacks = 'core,tests') {
  console.log(`\n\nRunning stage ${stage}...`);
  
  const apiUrl = process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1';
  const apiKey = process.env.VIBEC_API_KEY;
  const apiModel = process.env.VIBEC_API_MODEL || 'anthropic/claude-3.7-sonnet';
  
  const args = [
    'output/current/bin/vibec.js',
    '--start', stage.toString(),
    '--end', stage.toString(),
    '--stacks', stacks,
    '--test-cmd', 'yarn test',
    '--api-url', apiUrl,
    '--api-key', apiKey,
    '--api-model', apiModel
  ];
  
  console.log(`Executing: node ${args.join(' ')}`);
  
  return spawnSync('node', args, { 
    stdio: 'inherit', 
    env: process.env 
  });
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function bootstrap() {
  try {
    console.log('Copying bootstrap files to output/current/...');
    await copyDir('output/bootstrap', 'output/current');
    console.log('Copy complete');

    const stacksArray = ['core', 'tests'];
    const stacksString = stacksArray.join(',');
    const highestStage = await getHighestStage(stacksArray);
    
    console.log(`Highest stage found: ${highestStage}`);

    let success = true;
    for (let stage = 1; stage <= highestStage; stage++) {
      const result = runStage(stage, stacksString);
      if (result.status !== 0) {
        console.error(`Stage ${stage} failed with exit code: ${result.status}`);
        success = false;
        break;
      }
    }

    if (success) {
      console.log('Bootstrap completed successfully');
    } else {
      console.error('Bootstrap failed');
      process.exit(1);
    }
  } catch (err) {
    console.error('Bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
