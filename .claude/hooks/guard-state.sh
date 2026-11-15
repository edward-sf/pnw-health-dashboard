#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash): only `wf` writes workflow run state
# (.workflow/runs/). Exit 2 blocks the call and shows stderr to Claude; exit 0 lets it through.
#
# A guard against drift, not a security boundary: Bash is matched by pattern, so a determined
# command (an interpreter script, a variable-built path) can still get around it. It stops the
# honest mistake of hand-editing state that `wf` keeps consistent. Reads are never blocked.
set -uE

# Fail closed: an unexpected error in this script blocks the call instead of letting it through.
trap 'echo "Blocked by .claude/hooks/guard-state.sh: hook error (unexpected failure while checking the call)." >&2; exit 2' ERR

input=$(cat)
# Cheap pre-test on the raw input, so ordinary calls never need jq.
grep -qE '\.workflow/runs|wf.{1,8}clear' <<<"$input" || exit 0
command -v jq >/dev/null || {
  echo "Blocked by .claude/hooks/guard-state.sh: jq is not installed, so this call cannot be checked." >&2
  exit 2
}

# Clearing an escalation is the author's decision, made in their own terminal (no hook runs
# there). From a Claude Code session it is always refused.
clear_pattern='(^|[^[:alnum:]_-])wf[[:space:]]+clear([[:space:]]|$)'
if [[ "$(jq -r '.tool_input.command // ""' <<<"$input")" =~ $clear_pattern ]]; then
  echo "Blocked by .claude/hooks/guard-state.sh: 'wf clear' is the author's decision; they run it in their own terminal. Notify the author and stop." >&2
  exit 2
fi

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
# A plain `wf` command writes state itself. With a shell operator (a separator, pipe, redirect
# or command substitution, newline included) the rest could write too: check the whole command.
operators=$'[;&|<>`\n]|\\$\\('
[[ "$cmd" == "uv run --project workflow wf "* && ! "$cmd" =~ $operators ]] && exit 0

write='(>|(^|[^[:alnum:]_-])(tee|rm|mv|cp|truncate|touch)([[:space:]]|$)|sed[[:space:]]+(-[[:alnum:]]*[[:space:]]+)*-i)'
# Redirects that discard output or merge streams are not writes to a file.
probe=$(sed -E 's#[0-9]*>&[0-9-]#  #g; s#[0-9]*>>?[[:space:]]*/dev/null# #g' <<<"$cmd")
[[ "$probe" =~ $write ]] && block "the command writes under .workflow/runs."
exit 0
