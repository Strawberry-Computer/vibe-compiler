#!/bin/bash

# stage-diff.sh - Generate an HTML report showing all stages and their changes
# Usage: ./stage-diff.sh
# The script automatically detects all stages and creates a comprehensive report

set -e

# Function to display usage
show_usage() {
  echo "Usage: $0"
  echo "The script automatically detects all stages and creates a comprehensive report"
  exit 1
}

# Function to validate stage
validate_stage() {
  local stage=$1
  
  if [[ "$stage" == "current" ]]; then
    if [[ ! -d "output/current" ]]; then
      echo "Error: output/current directory not found" >&2
      exit 1
    fi
    echo "output/current"
  else
    # Accept 1-3 digit numbers and use original name
    if [[ ! "$stage" =~ ^[0-9]{1,3}$ ]]; then
      echo "Error: Stage must be a number (1-999) or 'current'" >&2
      exit 1
    fi
    if [[ ! -d "output/stages/$stage" ]]; then
      echo "Error: output/stages/$stage directory not found" >&2
      exit 1
    fi
    echo "output/stages/$stage"
  fi
}

# Function to get all available stages in order
get_all_stages() {
  # Find all stage directories with 1-3 digits and sort numerically
  find output/stages -maxdepth 1 -type d -name "[0-9]*" | 
    sed -e 's|output/stages/||' | 
    sort -n
}

# Generate a list of all stages
all_stages=($(get_all_stages))

# Add 'current' at the end if it exists
if [[ -d "output/current" ]]; then
  all_stages+=("current")
fi

