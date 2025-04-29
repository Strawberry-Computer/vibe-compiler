#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Configuration
const BASE_PATH = 'output/stacks';
const REPORT_FILE = 'stage-comparison-report.html';

// Utility functions
const formatStageName = (stage) => {
  if (stage === 'current') return 'Current';
  const num = stage.substring(0, 3);
  const desc = stage.substring(4)
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return `Stage ${num}: ${desc}`;
};

const generateAnchorId = (stage) => `stage-${stage.replace(/ /g, '_')}`;

const generateTocEntry = (stage) => {
  const formattedName = formatStageName(stage);
  const anchorId = generateAnchorId(stage);
  return `<li><a href="#${anchorId}">${formattedName}</a></li>`;
};

const findPromptFiles = async (stage) => {
  if (stage === 'current') return [];
  
  const promptFiles = [];
  const stacksDir = path.join(process.cwd(), 'stacks');
  
  try {
    const files = await readdir(stacksDir);
    for (const file of files) {
      if (file.startsWith(stage) && file.endsWith('.md')) {
        promptFiles.push(path.join(stacksDir, file));
      }
    }
  } catch (err) {
    console.error('Error reading stacks directory:', err);
  }
  
  return promptFiles.sort();
};

const formatPromptContent = async (file) => {
  const content = await readFile(file, 'utf8');
  const relativePath = path.relative(process.cwd(), file);
  const escapedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return `
    <div class="prompt-container">
      <div class="prompt-file">File: ${relativePath}</div>
      <div class="prompt-header">Prompt:</div>
      <div class="prompt-content">${escapedContent}</div>
    </div>
  `;
};

const validateStage = (stage) => {
  if (stage === 'current') {
    const currentPath = path.join(BASE_PATH, '..', 'current');
    if (!fs.existsSync(currentPath)) {
      throw new Error('output/current directory not found');
    }
    return currentPath;
  }

  if (!/^[0-9]{3}_/.test(stage)) {
    throw new Error(`Stage must be in format 'XXX_description' (e.g., 001_add_logging) or 'current'`);
  }

  for (const dir of ['core', 'tests']) {
    const stagePath = path.join(BASE_PATH, dir, stage);
    if (fs.existsSync(stagePath)) {
      return stagePath;
    }
  }

  throw new Error(`Stage directory ${stage} not found in ${BASE_PATH}/core/ or ${BASE_PATH}/tests/`);
};

const getAllStages = async () => {
  const stages = new Set();
  
  for (const dir of ['core', 'tests']) {
    const dirPath = path.join(BASE_PATH, dir);
    if (!fs.existsSync(dirPath)) continue;
    
    const files = await readdir(dirPath);
    for (const file of files) {
      if (/^[0-9]{3}_/.test(file)) {
        stages.add(file);
      }
    }
  }
  
  const sortedStages = Array.from(stages).sort();
  if (fs.existsSync(path.join(BASE_PATH, '..', 'current'))) {
    sortedStages.push('current');
  }
  
  return sortedStages;
};

const generateFileDiff = (previousFile, currentFile) => {
  try {
    const diff = execSync(`diff -u "${previousFile}" "${currentFile}"`, { encoding: 'utf8' });
    return diff.split('\n').slice(3).map(line => {
      if (line.startsWith('-')) {
        return `<span class="diff-removed">${line}</span>`;
      } else if (line.startsWith('+')) {
        return `<span class="diff-added">${line}</span>`;
      }
      return line;
    }).join('\n');
  } catch (err) {
    return 'Error generating diff';
  }
};

