@AGENTS.md

## Claude Code specifics

- **Committed hooks** in `.claude/settings.json`:
  - `.claude/hooks/guard-merge.sh` refuses any PR merge whose base is not `milestone/*`. When a run exists, it also requires `wf check-merge` to pass.
  - `.claude/hooks/guard-state.sh` refuses writes under `.workflow/runs/` and any command that clears an escalation.
  - Both match the raw command text, so they also fire on an `echo`, a commit message or a heredoc that merely mentions the merge command, the clear command or the runs path with a redirect. Write such text with the Write tool and pass it as a file (`--body-file`), and run a real merge as its own single-line command.
  - Don't try to work around a hook. Tell the author what it blocked.
- **Skills:** `/run-milestone <N>` walks a milestone's graph (`.claude/skills/run-milestone/SKILL.md`). Use `/loop /run-milestone <N>` to carry a run across usage-window pauses.
- **Subagents:** set each dispatch's model explicitly. Inside a run, `workflow/graph.toml` sets each node's tier: opus for the final review and the delta review, and sonnet for everything else, task review included. Workers never dispatch their own reviewers.
- **Local-only settings:** the `Bash(gh pr merge:*)` allow rule lives in `.claude/settings.local.json`, not in the committed settings.
