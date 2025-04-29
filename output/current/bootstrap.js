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
        if (file.match(/^\d{3}_.*\.md$/)) {
          const stageNum = parseInt(file.substring(0, 3), 10);
          highestStage = Math.max(highestStage, stageNum);
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dirPath}:`, err);
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
    '--test-cmd', '"yarn test"',
    '--api-url', apiUrl,
    '--api-key', apiKey,
    '--api-model', apiModel
  ];
  
  console.log(`Executing: node ${args.join(' ')}`);
  
  const result = spawnSync('node', args, {
    stdio: 'inherit',
    shell: true
  });
  
  return result;
}

async function bootstrap() {
  try {
    // Copy bootstrap files to current
    console.log('Copying bootstrap files to output/current...');
    await fs.mkdir('output/current', { recursive: true });
    
    const copyDir = async (src, dest) => {
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
    };
    
    await copyDir('output/bootstrap', 'output/current');
    console.log('Files copied successfully');
    
    // Parse stacks parameter and get highest stage
    const stacksList = ['core', 'tests'];
    const highestStage = await getHighestStage(stacksList);
    console.log(`Highest stage found: ${highestStage}`);
    
    // Run all stages
    for (let stage = 1; stage <= highestStage; stage++) {
      const result = runStage(stage, stacksList.join(','));
      
      if (result.status !== 0) {
        console.error(`Stage ${stage} failed with exit code ${result.status}`);
        process.exit(result.status);
      }
    }
    
    console.log('\nAll stages completed successfully');
  } catch (error) {
    console.error('Bootstrap process failed:', error);
    process.exit(1);
  }
}

bootstrap().catch(error => {
  console.error('Unhandled error during bootstrap:', error);
  process.exit(1);
});
