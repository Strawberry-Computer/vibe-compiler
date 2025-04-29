import tape from 'tape';
import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';
import { log, main, parseArgs, loadPlugins } from './bin/vibec.js';

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

// Test CLI argument parsing
tape('Test CLI argument parsing', t => {
  // Test --stacks with comma-separated values
  const args1 = ['node', 'vibec.js', '--stacks=core,tests'];
  const options1 = parseArgs(args1);
  t.deepEqual(options1.stacks, ['core', 'tests'], 'Should parse comma-separated stacks');
  
  // Test --dry-run flag
  const args2 = ['node', 'vibec.js', '--dry-run'];
  const options2 = parseArgs(args2);
  t.equal(options2['dry-run'], true, 'Should set dry-run flag');
  
  // Test --dry-run=false
  const args3 = ['node', 'vibec.js', '--dry-run=false'];
  const options3 = parseArgs(args3);
  t.equal(options3['dry-run'], false, 'Should parse dry-run=false');
  
  // Test multiple arguments
  const args4 = ['node', 'vibec.js', '--stacks=core,utils', '--api-url=http://localhost:3000', '--dry-run'];
  const options4 = parseArgs(args4);
  t.deepEqual(options4.stacks, ['core', 'utils'], 'Should parse stacks correctly');
  t.equal(options4['api-url'], 'http://localhost:3000', 'Should set API URL');
  t.equal(options4['dry-run'], true, 'Should set dry-run flag');
  
  t.end();
});

