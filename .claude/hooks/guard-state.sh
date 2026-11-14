#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash): only `wf` writes workflow run state
# (.workflow/runs/). Exit 2 blocks the call and shows stderr to Claude; exit 0 lets it through.
#
# A guard against drift, not a security boundary: Bash is matched by pattern, so a determined
# command (an interpreter script, a variable-built path) can still get around it. It stops the
# honest mistake of hand-editing state that `wf` keeps consistent. Reads are never blocked.
set -u

input=$(cat)

block() {
  echo "Blocked by .claude/hooks/guard-state.sh: $1 Run state in .workflow/runs/ is written only by 'uv run --project workflow wf <command>'." >&2
  exit 2
}

# Collapse `x/..` segments and `./` so a path cannot dodge the check by wandering.
normalize() {
  local p=$1 prev=""
  while [[ "$p" != "$prev" ]]; do
    prev=$p
    p=$(sed -E 's#/\./#/#g; s#(^|/)[^/.][^/]*/\.\./#\1#; s#(^|/)\.[^/.][^/]*/\.\./#\1#' <<<"$p")
  done
  printf '%s' "$p"
}

file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
if [[ -n "$file" ]]; then
  norm=$(normalize "$file")
  if [[ "$norm" == .workflow/runs/* || "$norm" == */.workflow/runs/* ]]; then
    block "$file is run state."
  fi
  exit 0
fi

cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
[[ "$cmd" == *".workflow/runs"* ]] || exit 0
[[ "$cmd" == "uv run --project workflow wf "* ]] && exit 0

write='(>|(^|[^[:alnum:]_-])(tee|rm|mv|cp|truncate|touch)([[:space:]]|$)|sed[[:space:]]+(-[[:alnum:]]*[[:space:]]+)*-i)'
# Redirects that discard output or merge streams are not writes to a file.
probe=$(sed -E 's#[0-9]*>&[0-9-]#  #g; s#[0-9]*>>?[[:space:]]*/dev/null# #g' <<<"$cmd")
[[ "$probe" =~ $write ]] && block "the command writes under .workflow/runs."
exit 0
