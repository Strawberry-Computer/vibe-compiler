#!/bin/bash

# stage-diff.sh - Compare two stages and generate an HTML report
# Usage: ./stage-diff.sh <source_stage> <target_stage>
# Where source_stage and target_stage are stage numbers (like 001, 002) or 'current'

set -e

# Function to display usage
show_usage() {
  echo "Usage: $0 <source_stage> <target_stage>"
  echo "Where source_stage and target_stage are stage numbers (like 001, 002) or 'current'"
  exit 1
}

# Function to validate stage
validate_stage() {
  local stage=$1
  
  if [[ "$stage" == "current" ]]; then
    if [[ ! -d "output/current" ]]; then
      echo "Error: output/current directory not found"
      exit 1
    fi
    echo "output/current"
  else
    # Check if the stage is a 3-digit number
    if [[ ! "$stage" =~ ^[0-9]{3}$ ]]; then
      echo "Error: Stage must be a 3-digit number (like 001, 002) or 'current'"
      exit 1
    fi
    
    if [[ ! -d "output/stages/$stage" ]]; then
      echo "Error: output/stages/$stage directory not found"
      exit 1
    fi
    echo "output/stages/$stage"
  fi
}

# Check if both arguments are provided
if [[ $# -ne 2 ]]; then
  show_usage
fi

source_stage=$1
target_stage=$2

# Validate stages and get their paths
source_path=$(validate_stage "$source_stage")
target_path=$(validate_stage "$target_stage")

# Format stage names for display
format_stage_name() {
  local stage=$1
  if [[ "$stage" == "current" ]]; then
    echo "Current"
  else
    echo "Stage $stage"
  fi
}

source_name=$(format_stage_name "$source_stage")
target_name=$(format_stage_name "$target_stage")

# Create output file
report_file="stage-comparison-report.html"

# Generate report header
{
  echo "<!DOCTYPE html>"
  echo "<html lang=\"en\">"
  echo "<head>"
  echo "  <meta charset=\"UTF-8\">"
  echo "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
  echo "  <title>$source_name vs $target_name Comparison</title>"
  echo "  <style>"
  echo "    body {"
  echo "      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"
  echo "      line-height: 1.6;"
  echo "      max-width: 1200px;"
  echo "      margin: 0 auto;"
  echo "      padding: 20px;"
  echo "      color: #333;"
  echo "    }"
  echo "    h1 {"
  echo "      color: #2c3e50;"
  echo "      border-bottom: 2px solid #eaecef;"
  echo "      padding-bottom: 10px;"
  echo "    }"
  echo "    h2 {"
  echo "      color: #34495e;"
  echo "      margin-top: 30px;"
  echo "      border-bottom: 1px solid #eaecef;"
  echo "      padding-bottom: 7px;"
  echo "    }"
  echo "    h3 {"
  echo "      color: #3498db;"
  echo "      margin-top: 25px;"
  echo "    }"
  echo "    pre {"
  echo "      background-color: #f6f8fa;"
  echo "      border-radius: 5px;"
  echo "      padding: 15px;"
  echo "      overflow: auto;"
  echo "      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;"
  echo "      font-size: 14px;"
  echo "    }"
  echo "    code {"
  echo "      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;"
  echo "    }"
  echo "    .diff-added {"
  echo "      color: #22863a;"
  echo "      background-color: #f0fff4;"
  echo "    }"
  echo "    .diff-removed {"
  echo "      color: #cb2431;"
  echo "      background-color: #ffeef0;"
  echo "    }"
  echo "    .summary {"
  echo "      background-color: #f8f9fa;"
  echo "      padding: 15px;"
  echo "      border-radius: 5px;"
  echo "      border-left: 4px solid #3498db;"
  echo "      margin-bottom: 20px;"
  echo "    }"
  echo "    ul {"
  echo "      padding-left: 25px;"
  echo "    }"
  echo "    .hr {"
  echo "      border: 0;"
  echo "      height: 1px;"
  echo "      background-color: #eaecef;"
  echo "      margin: 20px 0;"
  echo "    }"
  echo "    .timestamp {"
  echo "      color: #6a737d;"
  echo "      font-style: italic;"
  echo "      margin-bottom: 20px;"
  echo "    }"
  echo "  </style>"
  echo "</head>"
  echo "<body>"
  echo "  <h1>$source_name vs $target_name Comparison</h1>"
  echo "  <div class=\"timestamp\">Report generated on: $(date)</div>"
  echo "  <h2>Changes Summary</h2>"
  echo "  <div class=\"summary\" id=\"summary-placeholder\"></div>"
} > "$report_file"

# Get list of all files in both directories
all_files=$(find "$source_path" "$target_path" -type f | sed -e "s|^$source_path/||" -e "s|^$target_path/||" | sort | uniq)

# Initialize counters
added_count=0
removed_count=0
modified_count=0

# Process each file
for file in $all_files; do
  source_file="$source_path/$file"
  target_file="$target_path/$file"
  
  # Determine file status
  if [[ -f "$source_file" && -f "$target_file" ]]; then
    # File exists in both directories, check if modified
    if ! diff -q "$source_file" "$target_file" > /dev/null 2>&1; then
      {
        echo "  <h3>Modified: $file</h3>"
        echo "  <pre><code>"
        diff -u "$source_file" "$target_file" | tail -n +3 | while IFS= read -r line; do
          if [[ $line == +* ]]; then
            echo "    <span class=\"diff-added\">$line</span>"
          elif [[ $line == -* ]]; then
            echo "    <span class=\"diff-removed\">$line</span>"
          else
            echo "    $line"
          fi
        done
        echo "  </code></pre>"
      } >> "$report_file"
      ((modified_count++))
    fi
  elif [[ -f "$source_file" && ! -f "$target_file" ]]; then
    # File exists in source but not in target (removed)
    {
      echo "  <h3>Removed: $file</h3>"
      echo "  <p>File exists in $source_name but was removed in $target_name</p>"
    } >> "$report_file"
    ((removed_count++))
  elif [[ ! -f "$source_file" && -f "$target_file" ]]; then
    # File exists in target but not in source (added)
    {
      echo "  <h3>Added: $file</h3>"
      echo "  <p>File was added in $target_name</p>"
      echo "  <pre><code>"
      cat "$target_file" | sed 's/</\&lt;/g; s/>/\&gt;/g'
      echo "  </code></pre>"
    } >> "$report_file"
    ((added_count++))
  fi
done

# Update summary
{
  # Create the summary HTML content
  echo "  <ul>"
  echo "    <li>Added files: $added_count</li>"
  echo "    <li>Removed files: $removed_count</li>"
  echo "    <li>Modified files: $modified_count</li>"
  echo "    <li>Total files affected: $((added_count + removed_count + modified_count))</li>"
  echo "  </ul>"
  echo "  <div class=\"hr\"></div>"
} >> "$report_file.tmp"

# Combine the temporary summary with the rest of the report
cat "$report_file" >> "$report_file.tmp"
echo "</body>" >> "$report_file.tmp"
echo "</html>" >> "$report_file.tmp"
mv "$report_file.tmp" "$report_file"

# Replace the summary placeholder with the actual summary
# This is done separately since we need to generate the whole report first to count the files
sed -i.bak "s|<div class=\"summary\" id=\"summary-placeholder\"></div>|<div class=\"summary\">\n  <ul>\n    <li>Added files: $added_count</li>\n    <li>Removed files: $removed_count</li>\n    <li>Modified files: $modified_count</li>\n    <li>Total files affected: $((added_count + removed_count + modified_count))</li>\n  </ul>\n  </div>|g" "$report_file"
rm -f "$report_file.bak"

echo "Report generated: $report_file"
echo "Summary: $added_count added, $removed_count removed, $modified_count modified"

exit 0

