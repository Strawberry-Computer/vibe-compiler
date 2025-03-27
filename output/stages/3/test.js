const test = require('tape');
const sinon = require('sinon');
const { parseArgs, showHelp, showVersion, main } = require('../bin/vibec');

test('CLI Help Flag', async (t) => {
  // Mock console.log and process.exit
  const logSpy = sinon.spy(console, 'log');
  const exitStub = sinon.stub(process, 'exit');
  
  try {
    // Set up command line args with --help
    const args = ['node', 'bin/vibec.js', '--help'];
    await main(args);
    
    // Check that usage text was printed with expected flags
    t.ok(logSpy.calledWithMatch(/Usage: vibec/), 'Help text includes usage information');
    t.ok(logSpy.calledWithMatch(/--stacks=/), 'Help text includes stacks option');
    t.ok(logSpy.calledWithMatch(/--api-url=/), 'Help text includes api-url option');
    t.ok(logSpy.calledWithMatch(/--retries=/), 'Help text includes retries option');
    t.ok(logSpy.calledWithMatch(/--plugin-timeout=/), 'Help text includes plugin-timeout option');
    t.ok(logSpy.calledWithMatch(/--output=/), 'Help text includes output option');
  } finally {
    logSpy.restore();
    exitStub.restore();
  }
  
  t.end();
});

test('CLI Version Flag', async (t) => {
  // Mock console.log and process.exit
  const logSpy = sinon.spy(console, 'log');
  const exitStub = sinon.stub(process, 'exit');
  
  try {
    // Set up command line args with --version
    const args = ['node', 'bin/vibec.js', '--version'];
    await main(args);
    
    // Check that version was printed
    t.ok(logSpy.calledWithMatch(/vibec v\d+\.\d+\.\d+/), 'Version text is displayed correctly');
  } finally {
    logSpy.restore();
    exitStub.restore();
  }
  
  t.end();
});

test('CLI Parsing: API URL option', (t) => {
  const defaultUrl = 'https://openrouter.ai/api/v1';
  const customUrl = 'https://api.anthropic.com/v1';
  
  // Test default value
  let options = parseArgs(['node', 'bin/vibec.js']);
  t.equal(options.apiUrl, defaultUrl, 'Default API URL is set correctly');
  
  // Test --api-url=value syntax
  options = parseArgs(['node', 'bin/vibec.js', `--api-url=${customUrl}`]);
  t.equal(options.apiUrl, customUrl, 'API URL is parsed correctly with --flag=value syntax');
  
  // Test --api-url value syntax
  options = parseArgs(['node', 'bin/vibec.js', '--api-url', customUrl]);
  t.equal(options.apiUrl, customUrl, 'API URL is parsed correctly with --flag value syntax');
  
  t.end();
});

test('CLI Parsing: API Model option', (t) => {
  const defaultModel = 'anthropic/claude-3.7-sonnet';
  const customModel = 'gpt-4';
  
  // Test default value
  let options = parseArgs(['node', 'bin/vibec.js']);
  t.equal(options.apiModel, defaultModel, 'Default API model is set correctly');
  
  // Test --api-model=value syntax
  options = parseArgs(['node', 'bin/vibec.js', `--api-model=${customModel}`]);
  t.equal(options.apiModel, customModel, 'API model is parsed correctly with --flag=value syntax');
  
  // Test --api-model value syntax
  options = parseArgs(['node', 'bin/vibec.js', '--api-model', customModel]);
  t.equal(options.apiModel, customModel, 'API model is parsed correctly with --flag value syntax');
  
  t.end();
});

test('CLI Parsing: Test Command option', (t) => {
  const defaultCmd = null;
  const customCmd = 'npm test';
  
  // Test default value
  let options = parseArgs(['node', 'bin/vibec.js']);
  t.equal(options.testCmd, defaultCmd, 'Default test command is null');
  
  // Test --test-cmd=value syntax
  options = parseArgs(['node', 'bin/vibec.js', `--test-cmd=${customCmd}`]);
  t.equal(options.testCmd, customCmd, 'Test command is parsed correctly with --flag=value syntax');
  
  // Test --test-cmd value syntax
  options = parseArgs(['node', 'bin/vibec.js', '--test-cmd', customCmd]);
  t.equal(options.testCmd, customCmd, 'Test command is parsed correctly with --flag value syntax');
  
  t.end();
});

