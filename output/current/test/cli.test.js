const tape = require('tape');
const fs = require('fs').promises;
const path = require('path');
const { parseArgs, main } = require('../bin/vibec.js');

// Mock process.exit
const mockExit = jest => {
  const originalExit = process.exit;
  process.exit = jest.fn();
  return () => {
    process.exit = originalExit;
  };
};

// Mock console.log
const mockConsoleLog = jest => {
  const originalLog = console.log;
  console.log = jest.fn();
  return () => {
    console.log = originalLog;
  };
};

tape('CLI help flag', async (t) => {
  const exitMock = mockExit({ fn: () => {} });
  const logMock = mockConsoleLog({ fn: () => {} });
  
  try {
    // Test --help flag
    parseArgs(['node', 'vibec.js', '--help']);
    
    t.true(process.exit.called, 'process.exit should be called with --help flag');
    t.true(console.log.called, 'console.log should be called with --help flag');
    
    // Verify all flags are included in help output
    const helpText = console.log.mock.calls[0][0];
    t.true(helpText.includes('--stacks'), 'Help text should include --stacks option');
    t.true(helpText.includes('--api-url'), 'Help text should include --api-url option');
    t.true(helpText.includes('--api-key'), 'Help text should include --api-key option');
    t.true(helpText.includes('--api-model'), 'Help text should include --api-model option');
    t.true(helpText.includes('--test-cmd'), 'Help text should include --test-cmd option');
    t.true(helpText.includes('--retries'), 'Help text should include --retries option');
    t.true(helpText.includes('--plugin-timeout'), 'Help text should include --plugin-timeout option');
    t.true(helpText.includes('--output'), 'Help text should include --output option');
  } finally {
    exitMock();
    logMock();
  }
});

tape('CLI version flag', async (t) => {
  const exitMock = mockExit({ fn: () => {} });
  const logMock = mockConsoleLog({ fn: () => {} });
  
  try {
    // Test --version flag
    parseArgs(['node', 'vibec.js', '--version']);
    
    t.true(process.exit.called, 'process.exit should be called with --version flag');
    t.true(console.log.called, 'console.log should be called with --version flag');
    
    // Verify version format
    const versionText = console.log.mock.calls[0][0];
    t.true(/vibec v\d+\.\d+\.\d+/.test(versionText), 'Version should match format like "vibec vX.Y.Z"');
  } finally {
    exitMock();
    logMock();
  }
});

tape('CLI API URL option', async (t) => {
  // Test --api-url flag with custom URL
  const apiUrl = 'https://api.anthropic.com/v1';
  const args = ['node', 'vibec.js', `--api-url=${apiUrl}`];
  const opts = parseArgs(args);
  
  t.equal(opts.apiUrl, apiUrl, 'Should parse custom API URL correctly');
});

tape('CLI API model option', async (t) => {
  // Test --api-model flag with custom model
  const apiModel = 'claude-3.7-sonnet';
  const args = ['node', 'vibec.js', `--api-model=${apiModel}`];
  const opts = parseArgs(args);
  
  t.equal(opts.apiModel, apiModel, 'Should parse custom API model correctly');
});

tape('CLI test command option', async (t) => {
  // Test --test-cmd flag with custom command
  const testCmd = 'npm test';
  const args = ['node', 'vibec.js', `--test-cmd=${testCmd}`];
  const opts = parseArgs(args);
  
  t.equal(opts.testCmd, testCmd, 'Should parse custom test command correctly');
});

tape('CLI retries option', async (t) => {
  // Test --retries flag with valid number
  const args1 = ['node', 'vibec.js', '--retries=2'];
  const opts1 = parseArgs(args1);
  t.equal(opts1.retries, 2, 'Should parse positive retry count correctly');
  
  // Test --retries flag with negative number (should default to 0)
  const args2 = ['node', 'vibec.js', '--retries=-1'];
  const opts2 = parseArgs(args2);
  t.equal(opts2.retries, 0, 'Should set negative retry count to 0');
});

tape('CLI plugin timeout option', async (t) => {
  // Test --plugin-timeout flag with valid number
  const timeout = 6000;
  const args = ['node', 'vibec.js', `--plugin-timeout=${timeout}`];
  const opts = parseArgs(args);
  
  t.equal(opts.pluginTimeout, timeout, 'Should parse plugin timeout correctly');
});

tape('CLI output directory option', async (t) => {
  // Test --output flag with custom directory
  const outputDir = 'custom_output';
  const args = ['node', 'vibec.js', `--output=${outputDir}`];
  const opts = parseArgs(args);
  
  t.equal(opts.output, outputDir, 'Should parse custom output directory correctly');
});

tape('CLI environment variable merging', async (t) => {
  // Set an environment variable
  const originalApiUrl = process.env.VIBEC_API_URL;
  process.env.VIBEC_API_URL = 'https://env-var-api.example.com';
  
  try {
    // Parse args with CLI option that should override env var
    const cliApiUrl = 'https://cli-option-api.example.com';
    const args = ['node', 'vibec.js', `--api-url=${cliApiUrl}`];
    const opts = parseArgs(args);
    
    t.equal(opts.apiUrl, cliApiUrl, 'CLI option should override environment variable');
  } finally {
    // Restore original env var
    if (originalApiUrl === undefined) {
      delete process.env.VIBEC_API_URL;
    } else {
      process.env.VIBEC_API_URL = originalApiUrl;
    }
  }
});

tape('CLI dry run execution', async (t) => {
  // Create a test environment
  const tempDir = path.join(__dirname, 'temp-test-dry-run');
  const stacksDir = path.join(tempDir, 'stacks', 'core');
  const outputDir = path.join(tempDir, 'output');
  
  try {
    // Create directories
    await fs.mkdir(stacksDir, { recursive: true });
    
    // Create a test prompt file
    await fs.writeFile(
      path.join(stacksDir, '001_test.md'),
      '# Test Prompt\n\n## Output: test.js'
    );
    
    // Run with dry-run flag and custom API URL
    const args = [
      'node', 'vibec.js',
      '--workdir=' + tempDir,
      '--dry-run',
      '--api-url=http://localhost:3000'
    ];
    
    // Capture original console.log
    const originalLog = console.log;
    let logOutput = [];
    
    console.log = (...args) => {
      logOutput.push(args.join(' '));
    };
    
    try {
      await main(args);
      
      // Check that dry run message was logged
      const hasDryRunMessage = logOutput.some(msg => msg.includes('DRY RUN - Prompt:'));
      t.true(hasDryRunMessage, 'Should log dry run message');
      
      // Check that API URL was correctly set
      const hasApiUrlMessage = logOutput.some(msg => msg.includes('http://localhost:3000'));
      t.true(hasApiUrlMessage, 'Should use custom API URL in dry run');
      
      // Verify that no real LLM call was made
      // (This is implicit since we're not mocking the API and the test would fail if it tried to make a real call)
      t.pass('Completed dry run without making real LLM API call');
    } finally {
      console.log = originalLog;
    }
  } finally {
    // Clean up
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (err) {
      console.error('Failed to cleanup:', err);
    }
  }
});