// Test loading plugins
tape('Test loading plugins', async t => {
  // Create a temporary directory for the test
  const tempDir = path.join(os.tmpdir(), `vibec-plugin-test-${Date.now()}`);
  await fs.mkdir(path.join(tempDir, 'stacks', 'test-stack', 'plugins'), { recursive: true });
  
  // Create a test plugin file
  const pluginContent = '# Test Plugin\nThis is a test plugin content.';
  await fs.writeFile(
    path.join(tempDir, 'stacks', 'test-stack', 'plugins', 'test-plugin.md'),
    pluginContent
  );
  
  try {
    // Load plugins
    const result = await loadPlugins(tempDir, 'test-stack');
    t.ok(result.includes('This is a test plugin content.'), 'Should load plugin content');
  } finally {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  
  t.end();
});

// Test real mode with mock API server and plugins
tape('Test real mode with mock API server and plugins', async t => {
  // Create a temporary directory for the test
  const tempDir = path.join(os.tmpdir(), `vibec-test-${Date.now()}`);
  const testWorkdir = path.join(tempDir, 'test-workdir');
  
  // Setup directories needed for the test
  await fs.mkdir(path.join(testWorkdir, 'output', 'bootstrap'), { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'stacks', 'test-stack', 'plugins'), { recursive: true });
  
  // Create a test prompt file
  const promptContent = `# Test Prompt
## Output: test.js
`;
  await fs.writeFile(
    path.join(testWorkdir, 'stacks', 'test-stack', '001_test.md'),
    promptContent
  );
  
  // Create a plugin file
  const pluginContent = '# Test Plugin\nThis adds functionality.';
  await fs.writeFile(
    path.join(testWorkdir, 'stacks', 'test-stack', 'plugins', 'test-plugin.md'),
    pluginContent
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
        // Verify the request includes the plugin content
        try {
          const requestData = JSON.parse(body);
          const userMessage = requestData.messages.find(m => m.role === 'user')?.content || '';
          
          t.ok(userMessage.includes('This adds functionality'), 'Request should include plugin content');
          
          // Return a mock response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: 'File: test.js\n```js\nconsole.log("mock")\n```'
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
      '--dry-run=false',
      '--stacks=test-stack'
    ]);
    
    // Check if the output file was created
    const outputFileExists = await fs.access(path.join(testWorkdir, 'output', 'current', 'test.js'))
      .then(() => true)
      .catch(() => false);
    
    t.ok(outputFileExists, 'Output file was created');
    
    if (outputFileExists) {
      const fileContent = await fs.readFile(path.join(testWorkdir, 'output', 'current', 'test.js'), 'utf8');
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

// Test dry-run mode
tape('Test dry-run mode', async t => {
  // Create a temporary directory for the test
  const tempDir = path.join(os.tmpdir(), `vibec-dry-run-test-${Date.now()}`);
  const testWorkdir = path.join(tempDir, 'test-workdir');
  
  // Setup directories needed for the test
  await fs.mkdir(path.join(testWorkdir, 'output', 'bootstrap'), { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'stacks', 'core'), { recursive: true });
  
  // Create a test prompt file
  const promptContent = `# Test Prompt
## Output: dry-run-test.js
`;
  await fs.writeFile(
    path.join(testWorkdir, 'stacks', 'core', '001_test.md'),
    promptContent
  );
  
  try {
    // Capture output to verify dry-run behavior
    const originalLogger = log.logger;
    const messages = [];
    
    log.logger = (...args) => {
      messages.push(args.join(' '));
    };
    
    // Run with dry-run mode
    await main([
      'node', 'vibec.js',
      `--workdir=${testWorkdir}`,
      '--dry-run',
      '--stacks=core'
    ]);
    
    // Restore logger
    log.logger = originalLogger;
    
    // Check that dry-run message was logged
    t.ok(messages.some(msg => msg.includes('DRY RUN MODE')), 'Dry-run mode message should be logged');
    
    // Check that the output file was NOT created
    const outputFileExists = await fs.access(path.join(testWorkdir, 'output', 'current', 'dry-run-test.js'))
      .then(() => true)
      .catch(() => false);
    
    t.notOk(outputFileExists, 'Output file should not be created in dry-run mode');
  } catch (error) {
    t.fail(`Test failed with error: ${error.message}`);
  } finally {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up temp directory:', err);
    }
  }
  
  t.end();
});

// Test multiple stacks
tape('Test processing multiple stacks', async t => {
  // Create a temporary directory for the test
  const tempDir = path.join(os.tmpdir(), `vibec-multi-stack-test-${Date.now()}`);
  const testWorkdir = path.join(tempDir, 'test-workdir');
  
  // Setup directories needed for the test
  await fs.mkdir(path.join(testWorkdir, 'output', 'bootstrap'), { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'stacks', 'stack1'), { recursive: true });
  await fs.mkdir(path.join(testWorkdir, 'stacks', 'stack2'), { recursive: true });
  
  // Create test prompt files
  await fs.writeFile(
    path.join(testWorkdir, 'stacks', 'stack1', '001_test.md'),
    `# Test Prompt Stack1\n## Output: stack1.js\n`
  );
  
  await fs.writeFile(
    path.join(testWorkdir, 'stacks', 'stack2', '001_test.md'),
    `# Test Prompt Stack2\n## Output: stack2.js\n`
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
        // Return a mock response based on the request content
        try {
          const requestData = JSON.parse(body);
          const userMessage = requestData.messages.find(m => m.role === 'user')?.content || '';
          
          let response;
          if (userMessage.includes('Test Prompt Stack1')) {
            response = 'File: stack1.js\n```js\nconsole.log("stack1")\n```';
          } else {
            response = 'File: stack2.js\n```js\nconsole.log("stack2")\n```';
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: response
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
    // Run the main function with multiple stacks
    await main([
      'node', 'vibec.js',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      `--workdir=${testWorkdir}`,
      '--stacks=stack1,stack2'
    ]);
    
    // Check if both output files were created
    const stack1FileExists = await fs.access(path.join(testWorkdir, 'output', 'current', 'stack1.js'))
      .then(() => true)
      .catch(() => false);
    
    const stack2FileExists = await fs.access(path.join(testWorkdir, 'output', 'current', 'stack2.js'))
      .then(() => true)
      .catch(() => false);
    
    t.ok(stack1FileExists, 'Stack1 output file was created');
    t.ok(stack2FileExists, 'Stack2 output file was created');
    
    if (stack1FileExists) {
      const stack1Content = await fs.readFile(path.join(testWorkdir, 'output', 'current', 'stack1.js'), 'utf8');
      t.equal(stack1Content, 'console.log("stack1")', 'Stack1 file content matches expected output');
    }
    
    if (stack2FileExists) {
      const stack2Content = await fs.readFile(path.join(testWorkdir, 'output', 'current', 'stack2.js'), 'utf8');
      t.equal(stack2Content, 'console.log("stack2")', 'Stack2 file content matches expected output');
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
  
  t.end();
});