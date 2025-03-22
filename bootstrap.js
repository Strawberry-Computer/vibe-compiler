#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Summary of Changes and Reasoning:
 * 
 * This is a minimal bootstrap script to progressively build vibec:
 * - Starts with bin/vibec.js and runs it for each stage (001 to highest).
 * - Checks for a new vibec.js in output/stages/NNN/ after each stage.
 * - Switches to the new implementation if found, enabling self-improvement.
 * - Uses async FS with await for consistency with vibec.js.
 * - Hardcodes minimal args (--stacks=core), relying on vibec.js for options.
 * - Removes config loading, colored logging, and advanced filtering.
 * 
 * Reasoning:
 * - Simplifies to focus on stage-by-stage execution and self-upgrade.
 * - Assumes bin/vibec.js exists and handles its own CLI parsing.
 * - Keeps the core bootstrapping logic intact with minimal overhead.
 */

// Get highest stage number
const getHighestStage = async (stacks = ['core']) => {
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

// Check for new vibec.js
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

// Run vibec for a stage
const runStage = (vibecPath, stage) => {
  const stageStr = String(stage).padStart(3, '0');
  console.log(`Running stage ${stageStr} with ${vibecPath}`);
  const result = spawnSync('node', [vibecPath, '--stacks=core'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.log(`Stage ${stageStr} failed with code ${result.status}`);
    return false;
  }
  return true;
};

// Main bootstrap function
const bootstrap = async () => {
  console.log('Starting bootstrap process');
  let currentVibec = path.join('bin', 'vibec.js');

  try {
    await fs.access(currentVibec);
  } catch (err) {
    console.log('Error: bin/vibec.js not found');
    process.exit(1);
  }

  const highestStage = await getHighestStage();
  if (highestStage === 0) {
    console.log('No stages found in stacks/core');
    return;
  }

  for (let stage = 1; stage <= highestStage; stage++) {
    if (!await runStage(currentVibec, stage)) {
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
