const test = require('tape');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { log, main, parseArgs, showHelp, showVersion } = require('./bin/vibec.js');

// Test logging functionality
test('Logging works correctly', async (t) => {
  // Store original logger function
  const originalLogger = log.logger;
  let output = '';
  
  // Override logger to capture output
  log.logger = (msg) => {
    output += msg + '\n';
  };
  
  try {
    // Test info logging
    output = '';
    log.info('Info message');
    t.ok(output.includes('\x1b[36mInfo message\x1b[0m'), 'log.info shows cyan color');
    
    // Test warning logging
    output = '';
    log.warn('Warning message');
    t.ok(output.includes('\x1b[33mWarning message\x1b[0m'), 'log.warn shows yellow color');
    
    // Test error logging
    output = '';
    log.error('Error message');
    t.ok(output.includes('\x1b[31mError message\x1b[0m'), 'log.error shows red color');
    
    // Test success logging
    output = '';
    log.success('Success message');
    t.ok(output.includes('\x1b[32mSuccess message\x1b[0m'), 'log.success shows green color');
    
    // Test debug logging - should not output without VIBEC_DEBUG set
    output = '';
    log.debug('Debug message');
    t.equal(output, '', 'log.debug outputs nothing when VIBEC_DEBUG is not set');
    
    // Test debug logging with VIBEC_DEBUG set
    process.env.VIBEC_DEBUG = '1';
    output = '';
    log.debug('Debug message');
    t.ok(output.includes('\x1b[35mDebug message\x1b[0m'), 'log.debug shows magenta color when VIBEC_DEBUG=1');
    delete process.env.VIBEC_DEBUG;
    
  } finally {
    // Restore original logger
    log.logger = originalLogger;
  }
});

// Test CLI argument parsing
test('CLI argument parsing', (t) => {
  // Test --help flag
  const helpArgs = parseArgs(['node', 'vibec.js', '--help']);
  t.equal(helpArgs.help, true, '--help flag is correctly parsed');
  
  // Test --version flag
  const versionArgs = parseArgs(['node', 'vibec.js', '--version']);
  t.equal(versionArgs.version, true, '--version flag is correctly parsed');
  
  // Test --api-url flag
  const customApiUrlArgs = parseArgs(['node', 'vibec.js', '--api-url=https://api.anthropic.com/v1']);
  t.equal(customApiUrlArgs['api-url'], 'https://api.anthropic.com/v1', '--api-url=value is correctly parsed');
  
  // Test --api-model flag
  const customModelArgs = parseArgs(['node', 'vibec.js', '--api-model=claude-3.7-sonnet']);
  t.equal(customModelArgs['api-model'], 'claude-3.7-sonnet', '--api-model=value is correctly parsed');
  
  // Test --test-cmd flag
  const testCmdArgs = parseArgs(['node', 'vibec.js', '--test-cmd=npm test']);
  t.equal(testCmdArgs['test-cmd'], 'npm test', '--test-cmd=value is correctly parsed');
  
  // Test --retries flag with valid value
  const retriesArgs = parseArgs(['node', 'vibec.js', '--retries=2']);
  t.equal(retriesArgs['retries'], 2, '--retries=value is correctly parsed as number');
  
  // Test --retries flag with invalid value
  t.throws(
    () => parseArgs(['node', 'vibec.js', '--retries=-1']), 
    /Invalid value for retries/,
    '--retries with negative value throws error'
  );
  
  // Test --plugin-timeout flag with valid value
  const timeoutArgs = parseArgs(['node', 'vibec.js', '--plugin-timeout=6000']);
  t.equal(timeoutArgs['plugin-timeout'], 6000, '--plugin-timeout=value is correctly parsed as number');
  
  // Test --plugin-timeout flag with invalid value
  t.throws(
    () => parseArgs(['node', 'vibec.js', '--plugin-timeout=0']), 
    /Invalid value for plugin-timeout/,
    '--plugin-timeout with non-positive value throws error'
  );
  
  // Test --output flag
  const outputDirArgs = parseArgs(['node', 'vibec.js', '--output=custom_output']);
  t.equal(outputDirArgs.output, 'custom_output', '--output=value is correctly parsed');
  
  // Test --stacks flag
  const stacksArgs = parseArgs(['node', 'vibec.js', '--stacks=frontend,backend']);
  t.deepEqual(stacksArgs.stacks, ['frontend', 'backend'], '--stacks=value is correctly parsed as array');
  
  // Test environment variable override
  process.env.VIBEC_API_URL = 'https://env.example.com';
  const envOverrideArgs = parseArgs(['node', 'vibec.js', '--api-url=https://cli.example.com']);
  t.equal(envOverrideArgs['api-url'], 'https://cli.example.com', 'CLI arg overrides env var');
  delete process.env.VIBEC_API_URL;
  
  t.end();
});

