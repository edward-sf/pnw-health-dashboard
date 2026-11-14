import json
from pathlib import Path

from wf.baseline import baseline, session_tokens
from wf.github import FakeGh


def line(ts, inp=1, out=1, create=0, read=0, kind="assistant"):
    usage = {
        "input_tokens": inp,
        "output_tokens": out,
        "cache_creation_input_tokens": create,
        "cache_read_input_tokens": read,
    }
    return json.dumps({"type": kind, "timestamp": ts, "message": {"usage": usage}})


def test_session_tokens_sums_usage_and_skips_bad_lines(tmp_path):
    p = tmp_path / "s.jsonl"
    p.write_text(
        json.dumps(
            {
                "type": "assistant",
                "message": {
                    "usage": {
                        "input_tokens": 10,
                        "output_tokens": 5,
                        "cache_creation_input_tokens": 100,
                        "cache_read_input_tokens": 999,
                    }
                },
            }
        )
        + "\nnot json\n"
    )
    assert session_tokens(p) == 115


def runs(*items):
    return [{"conclusion": c, "headSha": "x", "createdAt": t} for c, t in items]


def test_baseline_windows_sessions_includes_subagents_and_counts_red(tmp_path: Path):
    (tmp_path / "in.jsonl").write_text(line("2026-11-13T18:00:00Z", 10, 5, 100, 7) + "\n")
    sub = tmp_path / "in" / "subagents"
    sub.mkdir(parents=True)
    (sub / "agent-a.jsonl").write_text(line("2026-11-13T19:00:00Z", 1, 1, 0) + "\n")
    (tmp_path / "before.jsonl").write_text(line("2026-11-12T18:00:00Z", 999) + "\n")
    (tmp_path / "after.jsonl").write_text(line("2026-11-14T09:00:00Z", 999) + "\n")
    gh = FakeGh(
        run_lists=[
            runs(
                ("failure", "2026-11-13T17:30:00Z"),
                ("success", "2026-11-13T18:30:00Z"),
                ("failure", "2026-11-13T20:00:00Z"),
            )
        ]
    )
    result = baseline(
        tmp_path, "2026-11-13T17:00:00Z", "2026-11-14T09:00:00Z", gh, "milestone/m11", 2, [248], 11
    )
    assert result.tokens_by_session == {"in": 117}
    assert result.tokens_per_task == 58.5
    assert result.red_deploys_after_merge == 2
    assert result.fix_prs_after_final_review == [248]
    assert any("cache_read_input_tokens" in n and "7" in n for n in result.notes)
    call = gh.calls[0]
    assert call[call.index("--workflow") + 1] == "build-deploy.yml"
    assert call[call.index("--branch") + 1] == "milestone/m11"


def test_zero_tasks_gives_no_per_task_figure(tmp_path: Path):
    result = baseline(tmp_path, "2026-11-13", "2026-11-14", FakeGh(run_lists=[[]]), "b", 0, [])
    assert result.tokens_per_task is None and result.tokens_by_session == {}


def test_lines_sharing_a_message_id_count_once_with_the_last_usage(tmp_path: Path):
    def msg(mid, out):
        usage = {"input_tokens": 1, "output_tokens": out, "cache_read_input_tokens": 50}
        message = {"usage": usage} if mid is None else {"id": mid, "usage": usage}
        return json.dumps({"type": "assistant", "message": message})

    p = tmp_path / "s.jsonl"
    p.write_text("\n".join([msg("m1", 3), msg("m1", 20), msg(None, 7)]) + "\n")
    assert session_tokens(p) == (1 + 20) + (1 + 7)