# Check if we found any stages
if [[ ${#all_stages[@]} -eq 0 ]]; then
  echo "Error: No stages found in output/stages directory"
  exit 1
fi

echo "Found ${#all_stages[@]} stages to process: ${all_stages[*]}"

# Format stage names for display
format_stage_name() {
  local stage=$1
  if [[ "$stage" == "current" ]]; then
    echo "Current"
  else
    echo "Stage $stage"
  fi
}

# Function to generate an anchor ID from a stage name
generate_anchor_id() {
  local stage=$1
  echo "stage-${stage}"
}

# Function to generate a table of contents entry
generate_toc_entry() {
  local stage=$1
  local formatted_name=$(format_stage_name "$stage")
  local anchor_id=$(generate_anchor_id "$stage")
  echo "<li><a href=\"#${anchor_id}\">${formatted_name}</a></li>"
}

# Function to find prompt files for a specific stage
find_prompt_files() {
  local stage_num=$1
  
  # Skip if stage is 'current'
  if [[ "$stage_num" == "current" ]]; then
    return
  fi
  
  # Match stage number with or without leading zeros
  local normalized=$(printf "%03d" "$stage_num")
  find ./stacks -type f -name "[0-9]*_*.md" | 
    grep -E "/(${stage_num}|${normalized})_" | 
    sort
}

# Function to extract and format prompt content
format_prompt_content() {
  local file=$1
  local content=$(cat "$file" | sed 's/</\</g; s/>/\>/g')
  local relative_path=${file#./}
  
  echo "<div class=\"prompt-container\">"
  echo "  <div class=\"prompt-file\">File: $relative_path</div>"
  echo "  <div class=\"prompt-header\">Prompt:</div>"
  echo "  <div class=\"prompt-content\">$content</div>"
  echo "</div>"
}

# Create output file
report_file="stage-comparison-report.html"

# Generate report header
{
  echo "<!DOCTYPE html>"
  echo "<html lang=\"en\">"
  echo "<head>"
  echo "  <meta charset=\"UTF-8\">"
  echo "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
  echo "  <title>Vibe Compiler Stages Report</title>"
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
  echo "    .prompt-container {"
  echo "      background-color: #f1f8ff;"
  echo "      border-radius: 5px;"
  echo "      padding: 15px;"
  echo "      margin-bottom: 25px;"
  echo "      border-left: 4px solid #0366d6;"
  echo "    }"
  echo "    .toc {"
  echo "      background-color: #f8f9fa;"
  echo "      border-radius: 5px;"
  echo "      padding: 15px 25px;"
  echo "      margin-bottom: 30px;"
  echo "      border-left: 4px solid #2c3e50;"
  echo "    }"
  echo "    .stage-navigation {"
  echo "      display: flex;"
  echo "      justify-content: space-between;"
  echo "      margin: 20px 0;"
  echo "      padding: 10px 0;"
  echo "      border-top: 1px solid #eaecef;"
  echo "      border-bottom: 1px solid #eaecef;"
  echo "    }"
  echo "    .stage-navigation a {"
  echo "      text-decoration: none;"
  echo "      color: #0366d6;"
  echo "      padding: 5px 10px;"
  echo "      border-radius: 3px;"
  echo "    }"
  echo "    .stage-navigation a:hover {"
  echo "      background-color: #f1f8ff;"
  echo "    }"
  echo "    .back-to-top {"
  echo "      position: fixed;"
  echo "      bottom: 20px;"
  echo "      right: 20px;"
  echo "      background-color: #2c3e50;"
  echo "      color: white;"
  echo "      padding: 10px 15px;"
  echo "      border-radius: 5px;"
  echo "      text-decoration: none;"
  echo "      opacity: 0.7;"
  echo "    }"
  echo "    .back-to-top:hover {"
  echo "      opacity: 1;"
  echo "    }"
  echo "    .stage-header {"
  echo "      background-color: #f0f7ff;"
  echo "      padding: 15px;"
  echo "      border-radius: 5px;"
  echo "      margin-bottom: 20px;"
  echo "      box-shadow: 0 2px 5px rgba(0,0,0,0.1);"
  echo "    }"
  echo "    .prompt-header {"
  echo "      font-weight: bold;"
  echo "      color: #0366d6;"
  echo "      margin-bottom: 10px;"
  echo "    }"
  echo "    .prompt-content {"
  echo "      white-space: pre-wrap;"
  echo "      font-size: 14px;"
  echo "      line-height: 1.5;"
  echo "    }"
  echo "    .prompt-file {"
  echo "      font-style: italic;"
  echo "      color: #586069;"
  echo "      margin-bottom: 5px;"
  echo "    }"
  echo "  </style>"
  echo "</head>"
  echo "<body>"
  echo "  <h1>Vibe Compiler Stages Report</h1>"
  echo "  <div class=\"timestamp\">Report generated on: $(date)</div>"
  echo "  <a href=\"#\" class=\"back-to-top\">Back to Top</a>"
  
  # Generate table of contents
  echo "  <h2>Table of Contents</h2>"
  echo "  <div class=\"toc\">"
  echo "    <ol>"
  for stage in "${all_stages[@]}"; do
    generate_toc_entry "$stage"
  done
  echo "    </ol>"
  echo "  </div>"
} > "$report_file"

# Process each stage
total_stages=${#all_stages[@]}
for ((i=0; i<total_stages; i++)); do
  current_stage="${all_stages[i]}"
  # For the first stage, we don't have a previous stage to compare with
  if [[ $i -eq 0 ]]; then
    # Skip first stage comparison since there's nothing to compare with
    # But we still want to show the prompt
    stage_path=$(validate_stage "$current_stage")
    stage_name=$(format_stage_name "$current_stage")
    stage_anchor=$(generate_anchor_id "$current_stage")
    
    {
      # Stage header with navigation
      echo "  <h2 id=\"${stage_anchor}\">${stage_name}</h2>"
      echo "  <div class=\"stage-header\">"
      echo "    <p>This is the first stage in the sequence.</p>"
      echo "  </div>"
      
      # Navigation
      echo "  <div class=\"stage-navigation\">"
      echo "    <span></span>" # Empty span for alignment
      if [[ $i -lt $((total_stages-1)) ]]; then
        next_stage="${all_stages[$((i+1))]}"
        next_anchor=$(generate_anchor_id "$next_stage")
        next_name=$(format_stage_name "$next_stage")
        echo "    <a href=\"#${next_anchor}\">Next: ${next_name} →</a>"
      else
        echo "    <span></span>"
      fi
      echo "  </div>"
      
      # Show prompt content for the current stage
      prompt_files=($(find_prompt_files "$current_stage"))
      if [[ ${#prompt_files[@]} -gt 0 ]]; then
        echo "    <h3>Prompts</h3>"
        for prompt_file in "${prompt_files[@]}"; do
          format_prompt_content "$prompt_file"
        done
      fi
      
      # For the first stage, list all initial files
      echo "    <h3>Initial Files</h3>"
      file_count=$(find "$stage_path" -type f | wc -l | tr -d ' ')
      echo "    <p>This stage contains $file_count files.</p>"
      echo "    <details>"
      echo "      <summary>View file list</summary>"
      echo "      <ul>"
      find "$stage_path" -type f | sort | while read -r file; do
        rel_path="${file#$stage_path/}"
        echo "        <li>$rel_path</li>"
      done
      echo "      </ul>"
      echo "    </details>"
    } >> "$report_file"
    
    continue
  fi
  
  # For subsequent stages, compare with previous stage
  previous_stage="${all_stages[$((i-1))]}"
  previous_path=$(validate_stage "$previous_stage")
  current_path=$(validate_stage "$current_stage")
  
  stage_name=$(format_stage_name "$current_stage")
  stage_anchor=$(generate_anchor_id "$current_stage")
  previous_anchor=$(generate_anchor_id "$previous_stage")
  previous_name=$(format_stage_name "$previous_stage")
  
  # Initialize counters for this stage
  added_files=0
  removed_files=0
  modified_files=0
  
  # Create arrays for tracking changes
  added_file_list=()
  removed_file_list=()
  modified_file_list=()
  
  # Start stage section
  {
    # Stage header with navigation
    echo "  <h2 id=\"${stage_anchor}\">${stage_name}</h2>"
    echo "  <div class=\"stage-header\">"
    echo "    <p>Changes from ${previous_name} to ${stage_name}</p>"
    echo "  </div>"
    
    # Navigation
    echo "  <div class=\"stage-navigation\">"
    if [[ $i -gt 0 ]]; then
      echo "    <a href=\"#${previous_anchor}\">← Previous: ${previous_name}</a>"
    else
      echo "    <span></span>"
    fi
    if [[ $i -lt $((total_stages-1)) ]]; then
      next_stage="${all_stages[$((i+1))]}"
      next_anchor=$(generate_anchor_id "$next_stage")
      next_name=$(format_stage_name "$next_stage")
      echo "    <a href=\"#${next_anchor}\">Next: ${next_name} →</a>"
    else
      echo "    <span></span>"
    fi
    echo "  </div>"
    
    # Show prompt content for the current stage
    prompt_files=($(find_prompt_files "$current_stage"))
    if [[ ${#prompt_files[@]} -gt 0 ]]; then
      echo "  <h3>Prompts</h3>"
      for prompt_file in "${prompt_files[@]}"; do
        format_prompt_content "$prompt_file"
      done
    fi
    
    # Find all files in both directories
    current_files=$(find "$current_path" -type f | sort)
    previous_files=$(find "$previous_path" -type f | sort)
    
    # Find added files (in current but not in previous)
    echo "  <h3>Added Files</h3>"
    for file in $current_files; do
      rel_path="${file#$current_path/}"
      previous_file="$previous_path/$rel_path"
      
      if [[ ! -f "$previous_file" ]]; then
        added_files=$((added_files + 1))
        added_file_list+=("$rel_path")
      fi
    done
    
    if [[ $added_files -gt 0 ]]; then
      echo "  <p>$added_files new files were added in this stage.</p>"
      echo "  <details>"
      echo "    <summary>View added files</summary>"
      echo "    <ul>"
      for file in "${added_file_list[@]}"; do
        echo "      <li>$file</li>"
      done
      echo "    </ul>"
      echo "    <details>"
      echo "      <summary>View file contents</summary>"
      for file in "${added_file_list[@]}"; do
        current_file="$current_path/$file"
        echo "      <h4>$file</h4>"
        echo "      <pre class=\"diff-added\">"
        cat "$current_file" | sed 's/</\</g; s/>/\>/g' | while read -r line; do
          echo "+ $line"
        done
        echo "      </pre>"
      done
      echo "    </details>"
      echo "  </details>"
    else
      echo "  <p>No files were added in this stage.</p>"
    fi
    
    # Find removed files (in previous but not in current)
    echo "  <h3>Removed Files</h3>"
    for file in $previous_files; do
      rel_path="${file#$previous_path/}"
      current_file="$current_path/$rel_path"
      
      if [[ ! -f "$current_file" ]]; then
        removed_files=$((removed_files + 1))
        removed_file_list+=("$rel_path")
      fi
    done
    
    if [[ $removed_files -gt 0 ]]; then
      echo "  <p>$removed_files files were removed in this stage.</p>"
      echo "  <details>"
      echo "    <summary>View removed files</summary>"
      echo "    <ul>"
      for file in "${removed_file_list[@]}"; do
        echo "      <li>$file</li>"
      done
      echo "    </ul>"
      echo "    <details>"
      echo "      <summary>View removed content</summary>"
      for file in "${removed_file_list[@]}"; do
        previous_file="$previous_path/$file"
        echo "      <h4>$file</h4>"
        echo "      <pre class=\"diff-removed\">"
        cat "$previous_file" | sed 's/</\</g; s/>/\>/g' | while read -r line; do
          echo "- $line"
        done
        echo "      </pre>"
      done
      echo "    </details>"
      echo "  </details>"
    else
      echo "  <p>No files were removed in this stage.</p>"
    fi
    
    # Find modified files (in both but different)
    echo "  <h3>Modified Files</h3>"
    for file in $current_files; do
      rel_path="${file#$current_path/}"
      previous_file="$previous_path/$rel_path"
      
      if [[ -f "$previous_file" ]]; then
        # Compare files
        if ! cmp -s "$file" "$previous_file"; then
          modified_files=$((modified_files + 1))
          modified_file_list+=("$rel_path")
        fi
      fi
    done
    
    if [[ $modified_files -gt 0 ]]; then
      echo "  <p>$modified_files files were modified in this stage.</p>"
      echo "  <details>"
      echo "    <summary>View modified files</summary>"
      echo "    <ul>"
      for file in "${modified_file_list[@]}"; do
        echo "      <li>$file</li>"
      done
      echo "    </ul>"
      echo "    <details>"
      echo "      <summary>View changes</summary>"
      for file in "${modified_file_list[@]}"; do
        current_file="$current_path/$file"
        previous_file="$previous_path/$file"
        echo "      <h4>$file</h4>"
        echo "      <pre>"
        # Generate diff and colorize output
        diff -u "$previous_file" "$current_file" | tail -n +3 | sed 's/</\</g; s/>/\>/g' | while read -r line; do
          if [[ $line == -* ]]; then
            echo "<span class=\"diff-removed\">$line</span>"
          elif [[ $line == +* ]]; then
            echo "<span class=\"diff-added\">$line</span>"
          else
            echo "$line"
          fi
        done
        echo "      </pre>"
      done
      echo "    </details>"
      echo "  </details>"
    else
      echo "  <p>No files were modified in this stage.</p>"
    fi
    
    # Add stage summary
    echo "  <div class=\"summary\">"
    echo "    <h3>Stage Summary</h3>"
    echo "    <ul>"
    echo "      <li>Added files: $added_files</li>"
    echo "      <li>Removed files: $removed_files</li>"
    echo "      <li>Modified files: $modified_files</li>"
    echo "      <li>Total changes: $((added_files + removed_files + modified_files))</li>"
    echo "    </ul>"
    echo "  </div>"
    
    echo "  <hr class=\"hr\">"
  } >> "$report_file"
done

# Complete the HTML document
{
  echo "</body>"
  echo "</html>"
} >> "$report_file"

echo "Report generated: $report_file"
echo "All stages processed successfully"

# Open the report in the default browser (uncomment if desired)
# if command -v open > /dev/null; then
#   open "$report_file"
# elif command -v xdg-open > /dev/null; then
#   xdg-open "$report_file"
# fi

exit 0
exit 0
