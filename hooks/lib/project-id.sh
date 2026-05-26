#!/bin/bash
# Resolves project identity from a hook's stdin JSON (already captured in $INPUT).
# Sets: PROJECT_ROOT, PROJECT_ID, PROJECT_NAME.
# Identity = git toplevel of cwd, falling back to cwd (or the file's dir).

resolve_project_identity() {
  local input="$1"
  local cwd file_path base_dir

  cwd=$(echo "$input" | /usr/bin/jq -r '.cwd // .workspace_roots[0] // empty' 2>/dev/null)

  if [ -z "$cwd" ]; then
    file_path=$(echo "$input" | /usr/bin/jq -r '.tool_input.file_path // .file_path // empty' 2>/dev/null)
    if [ -n "$file_path" ]; then
      base_dir=$(dirname "$file_path")
    fi
  fi

  base_dir="${cwd:-$base_dir}"
  base_dir="${base_dir:-$PWD}"

  PROJECT_ROOT=$(git -C "$base_dir" rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$PROJECT_ROOT" ]; then
    PROJECT_ROOT="$base_dir"
  fi
  PROJECT_ID="$PROJECT_ROOT"
  PROJECT_NAME=$(basename "$PROJECT_ROOT")
}
