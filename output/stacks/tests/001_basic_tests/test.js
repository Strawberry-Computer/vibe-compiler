const test = require('tape');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { log, main } = require('./bin/vibec.js');

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

// Optional: Add more tests for other functions like parseArgs, getPromptFiles, etc.