/**
 * Dynamic plugin to dump file contents into prompts
 * This plugin reads files specified in the prompt's Context section
 * or falls back to files specified in config.pluginParams.dump_files.files
 */
const fs = require("fs").promises;
const path = require("path");

module.exports = async (context) => {
  const output = [];

  // Extract files from ## Context: section
  const contextMatch = context.promptContent.match(/## Context: (.+)/);
  const externalFiles = contextMatch 
    ? contextMatch[1].split(",").map(f => f.trim())
    : context.config.pluginParams.dump_files?.files || [];

  if (externalFiles.length) {
    const contents = await Promise.all(
      externalFiles.map(async (file) => {
        try {
          const content = await fs.readFile(file, "utf8");
          return "```javascript " + file + "\n" + content + "\n```";
        } catch (e) {
          return "```javascript " + file + "\n// File not found\n```";
        }
      })
    );
    output.push(...contents);
  }

  // Aggregate files from output/current/<stack>/
  const stackDir = path.join(context.workingDir, context.stack);
  let generatedFiles = [];
  try {
    generatedFiles = await fs.readdir(stackDir);
  } catch (e) {
    // Dir might not exist yet
  }

  if (generatedFiles.length) {
    const contents = await Promise.all(
      generatedFiles.map(async (file) => {
        const fullPath = path.join(stackDir, file);
        try {
          const stats = await fs.stat(fullPath);
          if (stats.isDirectory()) {
            return `// ${path.join(context.stack, file)} is a directory`;
          }
          const content = await fs.readFile(fullPath, "utf8");
          return "```javascript " + path.join(context.stack, file) + "\n" + content + "\n```";
        } catch (e) {
          return `// Error reading ${path.join(context.stack, file)}: ${e.message}`;
        }
      })
    );
    output.push("Generated files in current stack:\n", ...contents);
  }

  // Include test results if available (for retries)
  if (context.testResult) {
    output.push("\nPrevious test results:");
    output.push("```");
    output.push(`Exit code: ${context.testResult.errorCode}`);
    if (context.testResult.stdout) {
      output.push("\nStandard output:");
      output.push(context.testResult.stdout);
    }
    if (context.testResult.stderr) {
      output.push("\nStandard error:");
      output.push(context.testResult.stderr);
    }
    output.push("```");
  }

  return output.length ? output.join("\n") : "No context files available.";
};
