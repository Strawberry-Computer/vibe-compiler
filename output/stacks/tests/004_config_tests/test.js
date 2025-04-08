const test = require('tape');
const fs = require('fs').promises;
const path = require('path');
const vibec = require('./bin/vibec.js');

// Mock fs.readFile for testing
const originalReadFile = fs.readFile;

// Test configuration loading and merging
test('Config loading - valid config', async (t) => {
  // Mock fs.readFile to return a valid JSON config
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return JSON.stringify({
        stacks: ["core", "tests"],
        testCmd: "npm test", 
        retries: 2,
        pluginTimeout: 5000,
        apiUrl: "https://api.openai.com/v1",
        apiModel: "gpt-4"
      });
    }
    return originalReadFile(filepath);
  };

  // Mock log functions
  const originalLogError = console.error;
  let errorCalled = false;
  console.error = () => { errorCalled = true; };

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    t.deepEqual(options.stacks, ["core", "tests"], "stacks from config loaded correctly");
    t.equal(options['test-cmd'], "npm test", "testCmd from config loaded correctly");
    t.equal(options.retries, 2, "retries from config loaded correctly");
    t.equal(options['plugin-timeout'], 5000, "pluginTimeout from config loaded correctly");
    t.equal(options['api-url'], "https://api.openai.com/v1", "apiUrl from config loaded correctly");
    t.equal(options['api-model'], "gpt-4", "apiModel from config loaded correctly");
    
    t.equal(errorCalled, false, "No errors were logged");
  } finally {
    // Restore original functions
    fs.readFile = originalReadFile;
    console.error = originalLogError;
  }
  
  t.end();
});

test('Config loading - malformed JSON', async (t) => {
  // Mock fs.readFile to return malformed JSON
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return '{ invalid json }';
    }
    return originalReadFile(filepath);
  };

  // Mock log functions
  const originalLogError = console.error;
  let errorCalled = false;
  console.error = () => { errorCalled = true; };

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    // Default values should be used
    t.deepEqual(options.stacks, ["core"], "Default stacks are used");
    t.equal(options.workdir, ".", "Default workdir is used");
    t.equal(options['dry-run'], false, "Default dry-run is used");
    t.equal(options['no-overwrite'], false, "Default no-overwrite is used");
    
    t.equal(errorCalled, true, "Error was logged for malformed JSON");
  } finally {
    // Restore original functions
    fs.readFile = originalReadFile;
    console.error = originalLogError;
  }
  
  t.end();
});

// Test priority: CLI args > env vars > config
test('Config priority - CLI args override env vars and config', async (t) => {
  // Mock fs.readFile to return config with stacks: ["core"]
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return JSON.stringify({
        stacks: ["core"]
      });
    }
    return originalReadFile(filepath);
  };

  // Set environment variable
  process.env.VIBEC_STACKS = "core,tests";

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js', '--stacks=tests']);
    
    t.deepEqual(options.stacks, ["tests"], "CLI args override both env vars and config");
  } finally {
    // Restore original function and clean env var
    fs.readFile = originalReadFile;
    delete process.env.VIBEC_STACKS;
  }
  
  t.end();
});

// Test priority: env vars > config
test('Config priority - env vars override config', async (t) => {
  // Mock fs.readFile to return config with stacks: ["core"]
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return JSON.stringify({
        stacks: ["core"]
      });
    }
    return originalReadFile(filepath);
  };

  // Set environment variable
  process.env.VIBEC_STACKS = "core,tests";

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    t.deepEqual(options.stacks, ["core", "tests"], "Env vars override config");
  } finally {
    // Restore original function and clean env var
    fs.readFile = originalReadFile;
    delete process.env.VIBEC_STACKS;
  }
  
  t.end();
});

// Test validation of config values
test('Config validation - invalid retries value', async (t) => {
  // Mock fs.readFile to return config with invalid retries value
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return JSON.stringify({
        retries: -1
      });
    }
    return originalReadFile(filepath);
  };

  // Mock log functions
  const originalLogError = console.error;
  let errorMessage = "";
  console.error = (msg) => { errorMessage = msg; };

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    t.equal(options.retries, 0, "Default retries value is used when invalid");
    t.ok(errorMessage.includes("Invalid value for retries"), "Error was logged for invalid retries");
  } finally {
    // Restore original function
    fs.readFile = originalReadFile;
    console.error = originalLogError;
  }
  
  t.end();
});

test('Config validation - invalid pluginTimeout value', async (t) => {
  // Mock fs.readFile to return config with invalid pluginTimeout value
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return JSON.stringify({
        pluginTimeout: 0
      });
    }
    return originalReadFile(filepath);
  };

  // Mock log functions
  const originalLogError = console.error;
  let errorMessage = "";
  console.error = (msg) => { errorMessage = msg; };

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    t.equal(options['plugin-timeout'], 5000, "Default pluginTimeout value is used when invalid");
    t.ok(errorMessage.includes("Invalid value for plugin-timeout"), "Error was logged for invalid pluginTimeout");
  } finally {
    // Restore original function
    fs.readFile = originalReadFile;
    console.error = originalLogError;
  }
  
  t.end();
});

test('Config validation - missing fields use defaults', async (t) => {
  // Mock fs.readFile to return an empty config
  fs.readFile = async (filepath) => {
    if (filepath.endsWith('vibec.json')) {
      return JSON.stringify({});
    }
    return originalReadFile(filepath);
  };

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    t.equal(options.workdir, ".", "Default workdir is used");
    t.deepEqual(options.stacks, ["core"], "Default stacks are used");
    t.equal(options['no-overwrite'], false, "Default no-overwrite is used");
    t.equal(options['dry-run'], false, "Default dry-run is used");
    t.equal(options.start, null, "Default start is used");
    t.equal(options.end, null, "Default end is used");
  } finally {
    // Restore original function
    fs.readFile = originalReadFile;
  }
  
  t.end();
});

test('Config validation - VIBEC_STACKS converts string to array', async (t) => {
  // Set environment variable
  process.env.VIBEC_STACKS = "core,tests,custom";

  try {
    const options = await vibec.parseArgs(['node', 'vibec.js']);
    
    t.deepEqual(options.stacks, ["core", "tests", "custom"], "VIBEC_STACKS string is converted to array");
  } finally {
    // Clean env var
    delete process.env.VIBEC_STACKS;
  }
  
  t.end();
});