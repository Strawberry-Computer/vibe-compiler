#!/usr/bin/env node

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const files = await fs.readdir(stacksDir);
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
  const content = await fs.readFile(file, 'utf8');
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
    if (!existsSync(currentPath)) {
      throw new Error('output/current directory not found');
    }
    return currentPath;
  }

  if (!/^[0-9]{3}_/.test(stage)) {
    throw new Error(`Stage must be in format 'XXX_description' (e.g., 001_add_logging) or 'current'`);
  }

  for (const dir of ['core', 'tests']) {
    const stagePath = path.join(BASE_PATH, dir, stage);
    if (existsSync(stagePath)) {
      return stagePath;
    }
  }

  throw new Error(`Stage directory ${stage} not found in ${BASE_PATH}/core/ or ${BASE_PATH}/tests/`);
};

const getAllStages = async () => {
  const stages = new Set();
  
  for (const dir of ['core', 'tests']) {
    const dirPath = path.join(BASE_PATH, dir);
    if (!existsSync(dirPath)) continue;
    
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      if (/^[0-9]{3}_/.test(file)) {
        stages.add(file);
      }
    }
  }
  
  const sortedStages = Array.from(stages).sort();
  if (existsSync(path.join(BASE_PATH, '..', 'current'))) {
    sortedStages.push('current');
  }
  
  return sortedStages;
};

const generateFileDiff = async (previousFile, currentFile) => {
  try {
    if (await isDirectory(previousFile) || await isDirectory(currentFile)) {
      return 'Directory comparison not supported';
    }

    // Check if files exist
    const previousExists = await fs.access(previousFile).then(() => true).catch(() => false);
    const currentExists = await fs.access(currentFile).then(() => true).catch(() => false);

    if (!previousExists && !currentExists) {
      return 'Both files do not exist';
    }

    if (!previousExists) {
      const content = await fs.readFile(currentFile, 'utf8');
      return content.split('\n').map(line => `+ ${line}`).join('\n');
    }

    if (!currentExists) {
      const content = await fs.readFile(previousFile, 'utf8');
      return content.split('\n').map(line => `- ${line}`).join('\n');
    }

    // Use standard Unix diff command
    try {
      const diff = execSync(`diff -u "${previousFile}" "${currentFile}"`, { 
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      // Process the diff output, skipping the first 3 lines (header)
      const lines = diff.split('\n').slice(3);
      if (lines.length === 0) {
        return 'No changes detected';
      }

      return lines.map(line => {
        if (line.startsWith('-')) {
          return `<span class="diff-removed">${line}</span>`;
        } else if (line.startsWith('+')) {
          return `<span class="diff-added">${line}</span>`;
        }
        return line;
      }).join('\n');
    } catch (err) {
      // If the error is just because files are different (exit code 1), use the error output
      if (err.status === 1 && err.output && err.output[1]) {
        const lines = err.output[1].split('\n').slice(3);
        if (lines.length === 0) {
          return 'No changes detected';
        }

        return lines.map(line => {
          if (line.startsWith('-')) {
            return `<span class="diff-removed">${line}</span>`;
          } else if (line.startsWith('+')) {
            return `<span class="diff-added">${line}</span>`;
          }
          return line;
        }).join('\n');
      }
      throw err;
    }
  } catch (err) {
    console.error(`Error generating diff between ${previousFile} and ${currentFile}:`, err);
    return 'Error generating diff';
  }
};

const isDirectory = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch (err) {
    return false;
  }
};

const buildCompleteStageState = async (stage, tempDir) => {
  // Create a temporary directory to store the complete state
  const completeStateDir = path.join(tempDir, `complete_${stage}`);
  await fs.mkdir(completeStateDir, { recursive: true });

  // Get all stages up to and including the current stage
  const allStages = await getAllStages();
  const currentStageIndex = allStages.indexOf(stage);
  const relevantStages = allStages.slice(0, currentStageIndex + 1);

  console.log(`Building complete state for ${stage} using stages: ${relevantStages.join(', ')}`);

  // First, copy bootstrap files if they exist
  const bootstrapPath = path.join(process.cwd(), 'output', 'bootstrap');
  if (await fs.access(bootstrapPath).then(() => true).catch(() => false)) {
    console.log('Copying bootstrap files...');
    try {
      const copyDir = async (src, dest) => {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
            console.log(`Copied bootstrap file ${entry.name}`);
          }
        }
      };
      
      await copyDir(bootstrapPath, completeStateDir);
    } catch (err) {
      console.error('Error copying bootstrap files:', err);
    }
  }

  // For each stage, copy its files to the complete state directory
  for (const stage of relevantStages) {
    const stagePath = validateStage(stage);
    console.log(`Processing stage ${stage} at path ${stagePath}`);
    
    try {
      const copyDir = async (src, dest) => {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
            console.log(`Copied ${entry.name} from stage ${stage}`);
          }
        }
      };
      
      await copyDir(stagePath, completeStateDir);
    } catch (err) {
      console.error(`Error processing stage ${stage}:`, err);
      throw err;
    }
  }

  // Verify the complete state
  const finalFiles = await fs.readdir(completeStateDir);
  console.log(`Complete state for ${stage} contains ${finalFiles.length} files: ${finalFiles.join(', ')}`);

  return completeStateDir;
};

