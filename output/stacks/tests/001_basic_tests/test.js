const tape = require('tape');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { log, main } = require('./bin/vibec.js');

tape('Logging functionality', async (t) => {
  // Save the original logger and create a mock
  const originalLogger = log.logger;
  let logOutput = [];
  
  log.logger = (...args) => {
    logOutput.push(args.join(' '));
  };
  
  try {
    // Test info logging with ANSI colors
    logOutput = [];
    log.info('Info message');
    t.true(logOutput[0].includes('\x1b[36mInfo message\x1b[0m'), 'log.info should output cyan text');
    
    // Test warning logging with ANSI colors
    logOutput = [];
    log.warn('Warning message');
    t.true(logOutput[0].includes('\x1b[33mWarning message\x1b[0m'), 'log.warn should output yellow text');
    
    // Test error logging with ANSI colors
    logOutput = [];
    log.error('Error message');
    t.true(logOutput[0].includes('\x1b[31mError message\x1b[0m'), 'log.error should output red text');
    
    // Test success logging with ANSI colors
    logOutput = [];
    log.success('Success message');
    t.true(logOutput[0].includes('\x1b[32mSuccess message\x1b[0m'), 'log.success should output green text');
    
    // Test debug logging - should not output when VIBEC_DEBUG is not set
    logOutput = [];
    delete process.env.VIBEC_DEBUG;
    log.debug('Debug message without flag');
    t.equal(logOutput.length, 0, 'log.debug should not output when VIBEC_DEBUG is not set');
    
    // Test debug logging - should output when VIBEC_DEBUG=1
    logOutput = [];
    process.env.VIBEC_DEBUG = '1';
    log.debug('Debug message with flag');
    t.true(logOutput[0].includes('\x1b[35mDebug message with flag\x1b[0m'), 'log.debug should output purple text when VIBEC_DEBUG=1');
  } finally {
    // Restore the original logger
    log.logger = originalLogger;
    delete process.env.VIBEC_DEBUG;
  }
});

tape('Real mode execution', async (t) => {
  // Save the original logger
  const originalLogger = log.logger;
  log.logger = () => {}; // Silence logs for this test
  
  let server;
  const testWorkdir = './test-workdir';
  const testOutputDir = path.join(testWorkdir, 'output/current');
  const testFile = path.join(testOutputDir, 'test-file.js');
  
  try {
    // Create a mock server
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', () => {
          const responseObj = {
            choices: [
              {
                message: {
                  content: 'File: test-file.js\n```js\nconsole.log("mock")\n```'
                }
              }
            ]
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(responseObj));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    
    server.listen(3000);
    
    // Setup test directories
    await fs.mkdir(path.join(testWorkdir, 'stacks/core'), { recursive: true });
    await fs.mkdir(testOutputDir, { recursive: true });
    
    // Create a test prompt file
    const promptDir = path.join(testWorkdir, 'stacks/core');
    await fs.writeFile(
      path.join(promptDir, '001_test.md'),
      '# Test Prompt\n\n## Output: test-file.js'
    );
    
    // Run vibec in real mode
    const args = [
      'node', 'script.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--workdir=' + testWorkdir
    ];
    
    await main(args);
    
    // Verify the output file was created
    const fileExists = await fileExistsAsync(testFile);
    t.true(fileExists, 'Output file should be created');
    
    if (fileExists) {
      const content = await fs.readFile(testFile, 'utf8');
      t.equal(content, 'console.log("mock")', 'File content should match mock response');
    }
    
  } finally {
    // Clean up
    log.logger = originalLogger;
    if (server) {
      server.close();
    }
    try {
      await fs.rm(testWorkdir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
});

async function fileExistsAsync(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    return false;
  }
}