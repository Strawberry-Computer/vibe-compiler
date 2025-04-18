import test from 'tape';
import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { log, main, parseArgs, loadPlugins } from './bin/vibec.js';

// Create a temporary directory for tests
async function createTempTestDir() {
  const tempDir = path.join(os.tmpdir(), `vibec-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

// Redirect logger during tests
function silenceLogger() {
  const originalLogger = log.logger;
  log.logger = () => {}; // Silence logs during tests
  return () => { log.logger = originalLogger; }; // Return function to restore
}

test('CLI argument parsing', async (t) => {
  // Test stacks parsing with comma-separated values
  const args1 = ['node', 'vibec.js', '--stacks=core,tests', '--dry-run'];
  const options1 = parseArgs(args1);
  t.deepEqual(options1.stacks, ['core', 'tests'], 'Should parse comma-separated stacks');
  t.equal(options1['dry-run'], true, 'Should set dry-run flag');

  // Test stacks parsing with space-separated values
  const args2 = ['node', 'vibec.js', '--stacks', 'core,tests', '--dry-run=false'];
  const options2 = parseArgs(args2);
  t.deepEqual(options2.stacks, ['core', 'tests'], 'Should parse stacks from separate argument');
  t.equal(options2['dry-run'], false, 'Should parse dry-run=false');

  // Test boolean flags
  const args3 = ['node', 'vibec.js', '--dry-run'];
  const options3 = parseArgs(args3);
  t.equal(options3['dry-run'], true, 'Should set boolean flag to true');

  // Test --help flag
  const args4 = ['node', 'vibec.js', '--help'];
  const options4 = parseArgs(args4);
  t.equal(options4.help, true, 'Should set help flag');

  // Test --version flag
  const args5 = ['node', 'vibec.js', '--version'];
  const options5 = parseArgs(args5);
  t.equal(options5.version, true, 'Should set version flag');

  // Test --api-url parsing
  const args6 = ['node', 'vibec.js', '--api-url=https://api.anthropic.com/v1'];
  const options6 = parseArgs(args6);
  t.equal(options6['api-url'], 'https://api.anthropic.com/v1', 'Should parse api-url correctly');

  // Test --api-model parsing
  const args7 = ['node', 'vibec.js', '--api-model=claude-3.7-sonnet'];
  const options7 = parseArgs(args7);
  t.equal(options7['api-model'], 'claude-3.7-sonnet', 'Should parse api-model correctly');

  // Test --test-cmd parsing
  const args8 = ['node', 'vibec.js', '--test-cmd=npm test'];
  const options8 = parseArgs(args8);
  t.equal(options8['test-cmd'], 'npm test', 'Should parse test-cmd correctly');

  // Test --retries parsing with valid value
  const args9 = ['node', 'vibec.js', '--retries=2'];
  const options9 = parseArgs(args9);
  t.equal(options9.retries, 2, 'Should parse retries correctly');

  // Test --retries validation (should be non-negative)
  t.throws(
    () => parseArgs(['node', 'vibec.js', '--retries=-1']),
    /Invalid value for retries/,
    'Should throw error for negative retries value'
  );

  // Test --plugin-timeout parsing with valid value
  const args10 = ['node', 'vibec.js', '--plugin-timeout=6000'];
  const options10 = parseArgs(args10);
  t.equal(options10['plugin-timeout'], 6000, 'Should parse plugin-timeout correctly');

  // Test --plugin-timeout validation (should be positive)
  t.throws(
    () => parseArgs(['node', 'vibec.js', '--plugin-timeout=0']),
    /Invalid value for plugin-timeout/,
    'Should throw error for non-positive plugin-timeout value'
  );

  // Test --output parsing
  const args11 = ['node', 'vibec.js', '--output=custom_output'];
  const options11 = parseArgs(args11);
  t.equal(options11.output, 'custom_output', 'Should parse output directory correctly');

  t.end();
});

test('CLI --help flag', async (t) => {
  // Capture console output
  let output = '';
  const originalConsoleLog = console.log;
  console.log = (message) => { output += message + '\n'; };

  // Create a mock process.exit to prevent test from exiting
  const originalExit = process.exit;
  process.exit = () => {};

  try {
    await main(['node', 'vibec.js', '--help']);

    // Check if help text contains all the expected flags
    t.ok(output.includes('--stacks='), 'Help should include stacks option');
    t.ok(output.includes('--api-url='), 'Help should include api-url option');
    t.ok(output.includes('--api-model='), 'Help should include api-model option');
    t.ok(output.includes('--retries='), 'Help should include retries option');
    t.ok(output.includes('--plugin-timeout='), 'Help should include plugin-timeout option');
    t.ok(output.includes('--output='), 'Help should include output option');
    t.ok(output.includes('--test-cmd='), 'Help should include test-cmd option');
  } finally {
    // Restore original functions
    console.log = originalConsoleLog;
    process.exit = originalExit;
  }

  t.end();
});

test('CLI --version flag', async (t) => {
  // Capture console output
  let output = '';
  const originalConsoleLog = console.log;
  console.log = (message) => { output += message + '\n'; };

  // Create a mock process.exit to prevent test from exiting
  const originalExit = process.exit;
  process.exit = () => {};

  try {
    await main(['node', 'vibec.js', '--version']);

    // Check if version text is in correct format
    t.ok(output.match(/vibec v\d+\.\d+\.\d+/), 'Version should be in format "vibec vX.Y.Z"');
  } finally {
    // Restore original functions
    console.log = originalConsoleLog;
    process.exit = originalExit;
  }

  t.end();
});

test('CLI environment variable integration', async (t) => {
  // Set environment variable
  const origEnv = process.env.VIBEC_API_URL;
  process.env.VIBEC_API_URL = 'https://env.variable.url';

  try {
    // Check CLI argument overrides environment variable
    const args = ['node', 'vibec.js', '--api-url=https://cli.argument.url'];
    const options = parseArgs(args);
    t.equal(options['api-url'], 'https://cli.argument.url', 'CLI argument should override environment variable');
  } finally {
    // Restore original environment
    if (origEnv === undefined) {
      delete process.env.VIBEC_API_URL;
    } else {
      process.env.VIBEC_API_URL = origEnv;
    }
  }

  t.end();
});

test('Plugin loading', async (t) => {
  const restoreLogger = silenceLogger();
  try {
    // Create temporary test directory structure
    const tempDir = await createTempTestDir();
    const stackName = 'test-stack';
    const pluginsDir = path.join(tempDir, 'stacks', stackName, 'plugins');
    
    await fs.mkdir(pluginsDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginsDir, 'test-plugin.md'),
      '# Test Plugin\n\nThis is a test plugin.'
    );

    // Load plugins from the test directory
    const pluginContent = await loadPlugins(tempDir, stackName);
    
    t.ok(
      pluginContent.includes('# Test Plugin'), 
      'Should load plugin content from .md file'
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Plugin loading test failed: ${err.message}`);
  } finally {
    restoreLogger();
    t.end();
  }
});