// HTML Generation Utilities
const generateHtmlHeader = (stages) => `
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

const generateStageHeader = (stageName, stageAnchor, description) => `
  <h2 id="${stageAnchor}">${stageName}</h2>
  <div class="stage-header">
    <p>${description}</p>
  </div>
`;

const generateNavigation = (previousAnchor, previousName, nextAnchor, nextName) => `
  <div class="stage-navigation">
    ${previousAnchor ? `<a href="#${previousAnchor}">← Previous: ${previousName}</a>` : '<span></span>'}
    ${nextAnchor ? `<a href="#${nextAnchor}">Next: ${nextName} →</a>` : '<span></span>'}
  </div>
`;

const generateFileList = (files, title, emptyMessage) => `
  <h3>${title}</h3>
  ${files.length > 0 ? `
  <p>${files.length} files ${title.toLowerCase()} in this stage.</p>
  <details>
    <summary>View ${title.toLowerCase()}</summary>
    <ul>
      ${files.map(file => `<li>${file}</li>`).join('\n')}
    </ul>
  </details>` : `<p>${emptyMessage}</p>`}
`;

const generateFileContent = async (file, content, type) => {
  const escapedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
      <h4>${file}</h4>
      <pre class="diff-${type}">
${escapedContent.split('\n').map(line => `${type === 'added' ? '+' : '-'} ${line}`).join('\n')}
      </pre>`;
};

const generateStageSummary = (added, removed, modified) => `
  <div class="summary">
    <h3>Stage Summary</h3>
    <ul>
      <li>Added files: ${added}</li>
      <li>Removed files: ${removed}</li>
      <li>Modified files: ${modified}</li>
      <li>Total changes: ${added + removed + modified}</li>
    </ul>
  </div>
  <hr class="hr">
`;

const generateHtmlFooter = () => `
</body>
</html>
`;

