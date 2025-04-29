import tape from 'tape';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { parseArgs, loadConfig } from './bin/vibec.js';

// Test config loading
tape('Test loading config file', async t => {
  // Create a temporary directory for the test
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Test valid JSON config
    const validConfig = {
      stacks: ["core", "tests"],
      testCmd: "npm test",
      retries: 2,
      pluginTimeout: 5000,
      apiUrl: "https://openrouter.ai/api/v1",
      apiModel: "anthropic/claude-3.7-sonnet",
      output: "output"
    };
    
    await fs.writeFile(
      path.join(tempDir, 'vibec.json'),
      JSON.stringify(validConfig, null, 2)
    );
    
    const loadedConfig = await loadConfig(tempDir);
    t.deepEqual(loadedConfig, validConfig, 'Should correctly load valid config file');
    
    // Test CLI args with loaded config
    const args = ['node', 'vibec.js'];
    const options = parseArgs(args, {}, loadedConfig);
    
    t.deepEqual(options.stacks, ["core", "tests"], 'Should merge config stacks value');
    t.equal(options.testCmd, "npm test", 'Should merge config testCmd value');
    t.equal(options.retries, 2, 'Should merge config retries value');
    t.equal(options.pluginTimeout, 5000, 'Should merge config pluginTimeout value');
    t.equal(options.apiUrl, "https://openrouter.ai/api/v1", 'Should merge config apiUrl value');
    t.equal(options.apiModel, "anthropic/claude-3.7-sonnet", 'Should merge config apiModel value');
    t.equal(options.output, "output", 'Should merge config output value');
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test malformed JSON config
tape('Test loading malformed config file', async t => {
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Write malformed JSON
    await fs.writeFile(
      path.join(tempDir, 'vibec.json'),
      '{ "stacks": ["core", "tests], "testCmd": "npm test" }'
    );
    
    try {
      await loadConfig(tempDir);
      t.fail('Should throw error for malformed JSON');
    } catch (error) {
      t.ok(error.message.includes('Failed to parse vibec.json'), 'Should throw appropriate error for malformed JSON');
    }
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test priority ordering - CLI args override env vars and config
tape('Test CLI args override config and env vars', async t => {
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create config with stacks: ["core"]
    await fs.writeFile(
      path.join(tempDir, 'vibec.json'),
      JSON.stringify({ stacks: ["core"] }, null, 2)
    );
    
    const config = await loadConfig(tempDir);
    
    // Set up test environment vars
    const env = { VIBEC_STACKS: 'core,tests' };
    
    // Set up CLI args
    const args = ['node', 'vibec.js', '--stacks=tests'];
    
    // Parse options with all three sources
    const options = parseArgs(args, env, config);
    
    // CLI args should override both env and config
    t.deepEqual(options.stacks, ['tests'], 'CLI args should override both env vars and config');
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test priority ordering - Env vars override config
tape('Test env vars override config', async t => {
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create config with stacks: ["core"]
    await fs.writeFile(
      path.join(tempDir, 'vibec.json'),
      JSON.stringify({ stacks: ["core"] }, null, 2)
    );
    
    const config = await loadConfig(tempDir);
    
    // Set up test environment vars
    const env = { VIBEC_STACKS: 'core,tests' };
    
    // Parse options without CLI args so env vars take precedence over config
    const args = ['node', 'vibec.js'];
    const options = parseArgs(args, env, config);
    
    // Env vars should override config
    t.deepEqual(options.stacks, ['core', 'tests'], 'Env vars should override config values');
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test defaults used for missing required fields
tape('Test missing required fields use defaults', async t => {
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create config with minimal fields
    await fs.writeFile(
      path.join(tempDir, 'vibec.json'),
      JSON.stringify({ output: "custom-output" }, null, 2)
    );
    
    const config = await loadConfig(tempDir);
    
    // Parse options with minimal config
    const args = ['node', 'vibec.js'];
    const options = parseArgs(args, {}, config);
    
    // Should use defaults for missing fields
    t.deepEqual(options.stacks, ['core'], 'Should use default stacks');
    t.equal(options.dryRun, false, 'Should use default dryRun');
    t.equal(options.apiUrl, 'https://openrouter.ai/api/v1', 'Should use default apiUrl');
    t.equal(options.apiModel, 'anthropic/claude-3.7-sonnet', 'Should use default apiModel');
    t.equal(options.retries, 0, 'Should use default retries');
    t.equal(options.pluginTimeout, 5000, 'Should use default pluginTimeout');
    
    // Should use config value for specified field
    t.equal(options.output, 'custom-output', 'Should use config value for output');
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test environment variable conversion of VIBEC_STACKS string to array
tape('Test VIBEC_STACKS string converted to array', async t => {
  // Set up test environment vars
  const env = { VIBEC_STACKS: 'core,tests,utils' };
  
  // Parse options with env vars
  const args = ['node', 'vibec.js'];
  const options = parseArgs(args, env);
  
  // VIBEC_STACKS string should be converted to array
  t.ok(Array.isArray(options.stacks), 'VIBEC_STACKS should be converted to an array');
  t.deepEqual(options.stacks, ['core', 'tests', 'utils'], 'VIBEC_STACKS should be split correctly');
  
  t.end();
});

// Test empty config loads properly
tape('Test empty config loads properly', async t => {
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create empty config
    await fs.writeFile(
      path.join(tempDir, 'vibec.json'),
      '{}'
    );
    
    const config = await loadConfig(tempDir);
    t.deepEqual(config, {}, 'Should load empty config as empty object');
    
    // Parse options with empty config
    const args = ['node', 'vibec.js'];
    const options = parseArgs(args, {}, config);
    
    // Should use defaults for all fields
    t.deepEqual(options.stacks, ['core'], 'Should use default stacks');
    t.equal(options.dryRun, false, 'Should use default dryRun');
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test no config file
tape('Test no config file', async t => {
  const tempDir = path.join(os.tmpdir(), `vibec-config-test-${Date.now()}`);
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    const config = await loadConfig(tempDir);
    t.equal(config, null, 'Should return null for missing config file');
    
    // Parse options with null config
    const args = ['node', 'vibec.js'];
    const options = parseArgs(args, {}, null);
    
    // Should use defaults for all fields
    t.deepEqual(options.stacks, ['core'], 'Should use default stacks');
    t.equal(options.dryRun, false, 'Should use default dryRun');
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});