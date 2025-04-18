import test from 'tape';
import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { log, main } from './bin/vibec.js';

// Tests for logging functionality
test('Logging with colors', async (t) => {
  const messages = [];
  // Override logger to capture output
  const originalLogger = log.logger;
  log.logger = (msg) => messages.push(msg);

  // Test each log level
  log.info('Info message');
  log.warn('Warning message');
  log.error('Error message');
  log.success('Success message');
  
  // Verify colors are used
  t.ok(messages[0].includes('\x1b[36m'), 'Info uses cyan color');
  t.ok(messages[1].includes('\x1b[33m'), 'Warn uses yellow color');
  t.ok(messages[2].includes('\x1b[31m'), 'Error uses red color');
  t.ok(messages[3].includes('\x1b[32m'), 'Success uses green color');
  
  // Restore original logger
  log.logger = originalLogger;
});

test('Debug logging respects VIBEC_DEBUG env', async (t) => {
  const messages = [];
  const originalLogger = log.logger;
  log.logger = (msg) => messages.push(msg);

  // Debug should not log by default
  log.debug('Debug message 1');
  t.equal(messages.length, 0, 'Debug logs are suppressed when VIBEC_DEBUG is not set');

  // Set VIBEC_DEBUG env var
  process.env.VIBEC_DEBUG = '1';
  log.debug('Debug message 2');
  t.equal(messages.length, 1, 'Debug logs appear when VIBEC_DEBUG is set');
  t.ok(messages[0].includes('\x1b[35m'), 'Debug uses magenta color');

  // Restore original logger and unset env var
  log.logger = originalLogger;
  delete process.env.VIBEC_DEBUG;
});

// Test full flow with mock API server
test('Real mode execution', async (t) => {
  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `vibec-test-${Date.now()}`);
  const workdir = path.join(tempDir, 'test-workdir');
  const stacksDir = path.join(workdir, 'stacks', 'core');
  const outputDir = path.join(workdir, 'output', 'current');
  
  try {
    // Create directory structure
    await fs.mkdir(stacksDir, { recursive: true });
    
    // Create a test prompt file
    await fs.writeFile(
      path.join(stacksDir, '01_test.md'), 
      '# Test Prompt\n\n## Output: test-file.js'
    );
    
    // Start a mock API server
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        // Collect request body
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', () => {
          // Send mock response
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: 'File: test-file.js\n```js\nconsole.log("mock")\n```'
                }
              }
            ]
          }));
        });
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    });
    
    // Start server on a random port
    await new Promise(resolve => {
      server.listen(3000, 'localhost', resolve);
    });
    
    try {
      // Run the main function
      await main([
        'node', 'vibec.js', 
        `--api-url=http://localhost:3000`,
        '--api-key=test-key',
        `--workdir=${workdir}`
      ]);
      
      // Check if the output file was created
      const fileExists = await fs.access(path.join(outputDir, 'test-file.js'))
        .then(() => true)
        .catch(() => false);
        
      t.ok(fileExists, 'Output file was created');
      
      if (fileExists) {
        const content = await fs.readFile(path.join(outputDir, 'test-file.js'), 'utf-8');
        t.equal(content, 'console.log("mock")', 'File content matches expected output');
      }
    } finally {
      // Close server
      server.close();
    }
  } catch (err) {
    t.fail(`Test failed with error: ${err.message}`);
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Failed to clean up temp directory: ${err.message}`);
    }
  }
});