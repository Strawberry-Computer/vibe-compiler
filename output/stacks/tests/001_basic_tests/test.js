import tape from 'tape';
import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';
import { log, main } from './bin/vibec.js';

// Helper to capture console output
function captureOutput(fn) {
  const messages = [];
  const originalLogger = log.logger;
  
  log.logger = (...args) => {
    messages.push(args.join(' '));
  };
  
  try {
    fn();
  } finally {
    log.logger = originalLogger;
  }
  
  return messages;
}

// Test logging functionality
tape('Test logging with colors', async t => {
  const infoMessages = captureOutput(() => log.info('Info message'));
  t.ok(infoMessages[0].includes('\x1b[36mInfo message\x1b[0m'), 'log.info uses cyan color');
  
  const warnMessages = captureOutput(() => log.warn('Warning message'));
  t.ok(warnMessages[0].includes('\x1b[33mWarning message\x1b[0m'), 'log.warn uses yellow color');
  
  const errorMessages = captureOutput(() => log.error('Error message'));
  t.ok(errorMessages[0].includes('\x1b[31mError message\x1b[0m'), 'log.error uses red color');
  
  const successMessages = captureOutput(() => log.success('Success message'));
  t.ok(successMessages[0].includes('\x1b[32mSuccess message\x1b[0m'), 'log.success uses green color');
  
  // Test debug logging
  const originalDebug = process.env.VIBEC_DEBUG;
  
  // Without VIBEC_DEBUG set
  process.env.VIBEC_DEBUG = '';
  let debugMessages = captureOutput(() => log.debug('Debug message'));
  t.equal(debugMessages.length, 0, 'log.debug does not output when VIBEC_DEBUG is not set');
  
  // With VIBEC_DEBUG set
  process.env.VIBEC_DEBUG = '1';
  debugMessages = captureOutput(() => log.debug('Debug message'));
  t.ok(debugMessages[0].includes('\x1b[35mDebug message\x1b[0m'), 'log.debug outputs with magenta color when VIBEC_DEBUG is set');
  
  // Restore original value
  if (originalDebug === undefined) {
    delete process.env.VIBEC_DEBUG;
  } else {
    process.env.VIBEC_DEBUG = originalDebug;
  }
});

// Test real mode with mock API server
tape('Test real mode with mock API server', async t => {
  // Create a temporary directory for the test
  const tempDir = path.join(os.tmpdir(), `vibec-test-${Date.now()}`);
  const testWorkdir = path.join(tempDir, 'test-workdir');
  
  // Setup directories needed for the test
  await fs.mkdir(path.join(testWorkdir, 'output', 'bootstrap'), { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'stacks', 'core'), { recursive: true });
  
  // Create a test prompt file
  const promptContent = `# Test Prompt
## Output: test-file.js
`;
  await fs.writeFile(
    path.join(testWorkdir, 'stacks', 'core', '001_test.md'),
    promptContent
  );
  
  // Start a mock HTTP server that simulates the OpenAI API
  const server = http.createServer((req, res) => {
    // Mock API response
    if (req.url === '/chat/completions' && req.method === 'POST') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        // Parse request to verify it contains the expected data
        try {
          const requestData = JSON.parse(body);
          t.ok(requestData.messages, 'Request contains messages');
          
          // Return a mock response
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
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  // Start the server
  await new Promise(resolve => {
    server.listen(3000, resolve);
  });
  
  try {
    // Run the main function with mock API
    await main([
      'node', 'vibec.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      `--workdir=${testWorkdir}`,
      '--stacks=core'
    ]);
    
    // Check if the output file was created
    const outputFileExists = await fs.access(path.join(testWorkdir, 'output', 'current', 'test-file.js'))
      .then(() => true)
      .catch(() => false);
    
    t.ok(outputFileExists, 'Output file was created');
    
    if (outputFileExists) {
      const fileContent = await fs.readFile(path.join(testWorkdir, 'output', 'current', 'test-file.js'), 'utf8');
      t.equal(fileContent, 'console.log("mock")', 'File content matches expected output');
    }
  } catch (error) {
    t.fail(`Test failed with error: ${error.message}`);
  } finally {
    // Clean up
    server.close();
    
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up temp directory:', err);
    }
  }
});