test('Handling non-existent plugins directory', async (t) => {
  const restoreLogger = silenceLogger();
  try {
    const tempDir = await createTempTestDir();
    // Try to load plugins from a stack that doesn't have a plugins directory
    const pluginContent = await loadPlugins(tempDir, 'nonexistent-stack');
    
    t.equal(pluginContent, '', 'Should return empty string for non-existent plugins directory');
    
    // Cleanup
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Non-existent plugins test failed: ${err.message}`);
  } finally {
    restoreLogger();
    t.end();
  }
});

test('Dry-run mode with mock server verification', async (t) => {
  const messages = [];
  const originalLogger = log.logger;
  log.logger = (msg) => messages.push(msg);
  let server;
  let serverHit = false;
  
  try {
    // Create temporary test directory
    const tempDir = await createTempTestDir();
    const stackDir = path.join(tempDir, 'stacks', 'core');
    
    await fs.mkdir(stackDir, { recursive: true });
    await fs.writeFile(
      path.join(stackDir, '01_test.md'),
      '# Test Prompt\n\n## Output: test.js'
    );
    
    // Start a mock API server to verify it's NOT called in dry-run mode
    server = http.createServer((req, res) => {
      // If server is hit, mark the flag
      serverHit = true;
      
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        choices: [
          {
            message: { 
              content: 'File: test.js\n```js\nconsole.log("This should not be written");\n```'
            }
          }
        ]
      }));
    });
    
    // Start server
    await new Promise(resolve => {
      server.listen(3000, 'localhost', resolve);
    });
    
    // Run in dry-run mode with API URL pointing to our mock server
    await main([
      'node', 'vibec.js',
      `--workdir=${tempDir}`,
      '--dry-run',
      '--api-url=http://localhost:3000',
      '--api-key=not-needed-for-dry-run'
    ]);
    
    // Verify dry-run message was logged
    t.ok(
      messages.some(msg => msg.includes('Dry run mode: Skipping LLM API call')),
      'Should log dry run message'
    );
    
    // Verify server was NOT hit
    t.equal(serverHit, false, 'Server should not be hit in dry-run mode');
    
    // Verify no files were written
    const outputFile = path.join(tempDir, 'output', 'current', 'test.js');
    const fileExists = await fs.access(outputFile)
      .then(() => true)
      .catch(() => false);
    
    t.equal(fileExists, true, 'Output file should exist even in dry-run mode');
    
    if (fileExists) {
      // In dry-run mode, the file should contain mock content, not real response
      const content = await fs.readFile(outputFile, 'utf-8');
      t.equal(content.includes('This should not be written'), false, 
              'Output file should not contain real response data');
    }
    
    // Clean up
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Dry run test failed: ${err.message}`);
  } finally {
    if (server) {
      server.close();
    }
    log.logger = originalLogger;
    t.end();
  }
});

