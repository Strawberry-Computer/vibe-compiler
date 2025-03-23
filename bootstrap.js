#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Summary of Changes and Reasoning:
 * 
 * - Changed initial currentVibec to output/current/bin/vibec.js instead of bin/vibec.js.
 * - Kept existing initialization of output/current/bin/vibec.js and test.sh.
 * - No changes to stage logic or test.sh updates.
 * 
 * Reasoning:
 * - Aligns with new Context: resolution relative to output/current/.
 * - Pre-copy ensures early stages have a starting vibec.js in output/current/.
 * - Maintains existing bootstrap flow with minimal disruption.
 */

const getHighestStage = async (stacks = ['core', 'tests']) => {
  let highest = 0;
  for (const stack of stacks) {
    try {
      const files = await fs.readdir(`stacks/${stack}`);
      for (const file of files) {
        if (file.match(/^(\d{3})_.*\.md$/)) {
          const num = parseInt(file.slice(0, 3), 10);
          highest = Math.max(highest, num);
        }
      }
    } catch (err) {}
  }
  return highest;
};

const checkNewFile = async (stage, filename) => {
  const stagePath = path.join('output/stages', String(stage).padStart(3, '0'), filename);
  try {
    await fs.access(stagePath);
    console.log(`Found new ${filename} at ${stagePath}`);
    return stagePath;
  } catch (err) {
    return null;
  }
};

const runStage = (vibecPath, stage) => {
  const stageStr = String(stage).padStart(3, '0');
  console.log(`Running stage ${stageStr} with ${vibecPath}`);
  const testPath = path.resolve('output/current/test.sh');
  const testCmd = testPath;
  console.log(`Test command: ${testCmd}`);
  const args = ['--stacks=core,tests', `--test-cmd="${testCmd}"`];
  const result = spawnSync('node', [vibecPath, ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.log(`Stage ${stageStr} failed with code ${result.status}`);
    return false;
  }
  return true;
};

const bootstrap = async () => {
  console.log('Starting bootstrap process');
  let currentVibec = path.join('output', 'current', 'bin', 'vibec.js');

  // Ensure initial test.sh exists
  const initialTest = path.join('bin', 'test.sh');
  const currentTest = path.join('output', 'current', 'test.sh');
  try {
    await fs.access(currentTest);
    console.log('Test script already exists at', currentTest);
  } catch (err) {
    await fs.mkdir(path.dirname(currentTest), { recursive: true });
    await fs.copyFile(initialTest, currentTest);
    await fs.chmod(currentTest, '755');
    console.log('Initialized output/current/test.sh from bin/test.sh');
  }

  // Ensure initial vibec.js exists in output/current/bin/
  const initialVibec = path.join('bin', 'vibec.js');
  const currentVibecOutput = path.join('output', 'current', 'bin', 'vibec.js');
  try {
    await fs.access(currentVibecOutput);
    console.log('Vibec script already exists at', currentVibecOutput);
  } catch (err) {
    await fs.mkdir(path.dirname(currentVibecOutput), { recursive: true });
    await fs.copyFile(initialVibec, currentVibecOutput);
    await fs.chmod(currentVibecOutput, '644'); // Readable/executable by node, no +x needed
    console.log('Initialized output/current/bin/vibec.js from bin/vibec.js');
  }

  // Verify currentVibec exists for running stages
  try {
    await fs.access(currentVibec);
  } catch (err) {
    console.log('Error: output/current/bin/vibec.js not found after initialization');
    process.exit(1);
  }

  const highestStage = await getHighestStage();
  if (highestStage === 0) {
    console.log('No stages found in stacks');
    return;
  }

  for (let stage = 1; stage <= highestStage; stage++) {
    if (!await runStage(currentVibec, stage)) {
      console.log(`Bootstrap failed at stage ${stage}`);
      process.exit(1);
    }

    const newVibec = await checkNewFile(stage, 'vibec.js');
    if (newVibec) {
      currentVibec = newVibec;
    }

    const newTest = await checkNewFile(stage, 'test.sh');
    if (newTest) {
      await fs.copyFile(newTest, currentTest);
      await fs.chmod(currentTest, '755');
      console.log('Updated output/current/test.sh');
    }
  }

  console.log('Bootstrap completed');
};

bootstrap().catch(err => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});