const generateReport = async () => {
  const stages = await getAllStages();
  if (stages.length === 0) {
    throw new Error('No stages found in output/stacks/core/ or output/stacks/tests/');
  }

  console.log(`Found ${stages.length} stages to process: ${stages.join(', ')}`);

  // Generate HTML header
  const htmlHeader = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vibe Compiler Stages Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 { color: #2c3e50; border-bottom: 2px solid #eaecef; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; border-bottom: 1px solid #eaecef; padding-bottom: 7px; }
    h3 { color: #3498db; margin-top: 25px; }
    pre {
      background-color: #f6f8fa;
      border-radius: 5px;
      padding: 15px;
      overflow: auto;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 14px;
    }
    code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
    .diff-added { color: #22863a; background-color: #f0fff4; }
    .diff-removed { color: #cb2431; background-color: #ffeef0; }
    .summary {
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      border-left: 4px solid #3498db;
      margin-bottom: 20px;
    }
    ul { padding-left: 25px; }
    .hr { border: 0; height: 1px; background-color: #eaecef; margin: 20px 0; }
    .timestamp { color: #6a737d; font-style: italic; margin-bottom: 20px; }
    .prompt-container {
      background-color: #f1f8ff;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 25px;
      border-left: 4px solid #0366d6;
    }
    .toc {
      background-color: #f8f9fa;
      border-radius: 5px;
      padding: 15px 25px;
      margin-bottom: 30px;
      border-left: 4px solid #2c3e50;
    }
    .stage-navigation {
      display: flex;
      justify-content: space-between;
      margin: 20px 0;
      padding: 10px 0;
      border-top: 1px solid #eaecef;
      border-bottom: 1px solid #eaecef;
    }
    .stage-navigation a {
      text-decoration: none;
      color: #0366d6;
      padding: 5px 10px;
      border-radius: 3px;
    }
    .stage-navigation a:hover { background-color: #f1f8ff; }
    .back-to-top {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #2c3e50;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      text-decoration: none;
      opacity: 0.7;
    }
    .back-to-top:hover { opacity: 1; }
    .stage-header {
      background-color: #f0f7ff;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .prompt-header { font-weight: bold; color: #0366d6; margin-bottom: 10px; }
    .prompt-content { white-space: pre-wrap; font-size: 14px; line-height: 1.5; }
    .prompt-file { font-style: italic; color: #586069; margin-bottom: 5px; }
  </style>
</head>
<body>
  <h1>Vibe Compiler Stages Report</h1>
  <div class="timestamp">Report generated on: ${new Date().toLocaleString()}</div>
  <a href="#" class="back-to-top">Back to Top</a>
  
  <h2>Table of Contents</h2>
  <div class="toc">
    <ol>
      ${stages.map(stage => generateTocEntry(stage)).join('\n')}
    </ol>
  </div>
`;

  let reportContent = htmlHeader;

  // Process each stage
  for (let i = 0; i < stages.length; i++) {
    const currentStage = stages[i];
    const currentPath = validateStage(currentStage);
    const stageName = formatStageName(currentStage);
    const stageAnchor = generateAnchorId(currentStage);

    if (i === 0) {
      // First stage
      reportContent += `
  <h2 id="${stageAnchor}">${stageName}</h2>
  <div class="stage-header">
    <p>This is the first stage in the sequence.</p>
  </div>
  
  <div class="stage-navigation">
    <span></span>
    ${i < stages.length - 1 ? `<a href="#${generateAnchorId(stages[i + 1])}">Next: ${formatStageName(stages[i + 1])} →</a>` : ''}
  </div>`;

      const promptFiles = await findPromptFiles(currentStage);
      if (promptFiles.length > 0) {
        reportContent += '\n  <h3>Prompts</h3>';
        for (const promptFile of promptFiles) {
          reportContent += await formatPromptContent(promptFile);
        }
      }

      const files = await readdir(currentPath);
      reportContent += `
  <h3>Initial Files</h3>
  <p>This stage contains ${files.length} files.</p>
  <details>
    <summary>View file list</summary>
    <ul>
      ${files.map(file => `<li>${file}</li>`).join('\n')}
    </ul>
  </details>`;
    } else {
      // Subsequent stages
      const previousStage = stages[i - 1];
      const previousPath = validateStage(previousStage);
      const previousAnchor = generateAnchorId(previousStage);
      const previousName = formatStageName(previousStage);

      reportContent += `
  <h2 id="${stageAnchor}">${stageName}</h2>
  <div class="stage-header">
    <p>Changes from ${previousName} to ${stageName}</p>
  </div>
  
  <div class="stage-navigation">
    <a href="#${previousAnchor}">← Previous: ${previousName}</a>
    ${i < stages.length - 1 ? `<a href="#${generateAnchorId(stages[i + 1])}">Next: ${formatStageName(stages[i + 1])} →</a>` : '<span></span>'}
  </div>`;

      const promptFiles = await findPromptFiles(currentStage);
      if (promptFiles.length > 0) {
        reportContent += '\n  <h3>Prompts</h3>';
        for (const promptFile of promptFiles) {
          reportContent += await formatPromptContent(promptFile);
        }
      }

      const currentFiles = new Set(await readdir(currentPath));
      const previousFiles = new Set(await readdir(previousPath));

      // Added files
      const addedFiles = [...currentFiles].filter(file => !previousFiles.has(file));
      reportContent += `
  <h3>Added Files</h3>
  ${addedFiles.length > 0 ? `
  <p>${addedFiles.length} new files were added in this stage.</p>
  <details>
    <summary>View added files</summary>
    <ul>
      ${addedFiles.map(file => `<li>${file}</li>`).join('\n')}
    </ul>
    <details>
      <summary>View file contents</summary>
      ${await Promise.all(addedFiles.map(async file => {
        const content = await readFile(path.join(currentPath, file), 'utf8');
        return `
      <h4>${file}</h4>
      <pre class="diff-added">
${content.split('\n').map(line => `+ ${line}`).join('\n')}
      </pre>`;
      })).then(results => results.join('\n'))}
    </details>
  </details>` : '<p>No files were added in this stage.</p>'}

  <h3>Removed Files</h3>
  ${[...previousFiles].filter(file => !currentFiles.has(file)).length > 0 ? `
  <p>${[...previousFiles].filter(file => !currentFiles.has(file)).length} files were removed in this stage.</p>
  <details>
    <summary>View removed files</summary>
    <ul>
      ${[...previousFiles].filter(file => !currentFiles.has(file)).map(file => `<li>${file}</li>`).join('\n')}
    </ul>
    <details>
      <summary>View removed content</summary>
      ${await Promise.all([...previousFiles].filter(file => !currentFiles.has(file)).map(async file => {
        const content = await readFile(path.join(previousPath, file), 'utf8');
        return `
      <h4>${file}</h4>
      <pre class="diff-removed">
${content.split('\n').map(line => `- ${line}`).join('\n')}
      </pre>`;
      })).then(results => results.join('\n'))}
    </details>
  </details>` : '<p>No files were removed in this stage.</p>'}

  <h3>Modified Files</h3>
  ${[...currentFiles].filter(file => previousFiles.has(file)).length > 0 ? `
  <p>${[...currentFiles].filter(file => previousFiles.has(file)).length} files were modified in this stage.</p>
  <details>
    <summary>View modified files</summary>
    <ul>
      ${[...currentFiles].filter(file => previousFiles.has(file)).map(file => `<li>${file}</li>`).join('\n')}
    </ul>
    <details>
      <summary>View changes</summary>
      ${await Promise.all([...currentFiles].filter(file => previousFiles.has(file)).map(async file => {
        const diff = generateFileDiff(
          path.join(previousPath, file),
          path.join(currentPath, file)
        );
        return `
      <h4>${file}</h4>
      <pre>
${diff}
      </pre>`;
      })).then(results => results.join('\n'))}
    </details>
  </details>` : '<p>No files were modified in this stage.</p>'}

  <div class="summary">
    <h3>Stage Summary</h3>
    <ul>
      <li>Added files: ${addedFiles.length}</li>
      <li>Removed files: ${[...previousFiles].filter(file => !currentFiles.has(file)).length}</li>
      <li>Modified files: ${[...currentFiles].filter(file => previousFiles.has(file)).length}</li>
      <li>Total changes: ${addedFiles.length + [...previousFiles].filter(file => !currentFiles.has(file)).length + [...currentFiles].filter(file => previousFiles.has(file)).length}</li>
    </ul>
  </div>
  <hr class="hr">`;
    }
  }

  // Complete the HTML document
  reportContent += `
</body>
</html>`;

  // Write the report
  await fs.promises.writeFile(REPORT_FILE, reportContent);
  console.log(`Report generated: ${REPORT_FILE}`);
  console.log('All stages processed successfully');
};

// Run the script
generateReport().catch(err => {
  console.error('Error generating report:', err);
  process.exit(1);
}); 