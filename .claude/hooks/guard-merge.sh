#!/usr/bin/env bash
# PreToolUse hook (Bash): allow `gh pr merge` only for PRs whose base branch is milestone/*.
# Milestone PRs into main are the author's to merge (CONTRIBUTING.md). Exit 2 blocks the
# command and shows stderr to Claude; exit 0 lets it through to the normal permission check.
set -u

cmd=$(jq -r '.tool_input.command // ""')
pattern='(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'
[[ "$cmd" =~ $pattern ]] || exit 0

block() {
  echo "Blocked by .claude/hooks/guard-merge.sh: $1 Only issue PRs into milestone/* may be merged here; milestone PRs into main are the author's." >&2
  exit 2
}

# One merge per command keeps the check unambiguous.
count=$(grep -oE 'gh[[:space:]]+pr[[:space:]]+merge' <<<"$cmd" | wc -l | tr -d ' ')
[[ "$count" == "1" ]] || block "the command runs more than one gh pr merge."

# Tokens after `gh pr merge` on the line where it occurs (-n/p drops every other line of a
# multi-line command), up to the first shell separator.
rest=$(sed -nE 's/.*gh[[:space:]]+pr[[:space:]]+merge//p' <<<"$cmd" | sed -E 's/[;&|].*//')
read -r -a args <<<"$rest"

pr="" repo=""
i=0
while (( i < ${#args[@]} )); do
  a=${args[i]}
  case "$a" in
    -R|--repo) repo=${args[i+1]:-}; i=$((i + 2)); continue ;;
    --repo=*) repo=${a#--repo=} ;;
    -t|--subject|-b|--body|-F|--body-file|-A|--author-email|--match-head-commit)
      i=$((i + 2)); continue ;;
    -*) ;;
    *) [[ -z "$pr" ]] && pr=$a ;;
  esac
  i=$((i + 1))
done
# Strip quotes the shell would have removed.
pr=${pr//\"/}; pr=${pr//\'/}
repo=${repo//\"/}; repo=${repo//\'/}

view=(gh pr view)
[[ -n "$pr" ]] && view+=("$pr")
[[ -n "$repo" ]] && view+=(--repo "$repo")
base=$("${view[@]}" --json baseRefName --jq .baseRefName 2>/dev/null) ||
  block "could not look up the base branch of PR ${pr:-for the current branch}."

if [[ "$base" == milestone/* ]]; then
  # A milestone with a workflow run also needs the gate, review and CI records for the PR's
  # current head. Milestones without a run keep the base-branch check alone.
  if [[ "$base" =~ ^milestone/m([0-9]+)$ ]]; then
    m=${BASH_REMATCH[1]}
    root=${CLAUDE_PROJECT_DIR:-.}
    if [[ -f "$root/.workflow/runs/m$m/state.json" && -n "$pr" ]]; then
      check=$(cd "$root" && uv run --project workflow wf check-merge "$pr" --milestone "$m" 2>&1)
      status=$?
      if (( status != 0 )); then
        reasons=$(jq -r '.reasons // [] | join("; ")' <<<"$check" 2>/dev/null)
        block "wf check-merge refused PR $pr: ${reasons:-${check:-exit $status}}."
      fi
    fi
  fi
  exit 0
fi
block "PR ${pr:-for the current branch} targets '${base:-unknown}'."
