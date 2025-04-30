import tape from 'tape';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { parseArgs, loadConfigFile, formatConfigKeys, parseEnvVars } from './bin/vibec.js';

// Test configuration file loading
tape('Config loading tests', async t => {
  // Create a temporary directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibec-config-test-'));
  
  try {
    // PROMPT: "Create `vibec.json` containing: ... Verify merged options match config values"
    await fs.writeFile(path.join(tempDir, 'vibec.json'), JSON.stringify({
      stacks: ["core", "tests"],
      testCmd: "npm test",
      retries: 2,
      pluginTimeout: 5000,
      apiUrl: "https://openrouter.ai/api/v1",
      apiModel: "anthropic/claude-3.7-sonnet",
      output: "output"
    }));
    
    const config = await loadConfigFile(tempDir);
    t.deepEqual(config.stacks, ["core", "tests"], "Should load stacks from config");
    t.equal(config.testCmd, "npm test", "Should load testCmd from config");
    t.equal(config.retries, 2, "Should load retries from config");
    t.equal(config.pluginTimeout, 5000, "Should load pluginTimeout from config");
    t.equal(config.apiUrl, "https://openrouter.ai/api/v1", "Should load apiUrl from config");
    t.equal(config.apiModel, "anthropic/claude-3.7-sonnet", "Should load apiModel from config");
    t.equal(config.output, "output", "Should load output from config");
    
    // Format config keys for CLI options
    const formattedConfig = formatConfigKeys(config);
    t.deepEqual(formattedConfig.stacks, ["core", "tests"], "Should format stacks correctly");
    t.equal(formattedConfig["test-cmd"], "npm test", "Should convert testCmd to test-cmd");
    t.equal(formattedConfig.retries, 2, "Should keep retries as is");
    t.equal(formattedConfig["plugin-timeout"], 5000, "Should convert pluginTimeout to plugin-timeout");
    t.equal(formattedConfig["api-url"], "https://openrouter.ai/api/v1", "Should convert apiUrl to api-url");
    t.equal(formattedConfig["api-model"], "anthropic/claude-3.7-sonnet", "Should convert apiModel to api-model");
    t.equal(formattedConfig.output, "output", "Should keep output as is");
    
    // PROMPT: "Create `vibec.json` with malformed JSON, verify error is thrown"
    await fs.writeFile(path.join(tempDir, 'vibec.json'), '{ "stacks": ["core", "tests", }');
    
    try {
      await loadConfigFile(tempDir);
      t.fail("Should throw error for malformed JSON");
    } catch (error) {
      t.ok(error.message.includes("Failed to parse vibec.json"), "Should throw appropriate error message");
    }
    
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true });
  }
  
  t.end();
});

// Test for priority order (CLI > ENV > CONFIG)
tape('Priority order tests', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibec-priority-test-'));
  
  try {
    // PROMPT: "CLI args override env vars and config: ... Verify final stacks is ["tests"]"
    await fs.writeFile(path.join(tempDir, 'vibec.json'), JSON.stringify({
      stacks: ["core"]
    }));
    
    const configFile = await loadConfigFile(tempDir);
    
    // Create mock ENV with VIBEC_STACKS
    const mockEnv = { VIBEC_STACKS: 'core,tests' };
    
    // Create CLI args with --stacks=tests
    const mockArgv = ['node', 'vibec.js', '--stacks=tests'];
    
    const options = parseArgs(mockArgv, mockEnv, configFile);
    t.deepEqual(options.stacks, ['tests'], "CLI args should override ENV and config");
    
    // PROMPT: "Env vars override config: ... Verify final stacks is ["core", "tests"]"
    // Now test without CLI arg for stacks
    const mockArgv2 = ['node', 'vibec.js']; // No stacks argument
    
    const options2 = parseArgs(mockArgv2, mockEnv, configFile);
    t.deepEqual(options2.stacks, ['core', 'tests'], "ENV vars should override config");
    
  } finally {
    await fs.rm(tempDir, { recursive: true });
  }
  
  t.end();
});

// Test validation and defaults
tape('Validation and defaults tests', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibec-validation-test-'));
  
  try {
    // PROMPT: "Use config with missing required fields, verify defaults are used"
    await fs.writeFile(path.join(tempDir, 'vibec.json'), JSON.stringify({
      // No required fields
      apiModel: "anthropic/claude-3.7-sonnet"
    }));
    
    const configFile = await loadConfigFile(tempDir);
    const options = parseArgs(['node', 'vibec.js'], {}, configFile);
    
    // Verify defaults are used for missing fields
    t.deepEqual(options.stacks, ['core'], "Should use default stacks when not in config");
    t.equal(options.retries, 0, "Should use default retries when not in config");
    t.equal(options['plugin-timeout'], 5000, "Should use default plugin timeout when not in config");
    t.equal(options.output, 'output', "Should use default output when not in config");
    
    // PROMPT: "Verify `VIBEC_STACKS` string is converted to array"
    const envOptions = parseEnvVars({ VIBEC_STACKS: 'core,utils,tests' });
    t.deepEqual(envOptions.stacks, ['core', 'utils', 'tests'], "Should convert ENV string to array");
    
    // Test with comma and spaces
    const envOptionsWithSpaces = parseEnvVars({ VIBEC_STACKS: 'core, utils, tests' });
    t.deepEqual(
      envOptionsWithSpaces.stacks, 
      ['core', 'utils', 'tests'], 
      "Should handle spaces in ENV string"
    );
    
  } finally {
    await fs.rm(tempDir, { recursive: true });
  }
  
  t.end();
});

// Test validation of retries and pluginTimeout
tape('Validation of numeric parameters', t => {
  // PROMPT: "Validate: `retries` ≥ 0, `pluginTimeout` > 0, log errors with `log` utility."
  
  // Test invalid retries values
  try {
    parseArgs(['node', 'vibec.js', '--retries=-1']);
    t.fail("Should throw error for negative retries");
  } catch (error) {
    t.ok(error.message.includes("retries"), "Should detect invalid retries value");
  }
  
  // Test invalid plugin-timeout values
  try {
    parseArgs(['node', 'vibec.js', '--plugin-timeout=0']);
    t.fail("Should throw error for zero plugin timeout");
  } catch (error) {
    t.ok(error.message.includes("plugin-timeout"), "Should detect invalid plugin timeout value");
  }
  
  // Valid values should pass
  const options1 = parseArgs(['node', 'vibec.js', '--retries=0', '--plugin-timeout=1']);
  t.equal(options1.retries, 0, "Zero is valid for retries");
  t.equal(options1['plugin-timeout'], 1, "Positive numbers are valid for plugin timeout");
  
  const options2 = parseArgs(['node', 'vibec.js', '--retries=5', '--plugin-timeout=10000']);
  t.equal(options2.retries, 5, "Positive values are valid for retries");
  t.equal(options2['plugin-timeout'], 10000, "Larger positive numbers are valid for plugin timeout");
  
  t.end();
});