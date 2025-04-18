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