test('CLI Parsing: Retries option validation', (t) => {
  const defaultRetries = 0;
  const customRetries = 2;
  
  // Test default value
  let options = parseArgs(['node', 'bin/vibec.js']);
  t.equal(options.retries, defaultRetries, 'Default retries is set to 0');
  
  // Test valid value
  options = parseArgs(['node', 'bin/vibec.js', `--retries=${customRetries}`]);
  t.equal(options.retries, customRetries, 'Retries is parsed correctly with positive integer');
  
  // Test negative value - this would exit the process in real usage but we're just checking the parsing
  const exitStub = sinon.stub(process, 'exit');
  const consoleSpy = sinon.spy(console, 'log');
  
  try {
    parseArgs(['node', 'bin/vibec.js', '--retries=-1']);
    t.ok(exitStub.called, 'Process exit called for negative retries');
    t.ok(consoleSpy.calledWithMatch(/non-negative integer/), 'Error message shown for negative retries');
  } finally {
    exitStub.restore();
    consoleSpy.restore();
  }
  
  t.end();
});

test('CLI Parsing: Plugin timeout option', (t) => {
  const defaultTimeout = 5000;
  const customTimeout = 6000;
  
  // Test default value
  let options = parseArgs(['node', 'bin/vibec.js']);
  t.equal(options.pluginTimeout, defaultTimeout, 'Default plugin timeout is set correctly');
  
  // Test --plugin-timeout=value syntax
  options = parseArgs(['node', 'bin/vibec.js', `--plugin-timeout=${customTimeout}`]);
  t.equal(options.pluginTimeout, customTimeout, 'Plugin timeout is parsed correctly with --flag=value syntax');
  
  // Test --plugin-timeout value syntax
  options = parseArgs(['node', 'bin/vibec.js', '--plugin-timeout', customTimeout]);
  t.equal(options.pluginTimeout, customTimeout, 'Plugin timeout is parsed correctly with --flag value syntax');
  
  t.end();
});

test('CLI Parsing: Output directory option', (t) => {
  const defaultOutput = 'output';
  const customOutput = 'custom_output';
  
  // Test default value
  let options = parseArgs(['node', 'bin/vibec.js']);
  t.equal(options.output, defaultOutput, 'Default output directory is set correctly');
  
  // Test --output=value syntax
  options = parseArgs(['node', 'bin/vibec.js', `--output=${customOutput}`]);
  t.equal(options.output, customOutput, 'Output directory is parsed correctly with --flag=value syntax');
  
  // Test --output value syntax
  options = parseArgs(['node', 'bin/vibec.js', '--output', customOutput]);
  t.equal(options.output, customOutput, 'Output directory is parsed correctly with --flag value syntax');
  
  t.end();
});

test('CLI Parsing: Environment variable overrides', (t) => {
  const envApiUrl = 'https://env-api-url.com';
  const cliApiUrl = 'https://cli-api-url.com';
  
  // Save original env
  const originalEnv = process.env.VIBEC_API_URL;
  
  try {
    // Set environment variable
    process.env.VIBEC_API_URL = envApiUrl;
    
    // Env var should take precedence over default
    options = parseArgs(['node', 'bin/vibec.js']);
    t.equal(options.apiUrl, envApiUrl, 'Environment variable overrides default value');
    
    // CLI arg should override env var
    options = parseArgs(['node', 'bin/vibec.js', `--api-url=${cliApiUrl}`]);
    t.equal(options.apiUrl, cliApiUrl, 'CLI argument overrides environment variable');
  } finally {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.VIBEC_API_URL;
    } else {
      process.env.VIBEC_API_URL = originalEnv;
    }
  }
  
  t.end();
});

test('Dry Run Execution', async (t) => {
  const processSpy = sinon.spy(console, 'log');
  
  try {
    // Run dry run mode with custom API URL
    await main(['node', 'bin/vibec.js', '--dry-run', '--api-url=http://localhost:3000']);
    
    // Verify no real LLM calls are made, but it outputs mock response
    t.ok(processSpy.calledWithMatch(/DRY RUN/), 'Logs a dry run message');
    t.ok(processSpy.calledWithMatch(/Would send the following prompt/), 'Shows what would be sent');
  } finally {
    processSpy.restore();
  }
  
  t.end();
});