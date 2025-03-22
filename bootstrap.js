#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Summary of Changes and Reasoning:
 * 
 * - Updated to process both 'core' and 'tests' stacks by default (--stacks=core,tests).
 * - Runs each stage across all stacks, checking for new vibec.js after each stage.
 * - Simplified to pass test-cmd if provided, enabling gating in vibec.js.
 * - Kept async FS and minimal error handling.
 * 
 * Reasoning:
 * - Supports separate tests stack for early testing.
 * - Ensures stages are processed in order with test gating enforced by vibec.js.
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
    } catch (err) {
      // Stack may not exist yet
    }
  }
  return highest;
};

const checkNewVibec = async (stage) => {
  const stagePath = path.join('output/stages', String(stage).padStart(3, '0'), 'vibec.js');
  try {
    await fs.access(stagePath);
    console.log(`Found new vibec.js at ${stagePath}`);
    return stagePath;
  } catch (err) {
    return null;
  }
};

const runStage = (vibecPath, stage, testCmd) => {
  const stageStr = String(stage).padStart(3, '0');
  console.log(`Running stage ${stageStr} with ${vibecPath}`);
  const args = ['--stacks=core,tests'];
  if (testCmd) args.push(`--test-cmd="${testCmd}"`);
  const result = spawnSync('node', [vibecPath, ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.log(`Stage ${stageStr} failed with code ${result.status}`);
    return false;
  }
  return true;
};

const bootstrap = async () => {
  console.log('Starting bootstrap process');
  let currentVibec = path.join('bin', 'vibec.js');
  const testCmd = process.env.VIBEC_TEST_CMD || 'npm test'; // Default for now

  try {
    await fs.access(currentVibec);
  } catch (err) {
    console.log('Error: bin/vibec.js not found');
    process.exit(1);
  }

  const highestStage = await getHighestStage();
  if (highestStage === 0) {
    console.log('No stages found in stacks');
    return;
  }

  for (let stage = 1; stage <= highestStage; stage++) {
    if (!await runStage(currentVibec, stage, testCmd)) {
      console.log(`Bootstrap failed at stage ${stage}`);
      process.exit(1);
    }

    const newVibec = await checkNewVibec(stage);
    if (newVibec) {
      currentVibec = newVibec;
    }
  }

  console.log('Bootstrap completed');
};

bootstrap().catch(err => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});
