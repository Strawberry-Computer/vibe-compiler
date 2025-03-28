const test = require('tape');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const vibec = require('./bin/vibec.js');
const { log } = vibec;

// Helper to capture console output
function captureOutput(fn) {
  const originalConsoleLog = console.log;
  const capturedOutput = [];
  
  console.log = (...args) => {
    capturedOutput.push(args.join(' '));
  };
  
  try {
    fn();
  } finally {
    console.log = originalConsoleLog;
  }
  
  return capturedOutput;
}

// Create a temp directory for testing
async function createTempTestDir() {
  const tempDir = path.join(os.tmpdir(), 'vibec-test-' + Math.random().toString(36).substr(2, 9));
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(path.join(tempDir, 'output'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'output', 'current'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'stacks'), { recursive: true });
  return tempDir;
}

test('Logging tests', async (t) => {
  // Test ANSI color logging
  const infoOutput = captureOutput(() => log.info('Test info message'));
  t.ok(infoOutput[0].includes('\x1b[36m'), 'log.info should use cyan color');
  
  const warnOutput = captureOutput(() => log.warn('Test warn message'));
  t.ok(warnOutput[0].includes('\x1b[33m'), 'log.warn should use yellow color');
  
  const errorOutput = captureOutput(() => log.error('Test error message'));
  t.ok(errorOutput[0].includes('\x1b[31m'), 'log.error should use red color');
  
  const successOutput = captureOutput(() => log.success('Test success message'));
  t.ok(successOutput[0].includes('\x1b[32m'), 'log.success should use green color');
  
  // Test debug output with VIBEC_DEBUG=1
  process.env.VIBEC_DEBUG = '1';
  const debugOutput = captureOutput(() => log.debug('Test debug message'));
  t.ok(debugOutput[0].includes('\x1b[35m'), 'log.debug should use magenta color when VIBEC_DEBUG=1');
  
  // Test debug output without VIBEC_DEBUG=1
  delete process.env.VIBEC_DEBUG;
  const noDebugOutput = captureOutput(() => log.debug('Test debug message'));
  t.equal(noDebugOutput.length, 0, 'log.debug should not output anything when VIBEC_DEBUG is not set');
});