const generateReport = async () => {
  const stages = await getAllStages();
  if (stages.length === 0) {
    throw new Error('No stages found in output/stacks/core/ or output/stacks/tests/');
  }

  console.log(`Found ${stages.length} stages to process: ${stages.join(', ')}`);

  // Create a temporary directory for storing complete states
  const tempDir = path.join(process.cwd(), 'temp_states');
  await fs.mkdir(tempDir, { recursive: true });

  // Create bootstrap state if it exists
  const bootstrapPath = path.join(process.cwd(), 'output', 'bootstrap');
  const hasBootstrap = await fs.access(bootstrapPath).then(() => true).catch(() => false);
  let bootstrapState = null;
  
  if (hasBootstrap) {
    bootstrapState = path.join(tempDir, 'bootstrap');
    await fs.mkdir(bootstrapState, { recursive: true });
    const bootstrapFiles = await fs.readdir(bootstrapPath);
    for (const file of bootstrapFiles) {
      const sourcePath = path.join(bootstrapPath, file);
      const targetPath = path.join(bootstrapState, file);
      if (!(await isDirectory(sourcePath))) {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  let reportContent = generateHtmlHeader(stages);

  // Process each stage
  for (let i = 0; i < stages.length; i++) {
    const currentStage = stages[i];
    const stageName = formatStageName(currentStage);
    const stageAnchor = generateAnchorId(currentStage);

    let stageData;
    let description;
    let previousAnchor = null;
    let previousName = null;
    let nextAnchor = null;
    let nextName = null;

    if (i === 0) {
      // First stage
      if (!hasBootstrap) {
        throw new Error('Bootstrap state is required for the first stage');
      }
      stageData = await processFirstStage(currentStage, tempDir, bootstrapState);
      description = 'Changes from bootstrap to first stage';
    } else {
      // Subsequent stages
      const previousStage = stages[i - 1];
      stageData = await processSubsequentStage(currentStage, previousStage, tempDir);
      previousAnchor = generateAnchorId(previousStage);
      previousName = formatStageName(previousStage);
      description = `Changes from ${previousName} to ${stageName}`;
    }

    if (i < stages.length - 1) {
      nextAnchor = generateAnchorId(stages[i + 1]);
      nextName = formatStageName(stages[i + 1]);
    }

    // Generate stage content
    reportContent += generateStageHeader(stageName, stageAnchor, description);
    reportContent += generateNavigation(previousAnchor, previousName, nextAnchor, nextName);

    // Add prompts if any
    const promptFiles = await findPromptFiles(currentStage);
    if (promptFiles.length > 0) {
      reportContent += '\n  <h3>Prompts</h3>';
      for (const promptFile of promptFiles) {
        reportContent += await formatPromptContent(promptFile);
      }
    }

    // Add stage content
    reportContent += await generateStageContent(stageData, i === 0);
  }

  // Clean up temporary directory
  await fs.rm(tempDir, { recursive: true, force: true });

  // Complete the HTML document
  reportContent += generateHtmlFooter();

  // Write the report
  await fs.writeFile(REPORT_FILE, reportContent);
  console.log(`Report generated: ${REPORT_FILE}`);
  console.log('All stages processed successfully');
};

// Stage Processing Functions
const processFirstStage = async (stage, tempDir, bootstrapState) => {
  const currentCompleteState = await buildCompleteStageState(stage, tempDir);
  
  // Get all files recursively with their relative paths
  const getAllFiles = async (dir, baseDir = '') => {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(baseDir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
    return files;
  };

  const currentFiles = new Set(await getAllFiles(currentCompleteState));
  const bootstrapFiles = new Set(await getAllFiles(bootstrapState));

  const addedFiles = [...currentFiles].filter(file => !bootstrapFiles.has(file));
  const removedFiles = [...bootstrapFiles].filter(file => !currentFiles.has(file));
  
  // Check for actual changes in potentially modified files
  const potentiallyModifiedFiles = [...currentFiles].filter(file => bootstrapFiles.has(file));
  const modifiedFiles = [];
  
  for (const file of potentiallyModifiedFiles) {
    const currentPath = path.join(currentCompleteState, file);
    const previousPath = path.join(bootstrapState, file);
    
    if (await fs.access(currentPath).then(() => true).catch(() => false) &&
        await fs.access(previousPath).then(() => true).catch(() => false)) {
      const diff = await generateFileDiff(previousPath, currentPath);
      if (diff !== 'No changes detected') {
        modifiedFiles.push(file);
      }
    }
  }

  return {
    currentCompleteState,
    previousCompleteState: bootstrapState,
    addedFiles,
    removedFiles,
    modifiedFiles,
    currentFiles,
    previousFiles: bootstrapFiles
  };
};

const processSubsequentStage = async (stage, previousStage, tempDir) => {
  const currentCompleteState = await buildCompleteStageState(stage, tempDir);
  const previousCompleteState = await buildCompleteStageState(previousStage, tempDir);
  
  // Get all files recursively with their relative paths
  const getAllFiles = async (dir, baseDir = '') => {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(baseDir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
    return files;
  };

  const currentFiles = new Set(await getAllFiles(currentCompleteState));
  const previousFiles = new Set(await getAllFiles(previousCompleteState));

  const addedFiles = [...currentFiles].filter(file => !previousFiles.has(file));
  const removedFiles = [...previousFiles].filter(file => !currentFiles.has(file));
  
  // Check for actual changes in potentially modified files
  const potentiallyModifiedFiles = [...currentFiles].filter(file => previousFiles.has(file));
  const modifiedFiles = [];
  
  for (const file of potentiallyModifiedFiles) {
    const currentPath = path.join(currentCompleteState, file);
    const previousPath = path.join(previousCompleteState, file);
    
    if (await fs.access(currentPath).then(() => true).catch(() => false) &&
        await fs.access(previousPath).then(() => true).catch(() => false)) {
      const diff = await generateFileDiff(previousPath, currentPath);
      if (diff !== 'No changes detected') {
        modifiedFiles.push(file);
      }
    }
  }

  return {
    currentCompleteState,
    previousCompleteState,
    addedFiles,
    removedFiles,
    modifiedFiles,
    currentFiles,
    previousFiles
  };
};

const generateStageContent = async (stageData, isFirstStage) => {
  const {
    currentCompleteState,
    previousCompleteState,
    addedFiles,
    removedFiles,
    modifiedFiles,
    currentFiles,
    previousFiles
  } = stageData;

  let content = '';

  // Generate file lists
  content += generateFileList(addedFiles, 'Added Files', 'No files were added in this stage.');
  content += generateFileList(removedFiles, 'Removed Files', 'No files were removed in this stage.');
  content += generateFileList(modifiedFiles, 'Modified Files', 'No files were modified in this stage.');

  // Generate file contents
  if (addedFiles.length > 0) {
    content += '<details><summary>View file contents</summary>';
    for (const file of addedFiles) {
      const filePath = path.join(currentCompleteState, file);
      if (!(await isDirectory(filePath))) {
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          content += await generateFileContent(file, fileContent, 'added');
        } catch (err) {
          console.error(`Error reading added file ${filePath}:`, err);
          content += `<h4>${file}</h4><pre>Error reading file content</pre>`;
        }
      }
    }
    content += '</details>';
  }

  if (removedFiles.length > 0) {
    content += '<details><summary>View removed content</summary>';
    for (const file of removedFiles) {
      const filePath = path.join(previousCompleteState, file);
      if (!(await isDirectory(filePath))) {
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          content += await generateFileContent(file, fileContent, 'removed');
        } catch (err) {
          console.error(`Error reading removed file ${filePath}:`, err);
          content += `<h4>${file}</h4><pre>Error reading file content</pre>`;
        }
      }
    }
    content += '</details>';
  }

  if (modifiedFiles.length > 0) {
    content += '<details><summary>View changes</summary>';
    for (const file of modifiedFiles) {
      const currentPath = path.join(currentCompleteState, file);
      const previousPath = path.join(previousCompleteState, file);
      if (!(await isDirectory(currentPath))) {
        try {
          const diff = await generateFileDiff(previousPath, currentPath);
          content += `<h4>${file}</h4><pre>${diff}</pre>`;
        } catch (err) {
          console.error(`Error generating diff for ${file}:`, err);
          content += `<h4>${file}</h4><pre>Error generating diff</pre>`;
        }
      }
    }
    content += '</details>';
  }

  // Add stage summary
  content += generateStageSummary(
    addedFiles.length,
    removedFiles.length,
    modifiedFiles.length
  );

  return content;
};

// Run the script
generateReport().catch(err => {
  console.error('Error generating report:', err);
  process.exit(1);
}); 