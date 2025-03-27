const test = require('tape');
const fs = require('fs').promises;
const { mergeConfig, loadConfig, processLlm, log } = require('./bin/vibec');

// Spy/mock helpers
const createLogSpy = () => {
  const calls = { error: [], info: [], warn: [], success: [], debug: [] };
  const originalLog = { ...log };
  
  // Replace log methods with spies
  for (const method of Object.keys(calls)) {
    log[method] = message => {
      calls[method].push(message);
      // Still call the original for debugging
      // originalLog[method](message);
    };
  }
  
  return {
    calls,
    restore: () => {
      for (const method of Object.keys(calls)) {
        log[method] = originalLog[method];
      }
    },
    reset: () => {
      for (const method of Object.keys(calls)) {
        calls[method] = [];
      }
    }
  };
};

// Mocks for fs.readFile
const mockFs = (content, error = null) => {
  const original = fs.readFile;
  
  fs.readFile = async (path, encoding) => {
    if (error) throw error;
    return content;
  };
  
  return {
    restore: () => {
      fs.readFile = original;
    }
  };
};

// Test Configuration Loading
test('Config Loading - Valid JSON', async (t) => {
  const validConfig = '{ "stacks": ["core"], "retries": 2 }';
  const fsMock = mockFs(validConfig);
  
  const config = await loadConfig();
  t.deepEqual(config, { stacks: ["core"], retries: 2 }, 'should parse valid JSON correctly');
  
  fsMock.restore();
  t.end();
});

test('Config Loading - Malformed JSON', async (t) => {
  const logSpy = createLogSpy();
  const fsMock = mockFs('{ invalid json', new Error('Invalid JSON'));
  
  const config = await loadConfig();
  t.deepEqual(config, {}, 'should return empty object for invalid JSON');
  t.ok(logSpy.calls.debug.some(msg => msg.includes('No vibec.json found or error')), 
       'should log debug message about error');
  
  logSpy.restore();
  fsMock.restore();
  t.end();
});

test('Config Priority - CLI overrides env overrides file', (t) => {
  // Setup mock config file
  const fileConfig = {
    stacks: ['core'],
    retries: 1,
    pluginTimeout: 3000,
  };
  
  // Save original env
  const originalEnv = { ...process.env };
  
  // Set environment variables
  process.env.VIBEC_STACKS = 'core,tests';
  process.env.VIBEC_RETRIES = '3';
  
  // CLI options override everything
  const cliOptions = {
    stacks: ['tests'],
    fileConfig
  };
  
  const config = mergeConfig(cliOptions);
  
  t.deepEqual(config.stacks, ['tests'], 'CLI options should override env vars and file config');
  t.equal(config.retries, 3, 'Env vars should override file config');
  t.equal(config.pluginTimeout, 3000, 'File config should override defaults');
  
  // Restore env
  process.env = originalEnv;
  t.end();
});

test('Config Validation - Invalid values', (t) => {
  const logSpy = createLogSpy();
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
  
  // Test negative retries
  const badRetries = {
    fileConfig: { retries: -1 }
  };
  
  try {
    mergeConfig(badRetries);
  } catch (e) {
    // This will be caught if process.exit is mocked
  }
  
  t.ok(logSpy.calls.error.some(msg => msg.includes('retries must be')), 
       'should validate retries value');
  
  logSpy.reset();
  
  // Test zero pluginTimeout
  const badTimeout = {
    fileConfig: { pluginTimeout: 0 }
  };
  
  try {
    mergeConfig(badTimeout);
  } catch (e) {
    // This will be caught if process.exit is mocked
  }
  
  t.ok(logSpy.calls.error.some(msg => msg.includes('pluginTimeout must be')), 
       'should validate pluginTimeout value');
  
  logSpy.restore();
  mockExit.mockRestore();
  t.end();
});

// Test Dry Run Execution
test('Dry Run - Should not make real API calls', async (t) => {
  const logSpy = createLogSpy();
  
  const options = {
    dryRun: true,
    apiUrl: 'http://localhost:3000'
  };
  
  const response = await processLlm('Test prompt', options);
  
  t.ok(logSpy.calls.info.some(msg => msg.includes('DRY RUN')), 
       'should log dry run message');
  t.equal(response, 'File: example/file\n```lang\ncontent\n```', 
          'should return mock response');
  
  logSpy.restore();
  t.end();
});

// Mock implementation of jest.spyOn for process.exit
function jest() {
  return {
    spyOn: (obj, method) => {
      const original = obj[method];
      
      obj[method] = jest.fn(() => {});
      
      return {
        mockImplementation: (fn) => {
          obj[method] = fn;
          return {
            mockRestore: () => {
              obj[method] = original;
            }
          };
        }
      };
    },
    fn: (implementation = () => {}) => implementation
  };
}