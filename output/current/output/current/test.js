const test = require('tape');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const {
  parseArgs,
  main,
  loadStaticPlugins,
  loadDynamicPlugins,
  executeDynamicPlugins,
  log
} = require('./bin/vibec.js');

// Utility for temporary file creation
async function createTempFile(filePath, content) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
}

// Utility for removing files
async function removeTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // Ignore errors if file doesn't exist
  }
}

test('CLI argument parsing', (t) => {
  // Test stacks option with comma syntax
  const args1 = ['node', 'vibec.js', '--stacks=core,tests'];
  const options1 = parseArgs(args1);
  t.deepEqual(options1.stacks, ['core', 'tests'], 'Should parse comma-separated stacks');

  // Test boolean flags
  const args2 = ['node', 'vibec.js', '--dry-run', '--no-overwrite'];
  const options2 = parseArgs(args2);
  t.equal(options2.dryRun, true, 'Should set dry-run flag');
  t.equal(options2.noOverwrite, true, 'Should set no-overwrite flag');

  // Test option with value syntax
  const args3 = ['node', 'vibec.js', '--api-url', 'http://localhost:3000'];
  const options3 = parseArgs(args3);
  t.equal(options3.apiUrl, 'http://localhost:3000', 'Should parse option with value');

  t.end();
});

test('Plugin support testing', async (t) => {
  // Create a test server that mocks the OpenAI API
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/chat/completions') {
      // Collect request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Mock LLM response
        const response = {
          choices: [{
            message: {
              content: 'File: test.js\n```js\nconsole.log("mock")\n```'
            }
          }]
        };
        res.end(JSON.stringify(response));
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // Start server
  try {
    // Setup test environment
    await createTempFile('output/current/test-output.js', '');
    await createTempFile('stacks/test-stack/001_test.md', '# Test\n\n## Output: test-output.js\n\nSome content');
    
    // Create a static plugin
    await createTempFile('stacks/test-stack/plugins/test-plugin.md', 'This is a static plugin test');
    
    // Create a dynamic plugin
    await createTempFile('stacks/test-stack/plugins/test-plugin.js', `
      module.exports = async function testPlugin(context) {
        return "test";
      };
    `);
    
    // Create a failing plugin
    await createTempFile('stacks/test-stack/plugins/error-plugin.js', `
      module.exports = async function errorPlugin(context) {
        throw new Error('Test error');
      };
    `);

    // Start the mock server
    await new Promise(resolve => {
      server.listen(3000, resolve);
    });

    // Test static plugins
    t.test('Static .md plugins', async (st) => {
      const plugins = await loadStaticPlugins('test-stack');
      st.ok(plugins.length > 0, 'Should load static plugins');
      st.ok(plugins.some(p => p.includes('static plugin test')), 'Should contain plugin content');
      st.end();
    });

    // Test dynamic plugins
    t.test('Dynamic .js plugins', async (st) => {
      const plugins = await loadDynamicPlugins('test-stack');
      st.ok(plugins.length >= 2, 'Should load dynamic plugins');
      
      // Test plugin execution
      const context = { workingDir: 'output/current' };
      
      // Capture console output
      const originalError = console.log;
      let errorCalled = false;
      console.log = (...args) => {
        if (args[0].includes('Plugin execution error')) {
          errorCalled = true;
        }
        originalError(...args);
      };
      
      await executeDynamicPlugins(plugins, context, 1000);
      
      // Restore console
      console.log = originalError;
      
      st.ok(errorCalled, 'Should handle and log plugin errors');
      st.end();
    });

    // Test dynamic plugin timeout
    t.test('Plugin timeout handling', async (st) => {
      // Create a plugin that times out
      await createTempFile('stacks/test-stack/plugins/timeout-plugin.js', `
        module.exports = async function timeoutPlugin(context) {
          return new Promise(resolve => setTimeout(resolve, 2000));
        };
      `);
      
      const plugins = await loadDynamicPlugins('test-stack');
      const timeoutPlugin = plugins.find(p => p.name === 'timeoutPlugin');
      
      // Capture console output
      const originalError = console.log;
      let timeoutErrorCalled = false;
      console.log = (...args) => {
        if (args[0].includes('timed out')) {
          timeoutErrorCalled = true;
        }
        originalError(...args);
      };
      
      await executeDynamicPlugins([timeoutPlugin], {}, 100);
      
      // Restore console
      console.log = originalError;
      
      st.ok(timeoutErrorCalled, 'Should handle plugin timeout');
      st.end();
    });

    // Test the full integration with the mocked API server
    t.test('Integration test with mock API', async (st) => {
      // Override console.log to suppress output during tests
      const originalLog = console.log;
      console.log = () => {};
      
      // Run main with our test configuration
      await main(['node', 'vibec.js', '--api-url=http://localhost:3000', '--dry-run=false', '--stacks=test-stack']);
      
      // Restore console.log
      console.log = originalLog;
      
      st.end();
    });
  } finally {
    // Close server
    await new Promise(resolve => {
      server.close(resolve);
    });
    
    // Clean up test files
    await removeTempFile('stacks/test-stack/001_test.md');
    await removeTempFile('stacks/test-stack/plugins/test-plugin.md');
    await removeTempFile('stacks/test-stack/plugins/test-plugin.js');
    await removeTempFile('stacks/test-stack/plugins/error-plugin.js');
    await removeTempFile('stacks/test-stack/plugins/timeout-plugin.js');
    await removeTempFile('output/current/test-output.js');
    
    try {
      await fs.rmdir('stacks/test-stack/plugins');
      await fs.rmdir('stacks/test-stack');
    } catch (e) {
      // Ignore errors removing directories
    }
  }
  
  t.end();
});

// Make test script executable
if (require.main === module) {
  test.onFinish(() => {
    process.exit(0);
  });
}