// Test help and version output
test('Help and version output', (t) => {
  // Capture console.log output
  const originalConsoleLog = console.log;
  let output = '';
  
  console.log = (msg) => {
    output += msg + '\n';
  };
  
  try {
    // Test help output
    output = '';
    showHelp();
    t.ok(output.includes('--stacks=<stack1,stack2>'), 'Help text includes stacks option');
    t.ok(output.includes('--api-url=<url>'), 'Help text includes api-url option');
    t.ok(output.includes('--retries=<number>'), 'Help text includes retries option');
    t.ok(output.includes('--output=<dir>'), 'Help text includes output option');
    t.ok(output.includes('--plugin-timeout=<ms>'), 'Help text includes plugin-timeout option');
    
    // Test version output
    output = '';
    showVersion();
    t.ok(output.match(/vibec v\S+/), 'Version output includes version number');
  } finally {
    // Restore console.log
    console.log = originalConsoleLog;
  }
  
  t.end();
});

// Test dry-run mode
test('Dry-run mode operation', async (t) => {
  const testWorkdir = path.join(process.cwd(), 'test-dry-run');
  
  try {
    // Create test directories
    await fs.mkdir(path.join(testWorkdir, 'stacks', 'core'), { recursive: true });
    await fs.mkdir(path.join(testWorkdir, 'output', 'current'), { recursive: true });
    await fs.mkdir(path.join(testWorkdir, 'output', 'bootstrap'), { recursive: true });
    
    // Create a test prompt file
    await fs.writeFile(
      path.join(testWorkdir, 'stacks', 'core', '01_test.md'),
      '# Test prompt\n\n## Output: test-file.js'
    );
    
    // Capture log output
    const originalLogger = log.logger;
    let logOutput = '';
    log.logger = (msg) => {
      logOutput += msg + '\n';
    };
    
    try {
      // Run the main function with dry-run option
      await main([
        'node', 'vibec.js',
        '--dry-run',
        '--api-url=http://localhost:3000',
        '--workdir=' + testWorkdir
      ]);
      
      // Verify log output indicates dry run
      t.ok(logOutput.includes('DRY RUN: Prompt would be sent to LLM API:'), 'Dry run message was logged');
      
      // Check that the output file doesn't exist (since it's dry run)
      try {
        await fs.access(path.join(testWorkdir, 'output', 'current', 'test-file.js'));
        t.fail('Output file should not exist in dry run mode');
      } catch (err) {
        t.pass('Output file does not exist as expected in dry run mode');
      }
    } finally {
      log.logger = originalLogger;
    }
  } finally {
    // Clean up
    try {
      await fs.rm(testWorkdir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to remove test directory:', err);
    }
  }
});

// Test real mode operation
test('Real mode operation', async (t) => {
  // Create a mock server that returns a fixed response
  const server = http.createServer((req, res) => {
    if (req.url === '/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const requestBody = JSON.parse(body);
          
          // Verify request format
          t.equal(requestBody.model, 'anthropic/claude-3.7-sonnet', 'Uses correct model');
          t.equal(requestBody.messages[0].role, 'system', 'First message is system role');
          t.equal(requestBody.messages[1].role, 'user', 'Second message is user role');
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: 'File: test-file.js\n```js\nconsole.log("mock")\n```'
                }
              }
            ]
          }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  const testWorkdir = path.join(process.cwd(), 'test-workdir');
  
  try {
    // Start the server
    await new Promise(resolve => server.listen(3000, resolve));
    
    // Create test directories
    await fs.mkdir(path.join(testWorkdir, 'stacks', 'core'), { recursive: true });
    await fs.mkdir(path.join(testWorkdir, 'output', 'current'), { recursive: true });
    await fs.mkdir(path.join(testWorkdir, 'output', 'bootstrap'), { recursive: true });
    
    // Create a test prompt file
    await fs.writeFile(
      path.join(testWorkdir, 'stacks', 'core', '01_test.md'),
      '# Test prompt\n\n## Output: test-file.js'
    );
    
    // Run the main function with test arguments
    await main([
      'node', 'vibec.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--workdir=' + testWorkdir
    ]);
    
    // Verify the file was created
    const fileContent = await fs.readFile(
      path.join(testWorkdir, 'output', 'current', 'test-file.js'),
      'utf-8'
    );
    t.equal(fileContent, 'console.log("mock")', 'Generated file has correct content');
    
  } finally {
    // Clean up
    server.close();
    try {
      await fs.rm(testWorkdir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to remove test directory:', err);
    }
  }
});