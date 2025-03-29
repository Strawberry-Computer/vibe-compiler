const tape = require('tape');
const fs = require('fs').promises;
const path = require('path');
const { log, parseArgs, mergeOptions, loadConfig } = require('./bin/vibec.js');
const mock = require('mock-fs');

tape('Config Loading', async (t) => {
  // Save original console functions
  const originalLogger = log.logger;
  const logMessages = [];
  
  log.logger = (...args) => {
    logMessages.push(args.join(' '));
  };
  
  try {
    // Create a mock filesystem with valid config
    mock({
      'vibec.json': JSON.stringify({
        stacks: ["core", "tests"],
        testCmd: "npm test",
        retries: 2,
        pluginTimeout: 5000,
        apiUrl: "https://api.openai.com/v1",
        apiModel: "gpt-4"
      })
    });
    
    // Test loading a valid config file
    const config = await loadConfig('.');
    t.deepEqual(config, {
      stacks: ["core", "tests"],
      testCmd: "npm test",
      retries: 2,
      pluginTimeout: 5000,
      apiUrl: "https://api.openai.com/v1",
      apiModel: "gpt-4"
    }, 'Should load valid config file');
    
    mock.restore();
    
    // Test loading malformed JSON
    mock({
      'vibec.json': '{stacks: ["core", "tests"]' // Missing closing brace
    });
    
    logMessages.length = 0; // Clear log messages
    
    try {
      await loadConfig('.');
      t.fail('Should throw an error for malformed JSON');
    } catch (error) {
      t.true(error.message.startsWith('Malformed JSON in config file:'), 'Should throw proper error message');
      t.true(logMessages.some(msg => msg.includes('Error parsing vibec.json')), 'Should log error for malformed JSON');
    }
    
    mock.restore();
  } finally {
    // Restore original logger
    log.logger = originalLogger;
    mock.restore();
  }
});

tape('Config Priority', async (t) => {
  // Save original console functions and env vars
  const originalLogger = log.logger;
  const originalEnv = { ...process.env };
  const logMessages = [];
  
  log.logger = (...args) => {
    logMessages.push(args.join(' '));
  };
  
  try {
    // CLI args should override env vars and config
    mock({
      'vibec.json': JSON.stringify({
        stacks: ["core"]
      })
    });
    
    process.env.VIBEC_STACKS = 'core,tests';
    
    const cliOptions = {
      stacks: ['tests']
    };
    
    const config = await loadConfig('.');
    let mergedOptions = mergeOptions(cliOptions, config);
    
    t.deepEqual(mergedOptions.stacks, ['tests'], 'CLI args should override env vars and config');
    
    mock.restore();
    
    // Env vars should override config
    mock({
      'vibec.json': JSON.stringify({
        stacks: ["core"]
      })
    });
    
    process.env.VIBEC_STACKS = 'core,tests';
    
    const configOptions = await loadConfig('.');
    mergedOptions = mergeOptions({}, configOptions);
    
    t.deepEqual(mergedOptions.stacks, ['core', 'tests'], 'Env vars should override config');
    
    mock.restore();
  } finally {
    // Restore original logger and env vars
    log.logger = originalLogger;
    
    // Restore original env vars
    process.env = originalEnv;
    
    mock.restore();
  }
});

tape('Config Validation', async (t) => {
  // Save original console functions
  const originalLogger = log.logger;
  const logMessages = [];
  
  log.logger = (...args) => {
    logMessages.push(args.join(' '));
  };
  
  try {
    // Test invalid retries value
    mock({
      'vibec.json': JSON.stringify({
        retries: -1
      })
    });
    
    logMessages.length = 0;
    
    let config = await loadConfig('.');
    let mergedOptions = mergeOptions({}, config);
    
    t.equal(mergedOptions.retries, 0, 'Invalid retries should be set to default value');
    t.true(logMessages.some(msg => msg.includes('Invalid value for retries')), 'Should log error for invalid retries');
    
    mock.restore();
    
    // Test invalid pluginTimeout value
    mock({
      'vibec.json': JSON.stringify({
        pluginTimeout: 0
      })
    });
    
    logMessages.length = 0;
    
    config = await loadConfig('.');
    mergedOptions = mergeOptions({}, config);
    
    t.equal(mergedOptions.pluginTimeout, 5000, 'Invalid pluginTimeout should be set to default value');
    t.true(logMessages.some(msg => msg.includes('Invalid value for pluginTimeout')), 'Should log error for invalid pluginTimeout');
    
    mock.restore();
    
    // Test missing required fields
    mock({
      'vibec.json': JSON.stringify({
        apiUrl: "https://api.openai.com/v1"
      })
    });
    
    config = await loadConfig('.');
    mergedOptions = mergeOptions({}, config);
    
    t.equal(mergedOptions.workdir, '.', 'Default workdir should be used');
    t.deepEqual(mergedOptions.stacks, ['core'], 'Default stacks should be used');
    t.equal(mergedOptions.noOverwrite, false, 'Default noOverwrite should be used');
    t.equal(mergedOptions.dryRun, false, 'Default dryRun should be used');
    t.equal(mergedOptions.start, null, 'Default start should be used');
    t.equal(mergedOptions.end, null, 'Default end should be used');
    
    mock.restore();
    
    // Test VIBEC_STACKS string to array conversion
    process.env.VIBEC_STACKS = 'core,tests,integration';
    
    mergedOptions = mergeOptions({});
    
    t.deepEqual(mergedOptions.stacks, ['core', 'tests', 'integration'], 'VIBEC_STACKS string should be converted to array');
    
    delete process.env.VIBEC_STACKS;
    
    mock.restore();
  } finally {
    // Restore original logger
    log.logger = originalLogger;
    
    mock.restore();
  }
});