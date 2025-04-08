#!/bin/bash

# stage-diff.sh - Generate an HTML report showing all stages and their changes
# Usage: ./stage-diff.sh
# The script automatically detects all stages in output/stacks/ and creates a comprehensive report
# Stages are expected in format: output/stacks/core/001_add_logging/, output/stacks/tests/001_basic_tests/, etc.

set -e

# Function to display usage
show_usage() {
  echo "Usage: $0"
  echo "Generates an HTML report comparing all stages in output/stacks/"
  echo "Expected stage format: XXX_description (e.g., 001_add_logging)"
  exit 1
}

# Function to validate stage directory
validate_stage() {
  local stage=$1
  local base_path="output/stacks"
  
  if [[ "$stage" == "current" ]]; then
    if [[ ! -d "$base_path/../current" ]]; then
      echo "Error: output/current directory not found" >&2
      exit 1
    fi
    echo "$base_path/../current"
  else
    # Validate 3-digit stage number format
    if [[ ! "$stage" =~ ^[0-9]{3}_ ]]; then
      echo "Error: Stage must be in format 'XXX_description' (e.g., 001_add_logging) or 'current'" >&2
      exit 1
    fi
    # Check both core and tests directories
    local found=false
    for dir in "core" "tests"; do
      if [[ -d "$base_path/$dir/$stage" ]]; then
        echo "$base_path/$dir/$stage"
        found=true
        break
      fi
    done
    if [[ "$found" == "false" ]]; then
      echo "Error: Stage directory $stage not found in $base_path/core/ or $base_path/tests/" >&2
      exit 1
    fi
  fi
}

# Function to get all available stages in order
get_all_stages() {
  local stages=()
  local temp_stages=""
  # Find all stage directories in core and tests with 3-digit prefix
  for dir in "core" "tests"; do
    if [[ -d "output/stacks/$dir" ]]; then
      temp_stages=$(find "output/stacks/$dir" -maxdepth 1 -type d -name "[0-9][0-9][0-9]_*" | 
        sed -e "s|output/stacks/$dir/||" | 
        sort)
      while IFS= read -r stage; do
        if [[ -n "$stage" ]]; then
          stages+=("$stage")
        fi
      done <<< "$temp_stages"
    fi
  done
  # Remove duplicates and sort
  printf '%s\n' "${stages[@]}" | sort -u
}

# Generate a list of all stages
all_stages=()
while IFS= read -r stage; do
  if [[ -n "$stage" ]]; then
    all_stages+=("$stage")
  fi
done <<< "$(get_all_stages)"

# Add 'current' at the end if it exists
if [[ -d "output/current" ]]; then
  all_stages+=("current")
fi

# Check if we found any stages
if [[ ${#all_stages[@]} -eq 0 ]]; then
  echo "Error: No stages found in output/stacks/core/ or output/stacks/tests/"
  exit 1
fi

echo "Found ${#all_stages[@]} stages to process: ${all_stages[*]}"

# Format stage names for display
format_stage_name() {
  local stage=$1
  if [[ "$stage" == "current" ]]; then
    echo "Current"
  else
    # Convert 001_add_logging to "Stage 001: Add Logging"
    local num="${stage:0:3}"
    local desc="${stage:4}"
    desc=$(echo "$desc" | sed 's/_/ /g' | 
           awk '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) tolower(substr($i,2))}}1')
    echo "Stage $num: $desc"
  fi
}

# Function to generate an anchor ID from a stage name
generate_anchor_id() {
  local stage=$1
  echo "stage-${stage// /_}"
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
  local stage=$1
  
  # Skip if stage is 'current'
  if [[ "$stage" == "current" ]]; then
    return
  fi
  
  # Match stage number with 3-digit format
  find ./stacks -type f -name "${stage}*.md" | sort
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
  
  if [[ $i -eq 0 ]]; then
    stage_path=$(validate_stage "$current_stage")
    stage_name=$(format_stage_name "$current_stage")
    stage_anchor=$(generate_anchor_id "$current_stage")
    
    {
      echo "  <h2 id=\"${stage_anchor}\">${stage_name}</h2>"
      echo "  <div class=\"stage-header\">"
      echo "    <p>This is the first stage in the sequence.</p>"
      echo "  </div>"
      
      echo "  <div class=\"stage-navigation\">"
      echo "    <span></span>"
      if [[ $i -lt $((total_stages-1)) ]]; then
        next_stage="${all_stages[$((i+1))]}"
        next_anchor=$(generate_anchor_id "$next_stage")
        next_name=$(format_stage_name "$next_stage")
        echo "    <a href=\"#${next_anchor}\">Next: ${next_name} →</a>"
      fi
      echo "  </div>"
      
      prompt_files=()
      while IFS= read -r file; do
        if [[ -n "$file" ]]; then
          prompt_files+=("$file")
        fi
      done <<< "$(find_prompt_files "$current_stage")"
      
      if [[ ${#prompt_files[@]} -gt 0 ]]; then
        echo "    <h3>Prompts</h3>"
        for prompt_file in "${prompt_files[@]}"; do
          format_prompt_content "$prompt_file"
        done
      fi
      
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
  
  previous_stage="${all_stages[$((i-1))]}"
  previous_path=$(validate_stage "$previous_stage")
  current_path=$(validate_stage "$current_stage")
  
  stage_name=$(format_stage_name "$current_stage")
  stage_anchor=$(generate_anchor_id "$current_stage")
  previous_anchor=$(generate_anchor_id "$previous_stage")
  previous_name=$(format_stage_name "$previous_stage")
  
  added_files=0
  removed_files=0
  modified_files=0
  added_file_list=()
  removed_file_list=()
  modified_file_list=()
  
  {
    echo "  <h2 id=\"${stage_anchor}\">${stage_name}</h2>"
    echo "  <div class=\"stage-header\">"
    echo "    <p>Changes from ${previous_name} to ${stage_name}</p>"
    echo "  </div>"
    
    echo "  <div class=\"stage-navigation\">"
    echo "    <a href=\"#${previous_anchor}\">← Previous: ${previous_name}</a>"
    if [[ $i -lt $((total_stages-1)) ]]; then
      next_stage="${all_stages[$((i+1))]}"
      next_anchor=$(generate_anchor_id "$next_stage")
      next_name=$(format_stage_name "$next_stage")
      echo "    <a href=\"#${next_anchor}\">Next: ${next_name} →</a>"
    else
      echo "    <span></span>"
    fi
    echo "  </div>"
    
    prompt_files=()
    while IFS= read -r file; do
      if [[ -n "$file" ]]; then
        prompt_files+=("$file")
      fi
    done <<< "$(find_prompt_files "$current_stage")"
    
    if [[ ${#prompt_files[@]} -gt 0 ]]; then
      echo "  <h3>Prompts</h3>"
      for prompt_file in "${prompt_files[@]}"; do
        format_prompt_content "$prompt_file"
      done
    fi
    
    current_files=$(find "$current_path" -type f | sort)
    previous_files=$(find "$previous_path" -type f | sort)
    
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
      echo "      <summary estabanView removed content</summary>"
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
    
    echo "  <h3>Modified Files</h3>"
    for file in $current_files; do
      rel_path="${file#$current_path/}"
      previous_file="$previous_path/$rel_path"
      if [[ -f "$previous_file" ]] && ! cmp -s "$file" "$previous_file"; then
        modified_files=$((modified_files + 1))
        modified_file_list+=("$rel_path")
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

exit 0