test('Full plugin integration with mock API server', async (t) => {
  const restoreLogger = silenceLogger();
  let server;
  
  try {
    // Create temporary test directory with stack structure
    const tempDir = await createTempTestDir();
    const stackName = 'test-stack';
    const stackDir = path.join(tempDir, 'stacks', stackName);
    const pluginsDir = path.join(stackDir, 'plugins');
    
    // Create the necessary directories
    await fs.mkdir(pluginsDir, { recursive: true });
    
    // Create a test prompt file
    await fs.writeFile(
      path.join(stackDir, '01_test.md'),
      '# Test Prompt\n\n## Output: test.js'
    );
    
    // Create a test plugin file
    await fs.writeFile(
      path.join(pluginsDir, 'test-plugin.md'),
      '# Plugin Content\n\nThis should be included in the prompt.'
    );
    
    // Start a mock API server
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        
        req.on('end', () => {
          // Verify the plugin content was included in the request
          const requestIncludesPlugin = body.includes('Plugin Content');
          
          // Send mock response
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: 'File: test.js\n```js\nconsole.log("mock");\n// Plugin included: ' + requestIncludesPlugin + '\n```'
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
    
    // Start the server on port 3000
    await new Promise(resolve => {
      server.listen(3000, 'localhost', resolve);
    });
    
    // Run vibec with the test stack
    await main([
      'node', 'vibec.js',
      `--workdir=${tempDir}`,
      `--stacks=${stackName}`,
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--dry-run=false'
    ]);
    
    // Verify the output file was created
    const outputDir = path.join(tempDir, 'output', 'current');
    const outputFile = path.join(outputDir, 'test.js');
    
    const fileExists = await fs.access(outputFile)
      .then(() => true)
      .catch(() => false);
    
    t.ok(fileExists, 'Output file should exist');
    
    if (fileExists) {
      const content = await fs.readFile(outputFile, 'utf-8');
      t.ok(content.includes('console.log("mock")'), 'Output file should contain expected content');
      t.ok(content.includes('Plugin included: true'), 'Plugin should have been included in the request');
    }
    
    // Clean up
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Plugin integration test failed: ${err.message}`);
  } finally {
    if (server) {
      server.close();
    }
    restoreLogger();
    t.end();
  }
});

test('Dry run mode', async (t) => {
  const messages = [];
  const originalLogger = log.logger;
  log.logger = (msg) => messages.push(msg);
  
  try {
    // Create temporary test directory
    const tempDir = await createTempTestDir();
    const stackDir = path.join(tempDir, 'stacks', 'core');
    
    await fs.mkdir(stackDir, { recursive: true });
    await fs.writeFile(
      path.join(stackDir, '01_test.md'),
      '# Test Prompt\n\n## Output: test.js'
    );
    
    // Run in dry-run mode
    await main([
      'node', 'vibec.js',
      `--workdir=${tempDir}`,
      '--dry-run'
    ]);
    
    // Check that the appropriate dry-run message was logged
    const dryRunMessageLogged = messages.some(msg => 
      msg.includes('Dry run mode: Skipping LLM API call'));
    
    t.ok(dryRunMessageLogged, 'Should log dry run message');
    
    // Clean up
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Dry run test failed: ${err.message}`);
  } finally {
    log.logger = originalLogger;
    t.end();
  }
});

test('Multiple stacks processing', async (t) => {
  const restoreLogger = silenceLogger();
  let server;
  
  try {
    // Create temporary test directory with multiple stacks
    const tempDir = await createTempTestDir();
    const stack1Dir = path.join(tempDir, 'stacks', 'stack1');
    const stack2Dir = path.join(tempDir, 'stacks', 'stack2');
    
    await fs.mkdir(stack1Dir, { recursive: true });
    await fs.mkdir(stack2Dir, { recursive: true });
    
    // Create test prompt files in each stack
    await fs.writeFile(
      path.join(stack1Dir, '01_test1.md'),
      '# Test Prompt 1\n\n## Output: test1.js'
    );
    
    await fs.writeFile(
      path.join(stack2Dir, '02_test2.md'),
      '# Test Prompt 2\n\n## Output: test2.js'
    );
    
    // Start a mock API server
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        
        req.on('end', () => {
          // Determine which prompt is being processed
          let response;
          if (body.includes('Test Prompt 1')) {
            response = 'File: test1.js\n```js\nconsole.log("stack1");\n```';
          } else {
            response = 'File: test2.js\n```js\nconsole.log("stack2");\n```';
          }
          
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: response
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
    
    // Start the server
    await new Promise(resolve => {
      server.listen(3000, 'localhost', resolve);
    });
    
    // Run vibec with both stacks
    await main([
      'node', 'vibec.js',
      `--workdir=${tempDir}`,
      '--stacks=stack1,stack2',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--dry-run=false'
    ]);
    
    // Verify the output files were created
    const outputDir = path.join(tempDir, 'output', 'current');
    const file1Exists = await fs.access(path.join(outputDir, 'test1.js'))
      .then(() => true)
      .catch(() => false);
    
    const file2Exists = await fs.access(path.join(outputDir, 'test2.js'))
      .then(() => true)
      .catch(() => false);
    
    t.ok(file1Exists, 'Output file from stack1 should exist');
    t.ok(file2Exists, 'Output file from stack2 should exist');
    
    if (file1Exists && file2Exists) {
      const content1 = await fs.readFile(path.join(outputDir, 'test1.js'), 'utf-8');
      const content2 = await fs.readFile(path.join(outputDir, 'test2.js'), 'utf-8');
      
      t.equal(content1, 'console.log("stack1");', 'Content from stack1 should match');
      t.equal(content2, 'console.log("stack2");', 'Content from stack2 should match');
    }
    
    // Clean up
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Multiple stacks test failed: ${err.message}`);
  } finally {
    if (server) {
      server.close();
    }
    restoreLogger();
    t.end();
  }
});

// Test using start and end parameters
test('Start and end parameters', async (t) => {
  const restoreLogger = silenceLogger();
  let server;
  
  try {
    // Create temporary test directory
    const tempDir = await createTempTestDir();
    const stackDir = path.join(tempDir, 'stacks', 'core');
    
    await fs.mkdir(stackDir, { recursive: true });
    
    // Create test prompt files with different numbers
    await fs.writeFile(
      path.join(stackDir, '01_first.md'),
      '# First Prompt\n\n## Output: first.js'
    );
    
    await fs.writeFile(
      path.join(stackDir, '02_second.md'),
      '# Second Prompt\n\n## Output: second.js'
    );
    
    await fs.writeFile(
      path.join(stackDir, '03_third.md'),
      '# Third Prompt\n\n## Output: third.js'
    );
    
    // Start a mock API server
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        
        req.on('end', () => {
          let response;
          if (body.includes('First Prompt')) {
            response = 'File: first.js\n```js\nconsole.log("first");\n```';
          } else if (body.includes('Second Prompt')) {
            response = 'File: second.js\n```js\nconsole.log("second");\n```';
          } else {
            response = 'File: third.js\n```js\nconsole.log("third");\n```';
          }
          
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            choices: [
              {
                message: {
                  content: response
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
    
    // Start the server
    await new Promise(resolve => {
      server.listen(3000, 'localhost', resolve);
    });
    
    // Run vibec with start=2 and end=2 (only process second.md)
    await main([
      'node', 'vibec.js',
      `--workdir=${tempDir}`,
      '--start=2',
      '--end=2',
      '--api-url=http://localhost:3000',
      '--api-key=test-key',
      '--dry-run=false'
    ]);
    
    // Verify only the second file was processed
    const outputDir = path.join(tempDir, 'output', 'current');
    
    const file1Exists = await fs.access(path.join(outputDir, 'first.js'))
      .then(() => true)
      .catch(() => false);
    
    const file2Exists = await fs.access(path.join(outputDir, 'second.js'))
      .then(() => true)
      .catch(() => false);
    
    const file3Exists = await fs.access(path.join(outputDir, 'third.js'))
      .then(() => true)
      .catch(() => false);
    
    t.notOk(file1Exists, 'First file should not exist (filtered out by start=2)');
    t.ok(file2Exists, 'Second file should exist');
    t.notOk(file3Exists, 'Third file should not exist (filtered out by end=2)');
    
    // Clean up
    await fs.rm(tempDir, { recursive: true });
  } catch (err) {
    t.fail(`Start/end parameter test failed: ${err.message}`);
  } finally {
    if (server) {
      server.close();
    }
    restoreLogger();
    t.end();
  }
});