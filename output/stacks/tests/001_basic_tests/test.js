const test = require('tape');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
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

test('Real mode test with mocked API', async (t) => {
  // Create test directory
  const testWorkdir = './test-workdir';
  await fs.mkdir(testWorkdir, { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'output'), { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'output', 'current'), { recursive: true });
  
  // Create mock server
  const server = http.createServer((req, res) => {
    if (req.url === '/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        const mockResponse = {
          choices: [{
            message: {
              content: 'File: test-file.js\n```js\nconsole.log("mock")\n```'
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
  
  // Start listening on an available port
  server.listen(3000);
  
  try {
    // Call main with mocked API
    await vibec.main([
      process.execPath,
      'vibec.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--workdir=' + testWorkdir
    ]);
    
    // Check if file was created correctly
    try {
      const fileContent = await fs.readFile(path.join(testWorkdir, 'output', 'current', 'test-file.js'), 'utf8');
      t.equal(fileContent, 'console.log("mock")', 'Created file should have expected content');
    } catch (err) {
      t.fail(`Failed to read created file: ${err.message}`);
    }
    
  } finally {
    // Cleanup
    server.close();
    try {
      await fs.rm(testWorkdir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up test directory:', error);
    }
  }
});

test('parseArgs function test', async (t) => {
  const args = [
    process.execPath,
    'vibec.js',
    '--workdir=test-dir',
    '--dry-run',
    '--api-key=test-key'
  ];
  
  const options = vibec.parseArgs(args);
  t.equal(options.workdir, 'test-dir', 'workdir option should be parsed correctly');
  t.equal(options.dryRun, true, 'dry-run flag should be parsed correctly');
  t.equal(options.apiKey, 'test-key', 'api-key option should be parsed correctly');
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