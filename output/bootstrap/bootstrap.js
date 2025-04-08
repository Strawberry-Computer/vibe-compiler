#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

async function getHighestStage(stacks = ['core', 'tests']) {
  let highestStage = 0;

  for (const stack of stacks) {
    const stackPath = `stacks/${stack}/`;
    
    try {
      const files = await fs.readdir(stackPath);
      for (const file of files) {
        if (file.match(/^\d+_.*\.md$/)) {
          const stage = parseInt(file.split('_')[0], 10);
          highestStage = Math.max(highestStage, stage);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${stackPath}:`, error);
    }
  }

  return highestStage;
}

function runStage(stage, stacks = 'core,tests') {
  console.log('\n\n');
  console.log(`Running stage ${stage}...`);
  
  const apiUrl = process.env.VIBEC_API_URL || 'https://openrouter.ai/api/v1';
  const apiKey = process.env.VIBEC_API_KEY;
  const apiModel = process.env.VIBEC_API_MODEL || 'anthropic/claude-3.7-sonnet';
  
  const args = [
    'output/current/bin/vibec.js',
    '--start', stage.toString(),
    '--end', stage.toString(),
    '--stacks', stacks,
    '--test-cmd', 'sh output/current/test.sh',
    '--api-url', apiUrl,
    '--api-model', apiModel
  ];
  
  if (apiKey) {
    args.push('--api-key', apiKey);
  }
  
  const result = spawnSync('node', args, { 
    stdio: 'inherit',
    env: process.env
  });
  
  return result;
}

async function bootstrap() {
  try {
    console.log('Copying bootstrap files to current directory...');
    await fs.mkdir('output/current', { recursive: true });
    
    // Copy files from bootstrap to current
    const copyProcess = spawnSync('cp', ['-r', 'output/bootstrap/.', 'output/current/'], { 
      stdio: 'inherit'
    });
    
    if (copyProcess.error) {
      console.error('Error copying bootstrap files:', copyProcess.error);
      process.exit(1);
    }
    
    const stacks = ['core', 'tests'];
    const highestStage = await getHighestStage(stacks);
    console.log(`Found highest stage: ${highestStage}`);
    
    // Run stages 1 to highest
    for (let stage = 1; stage <= highestStage; stage++) {
      const result = runStage(stage, stacks.join(','));
      if (result.status !== 0) {
        console.error(`Stage ${stage} failed with exit code ${result.status}`);
        process.exit(result.status);
      }
    }
    
    console.log('Bootstrap completed successfully!');
  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap().catch(error => {
  console.error('Unhandled error during bootstrap:', error);
  process.exit(1);
});
