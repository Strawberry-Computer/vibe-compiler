#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Changes:
 * - Changed initial currentVibec to output/current/bin/vibec.js
 * - Fixed runStage logging to use stageStr
 * 
 * Reasoning:
 * - Aligns context resolution with output/current/ and improves error reporting during staged execution
 */

async function getHighestStage(stacks = ['core', 'tests']) {
  let highest = 0;
  for (const stack of stacks) {
    const stackPath = `stacks/${stack}/`;
    const files = await fs.readdir(stackPath);
    for (const file of files) {
      if (file.match(/^(\d+)_.*\.md$/)) {
        const stage = parseInt(RegExp.$1, 10);
        highest = Math.max(highest, stage);
      }
    }
  }
  return highest;
}

async function checkNewFile(stage, filename) {
  const paddedStage = String(stage).padStart(3, '0');
  const filePath = `output/stages/${paddedStage}/${filename}`;
  try {
    await fs.access(filePath);
    return filePath;
  } catch (err) {
    return null;
  }
}

async function runStage(stage, vibecPath) {
  const stageStr = String(stage).padStart(3, '0');
  console.log(`Running stage ${stageStr}...`);
  
  const result = spawnSync('node', [
    vibecPath,
    '--stacks=core,tests',
    '--test-cmd=output/current/test.sh'
  ], { 
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  if (result.status !== 0) {
    throw new Error(`Stage ${stageStr} failed with exit code ${result.status}`);
  }
  
  console.log(`Stage ${stageStr} completed successfully.`);
  return result;
}

async function bootstrap() {
  // Create output directories if they don't exist
  await fs.mkdir('output/current/bin', { recursive: true });
  
  // Copy test.sh to output/current if it doesn't exist
  try {
    await fs.access('output/current/test.sh');
    console.log('output/current/test.sh already exists, skipping');
  } catch (err) {
    console.log('Copying test.sh to output/current');
    await fs.copyFile('bin/test.sh', 'output/current/test.sh');
    await fs.chmod('output/current/test.sh', 0o755);
  }
  
  // Copy vibec.js to output/current/bin if it doesn't exist
  try {
    await fs.access('output/current/bin/vibec.js');
    console.log('output/current/bin/vibec.js already exists, skipping');
  } catch (err) {
    console.log('Copying vibec.js to output/current/bin');
    await fs.copyFile('bin/vibec.js', 'output/current/bin/vibec.js');
    await fs.chmod('output/current/bin/vibec.js', 0o644);
  }
  
  let currentVibec = 'output/current/bin/vibec.js';
  const highestStage = await getHighestStage();
  console.log(`Highest stage is ${highestStage}`);
  
  // Run stages from 1 to highest
  for (let stage = 1; stage <= highestStage; stage++) {
    await runStage(stage, currentVibec);
    
    // Check for new vibec.js
    const newVibec = await checkNewFile(stage, 'bin/vibec.js');
    if (newVibec) {
      console.log(`Found new vibec.js at ${newVibec}`);
      await fs.copyFile(newVibec, 'output/current/bin/vibec.js');
      await fs.chmod('output/current/bin/vibec.js', 0o644);
      currentVibec = 'output/current/bin/vibec.js';
    }
    
    // Check for new test.sh
    const newTest = await checkNewFile(stage, 'test.sh');
    if (newTest) {
      console.log(`Found new test.sh at ${newTest}`);
      await fs.copyFile(newTest, 'output/current/test.sh');
      await fs.chmod('output/current/test.sh', 0o755);
    }
  }
  
  console.log('Bootstrap completed successfully');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
