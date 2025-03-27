const test = require('tape');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { log, main } = require('../../bin/vibec.js');

// Helper to capture console output
function captureOutput(fn) {
  const originalLog = console.log;
  const output = [];
  console.log = (...args) => {
    output.push(args.join(' '));
  };
  
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  
  return output;
}

test('Logging functionality', (t) => {
  // Test log.info
  const infoOutput = captureOutput(() => log.info('Info message'));
  t.ok(infoOutput[0].includes('\x1b[36mInfo message\x1b[0m'), 'log.info should output cyan text');
  
  // Test log.warn
  const warnOutput = captureOutput(() => log.warn('Warning message'));
  t.ok(warnOutput[0].includes('\x1b[33mWarning message\x1b[0m'), 'log.warn should output yellow text');
  
  // Test log.error
  const errorOutput = captureOutput(() => log.error('Error message'));
  t.ok(errorOutput[0].includes('\x1b[31mError message\x1b[0m'), 'log.error should output red text');
  
  // Test log.success
  const successOutput = captureOutput(() => log.success('Success message'));
  t.ok(successOutput[0].includes('\x1b[32mSuccess message\x1b[0m'), 'log.success should output green text');
  
  // Test log.debug without VIBEC_DEBUG
  const debugOutputWithoutFlag = captureOutput(() => log.debug('Debug message without flag'));
  t.equal(debugOutputWithoutFlag.length, 0, 'log.debug should not output when VIBEC_DEBUG is not set');
  
  // Test log.debug with VIBEC_DEBUG
  const originalDebugValue = process.env.VIBEC_DEBUG;
  process.env.VIBEC_DEBUG = '1';
  const debugOutputWithFlag = captureOutput(() => log.debug('Debug message with flag'));
  t.ok(debugOutputWithFlag[0].includes('\x1b[35mDebug message with flag\x1b[0m'), 'log.debug should output magenta text when VIBEC_DEBUG is set');
  
  // Reset environment
  if (originalDebugValue === undefined) {
    delete process.env.VIBEC_DEBUG;
  } else {
    process.env.VIBEC_DEBUG = originalDebugValue;
  }
  
  t.end();
});

test('Real mode operation with mock API', async (t) => {
  t.plan(2);
  
  const testOutputFile = 'output/current/test.js';
  let server;
  
  try {
    // Start a mock API server
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            
            // Verify correct model and prompt structure
            if (data.model && Array.isArray(data.messages) && data.messages.length === 2) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              // Mock API response to create test.js
              res.end(JSON.stringify({
                choices: [
                  {
                    message: {
                      content: 'File: test.js\n```js\nconsole.log("mock")\n```'
                    }
                  }
                ]
              }));
            } else {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Invalid request format');
            }
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid JSON');
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });
    
    // Start the server on a test port
    await new Promise(resolve => {
      server.listen(3000, 'localhost', resolve);
    });
    
    // Run vibec in real mode with mock API
    await main([
      'node', 
      'vibec.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--stacks=core',
      '--start=1',
      '--end=1'
    ]);
    
    // Check if output file exists
    try {
      const stat = await fs.stat(testOutputFile);
      t.ok(stat.isFile(), `${testOutputFile} should exist and be a file`);
      
      // Verify file content
      const content = await fs.readFile(testOutputFile, 'utf8');
      t.equal(content, 'console.log("mock")', 'File content should match mock response');
    } catch (err) {
      t.fail(`Failed to verify test output file: ${err.message}`);
    }
  } catch (err) {
    t.fail(`Test failed with error: ${err.message}`);
  } finally {
    // Clean up
    if (server) {
      await new Promise(resolve => {
        server.close(resolve);
      });
    }
    
    try {
      // Clean up the test file created by this test
      await fs.unlink(testOutputFile);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }
});

test.onFinish(() => {
  console.log('All tests completed.');
});