test('Static plugins test with mocked API', async (t) => {
  // Create test directory with test stack
  const testWorkdir = await createTempTestDir();
  const testStackDir = path.join(testWorkdir, 'stacks', 'test-stack');
  const pluginsDir = path.join(testStackDir, 'plugins');
  
  await fs.mkdir(testStackDir, { recursive: true });
  await fs.mkdir(pluginsDir, { recursive: true });
  
  // Create test prompt
  await fs.writeFile(path.join(testStackDir, '001_test.md'), 
    '# Test Prompt\n\n## Output: test.js\n\nGenerate a test file');
  
  // Create static plugin
  await fs.writeFile(path.join(pluginsDir, 'test-plugin.md'), 
    'This is a test plugin content that should be appended to the prompt');
  
  // Create mock server
  const server = http.createServer((req, res) => {
    if (req.url === '/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        // Verify plugin content is included
        const hasPluginContent = body.includes('test-plugin.md') && 
                                body.includes('This is a test plugin content');
        
        const mockResponse = {
          choices: [{
            message: {
              content: 'File: test.js\n```js\nconsole.log("mock")\n```'
            }
          }]
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockResponse));
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  // Start listening
  server.listen(3000);
  
  try {
    // Call main with mocked API
    await vibec.main([
      process.execPath,
      'vibec.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--workdir=' + testWorkdir,
      '--stacks=test-stack',
      '--dry-run=false'
    ]);
    
    // Check if file was created correctly
    const fileContent = await fs.readFile(path.join(testWorkdir, 'output', 'current', 'test.js'), 'utf8');
    t.equal(fileContent, 'console.log("mock")', 'Created file should have expected content');
    
  } finally {
    // Cleanup
    server.close();
    await fs.rm(testWorkdir, { recursive: true, force: true });
  }
});

test('Dynamic plugins test', async (t) => {
  // Create test directory with test stack
  const testWorkdir = await createTempTestDir();
  const testStackDir = path.join(testWorkdir, 'stacks', 'test-stack');
  const pluginsDir = path.join(testStackDir, 'plugins');
  
  await fs.mkdir(testStackDir, { recursive: true });
  await fs.mkdir(pluginsDir, { recursive: true });
  
  // Create test prompt
  await fs.writeFile(path.join(testStackDir, '001_test.md'), '# Test Prompt\n\nA test prompt');
  
  // Create dynamic plugin (that adds a file)
  await fs.writeFile(path.join(pluginsDir, 'test-plugin.js'), 
    'module.exports = async function(context) { return "test"; }');
  
  // Execute plugins directly to test
  const plugins = await vibec.loadDynamicPlugins('test-stack', testWorkdir);
  t.equal(plugins.length, 1, 'Should load 1 dynamic plugin');
  t.equal(plugins[0].name, 'test-plugin.js', 'Plugin name should match');
  
  // Test plugin execution with timeout
  const context = {};
  let executed = false;
  
  // Mock plugin that returns fast
  const fastPlugin = {
    name: 'fast-plugin.js',
    execute: async (ctx) => {
      executed = true;
      return "test result";
    }
  };
  
  await vibec.executeDynamicPlugins([fastPlugin], context, 1000);
  t.ok(executed, 'Fast plugin should execute successfully');
  
  // Mock plugin that times out
  executed = false;
  const slowPlugin = {
    name: 'slow-plugin.js',
    execute: async (ctx) => {
      return new Promise(resolve => {
        setTimeout(() => {
          executed = true;
          resolve("too late");
        }, 2000);
      });
    }
  };
  
  // Capture errors during execution
  let errorCaptured = false;
  const originalError = log.error;
  log.error = (msg) => {
    if (msg.includes('timed out')) {
      errorCaptured = true;
    }
    originalError(msg);
  };
  
  await vibec.executeDynamicPlugins([slowPlugin], context, 100);
  t.ok(errorCaptured, 'Plugin timeout should be captured');
  t.notOk(executed, 'Slow plugin execution should be aborted');
  
  // Restore original error function
  log.error = originalError;
  
  try {
    await fs.rm(testWorkdir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error cleaning up test directory:', error);
  }
});

test('Plugin errors test', async (t) => {
  // Create test directory
  const testWorkdir = await createTempTestDir();
  const testStackDir = path.join(testWorkdir, 'stacks', 'test-stack');
  const pluginsDir = path.join(testStackDir, 'plugins');
  
  await fs.mkdir(testStackDir, { recursive: true });
  await fs.mkdir(pluginsDir, { recursive: true });
  
  // Create dynamic plugin with error
  await fs.writeFile(path.join(pluginsDir, 'error-plugin.js'), 
    'module.exports = async function(context) { throw new Error("Test error"); }');
  
  // Capture errors
  let errorCaptured = false;
  const originalError = log.error;
  log.error = (msg) => {
    if (msg.includes('Test error')) {
      errorCaptured = true;
    }
    originalError(msg);
  };
  
  // Load and execute plugin
  const plugins = await vibec.loadDynamicPlugins('test-stack', testWorkdir);
  await vibec.executeDynamicPlugins(plugins, {}, 1000);
  
  // Restore original error function
  log.error = originalError;
  
  t.ok(errorCaptured, 'Plugin error should be captured and logged');
  
  try {
    await fs.rm(testWorkdir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error cleaning up test directory:', error);
  }
});

test('CLI args test (stacks)', async (t) => {
  const args = [
    process.execPath,
    'vibec.js',
    '--stacks=core,tests'
  ];
  
  const options = vibec.parseArgs(args);
  t.deepEqual(options.stacks, ['core', 'tests'], 'stacks option should be parsed correctly');
});

test('CLI args test (flags)', async (t) => {
  const args = [
    process.execPath,
    'vibec.js',
    '--dry-run',
    '--no-overwrite'
  ];
  
  const options = vibec.parseArgs(args);
  t.equal(options.dryRun, true, 'dry-run flag should be parsed correctly');
  t.equal(options.noOverwrite, true, 'no-overwrite flag should be parsed correctly');
});

test('parseResponse function test', async (t) => {
  const response = 'Some text\nFile: path/to/file1.js\n```js\nconsole.log("test");\n```\nMore text\nFile: path/to/file2.css\n```css\nbody { color: red; }\n```';
  
  const files = vibec.parseResponse(response);
  t.equal(files.length, 2, 'Should extract 2 files from response');
  t.equal(files[0].path, 'path/to/file1.js', 'First file path should be extracted correctly');
  t.equal(files[0].content, 'console.log("test");', 'First file content should be extracted correctly');
  t.equal(files[1].path, 'path/to/file2.css', 'Second file path should be extracted correctly');
  t.equal(files[1].content, 'body { color: red; }', 'Second file content should be extracted correctly');
});

// New CLI enhancement tests
test('CLI args --help flag', (t) => {
  // Capture process.exit calls
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  
  let exitCode;
  let helpText = '';
  
  process.exit = (code) => {
    exitCode = code;
    throw new Error('Exit called');
  };
  
  console.log = (text) => {
    helpText += text + '\n';
  };
  
  try {
    vibec.parseArgs([process.execPath, 'vibec.js', '--help']);
  } catch (e) {
    if (e.message !== 'Exit called') throw e;
  } finally {
    process.exit = originalExit;
    console.log = originalConsoleLog;
  }
  
  t.equal(exitCode, 0, 'process.exit should be called with code 0 for --help');
  t.ok(helpText.includes('--stacks'), 'Help text should include --stacks option');
  t.ok(helpText.includes('--api-url'), 'Help text should include --api-url option');
  t.ok(helpText.includes('--api-model'), 'Help text should include --api-model option');
  t.ok(helpText.includes('--retries'), 'Help text should include --retries option');
  t.ok(helpText.includes('--plugin-timeout'), 'Help text should include --plugin-timeout option');
  t.ok(helpText.includes('--test-cmd'), 'Help text should include --test-cmd option');
  t.ok(helpText.includes('--output'), 'Help text should include --output option');
  t.end();
});

test('CLI args --version flag', (t) => {
  // Capture process.exit calls
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  
  let exitCode;
  let versionText = '';
  
  process.exit = (code) => {
    exitCode = code;
    throw new Error('Exit called');
  };
  
  console.log = (text) => {
    versionText = text;
  };
  
  try {
    vibec.parseArgs([process.execPath, 'vibec.js', '--version']);
  } catch (e) {
    if (e.message !== 'Exit called') throw e;
  } finally {
    process.exit = originalExit;
    console.log = originalConsoleLog;
  }
  
  t.equal(exitCode, 0, 'process.exit should be called with code 0 for --version');
  t.ok(versionText.match(/vibec v\d+\.\d+\.\d+/), 'Version output should match format "vibec vX.Y.Z"');
  t.end();
});

test('CLI args parsing for new options', (t) => {
  const args = [
    process.execPath,
    'vibec.js',
    '--api-url=https://api.anthropic.com/v1',
    '--api-model=claude-3.7-sonnet',
    '--test-cmd=npm test',
    '--retries=2',
    '--plugin-timeout=6000',
    '--output=custom_output'
  ];
  
  const options = vibec.parseArgs(args);
  t.equal(options.apiUrl, 'https://api.anthropic.com/v1', 'API URL should be parsed correctly');
  t.equal(options.apiModel, 'claude-3.7-sonnet', 'API model should be parsed correctly');
  t.equal(options.testCmd, 'npm test', 'Test command should be parsed correctly');
  t.equal(options.retries, 2, 'Retries should be parsed correctly');
  t.equal(options.pluginTimeout, 6000, 'Plugin timeout should be parsed correctly');
  t.equal(options.output, 'custom_output', 'Output directory should be parsed correctly');
  t.end();
});

test('CLI args validation', (t) => {
  // Test negative retries
  const originalExit = process.exit;
  const originalError = log.error;
  
  let exitCode;
  let errorMessage = '';
  
  process.exit = (code) => {
    exitCode = code;
    throw new Error('Exit called');
  };
  
  log.error = (msg) => {
    errorMessage = msg;
  };
  
  try {
    vibec.parseArgs([process.execPath, 'vibec.js', '--retries=-1']);
  } catch (e) {
    if (e.message !== 'Exit called') throw e;
  }
  
  t.equal(exitCode, 1, 'process.exit should be called with code 1 for invalid --retries');
  t.equal(errorMessage, '--retries must be a non-negative integer', 'Error message for invalid --retries should be correct');
  
  // Test invalid plugin timeout
  errorMessage = '';
  
  try {
    vibec.parseArgs([process.execPath, 'vibec.js', '--plugin-timeout=0']);
  } catch (e) {
    if (e.message !== 'Exit called') throw e;
  }
  
  t.equal(exitCode, 1, 'process.exit should be called with code 1 for invalid --plugin-timeout');
  t.equal(errorMessage, '--plugin-timeout must be a positive integer', 'Error message for invalid --plugin-timeout should be correct');
  
  process.exit = originalExit;
  log.error = originalError;
  t.end();
});

test('Environment variable overrides', (t) => {
  // Set environment variable
  process.env.VIBEC_API_URL = 'https://env.example.com';
  
  // CLI arg should override env var
  const args = [
    process.execPath,
    'vibec.js',
    '--api-url=https://cli.example.com'
  ];
  
  const options = vibec.parseArgs(args);
  t.equal(options.apiUrl, 'https://cli.example.com', 'CLI arg should override environment variable');
  
  // Clean up
  delete process.env.VIBEC_API_URL;
  t.end();
});

test('Dry run mode', async (t) => {
  // Test dry run mode with API URL
  const mockProcessLlm = async (prompt, options) => {
    t.equal(options.apiUrl, 'http://localhost:3000', 'API URL should be passed to processLlm');
    t.ok(options.dryRun, 'Dry run flag should be set');
    return 'File: test.js\n```js\nconsole.log("dry run test");\n```';
  };
  
  // Save original function
  const originalProcessLlm = vibec.processLlm;
  
  // Replace with mock
  vibec.processLlm = mockProcessLlm;
  
  try {
    // Capture output
    const originalConsoleLog = console.log;
    const capturedOutput = [];
    
    console.log = (...args) => {
      capturedOutput.push(args.join(' '));
    };
    
    // Create test directory
    const testWorkdir = await createTempTestDir();
    const testStackDir = path.join(testWorkdir, 'stacks', 'test-stack');
    
    await fs.mkdir(testStackDir, { recursive: true });
    await fs.writeFile(path.join(testStackDir, '001_test.md'), '# Test Prompt\n\n## Output: test.js');
    
    // Run with dry-run and specific API URL
    await vibec.main([
      process.execPath,
      'vibec.js',
      '--dry-run',
      '--api-url=http://localhost:3000',
      '--workdir=' + testWorkdir,
      '--stacks=test-stack'
    ]);
    
    // Check output
    const dryRunMessage = capturedOutput.find(msg => msg.includes('Dry run mode'));
    t.ok(dryRunMessage, 'Should output dry run message');
    
    // Restore console.log
    console.log = originalConsoleLog;
    
    // Clean up
    await fs.rm(testWorkdir, { recursive: true, force: true });
    
  } finally {
    // Restore original function
    vibec.processLlm = originalProcessLlm;
  }
  
  t.end();
});