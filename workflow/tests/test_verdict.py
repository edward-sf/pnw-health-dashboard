import json
from pathlib import Path

import pytest

from wf.config import load_graph
from wf.state import ReviewRecord, RunStateError, init_run
from wf.verdict import VerdictError, ingest, load_verdict

REPO = Path(__file__).resolve().parents[2]
GRAPH = load_graph(REPO / "workflow/graph.toml")
NOW = "2026-11-14T10:00:00Z"


def f(id, severity):
    return {"id": id, "severity": severity, "title": "t", "file": "a.py", "line": 3, "detail": "d"}


def verdict(node="T1.task-review", sha="abc", findings=(), result=None, task="T1"):
    findings = list(findings)
    result = result or ("findings" if findings else "pass")
    return {"node": node, "task": task, "sha": sha, "result": result, "findings": findings}


def write_json(tmp, data, name="v.json"):
    p = tmp / name
    p.write_text(json.dumps(data))
    return p


def state_with_task(tmp_path, task="T1"):
    return init_run(tmp_path, 13, GRAPH, [task])


def test_findings_with_important_block(tmp_path):
    v = load_verdict(write_json(tmp_path, verdict(findings=[f("I1", "important")])))
    assert v.result == "findings" and v.blocking and v.findings[0].line == 3


def test_minor_findings_do_not_block(tmp_path):
    v = load_verdict(write_json(tmp_path, verdict(findings=[f("M1", "minor")])))
    assert v.result == "findings" and not v.blocking


def test_pass_has_no_findings(tmp_path):
    v = load_verdict(write_json(tmp_path, verdict()))
    assert v.result == "pass" and not v.blocking and v.findings == []


def test_bad_verdict_lists_every_problem(tmp_path):
    bad = {"node": "x", "result": "maybe", "findings": [{"severity": "huge"}]}
    with pytest.raises(VerdictError) as e:
        load_verdict(write_json(tmp_path, bad))
    msg = str(e.value)
    assert "result" in msg and "severity" in msg and "sha" in msg
    assert "findings[0].id" in msg and "findings[0].detail" in msg


def test_pass_with_blocking_finding_is_inconsistent(tmp_path):
    bad = verdict(findings=[f("C1", "critical")], result="pass")
    with pytest.raises(VerdictError, match="pass"):
        load_verdict(write_json(tmp_path, bad))


def test_unreadable_and_non_json_files(tmp_path):
    with pytest.raises(VerdictError, match="cannot read"):
        load_verdict(tmp_path / "missing.json")
    p = tmp_path / "x.json"
    p.write_text("{nope")
    with pytest.raises(VerdictError, match="not valid JSON"):
        load_verdict(p)


def test_schema_file_names_every_field():
    schema = json.loads((REPO / "workflow/schemas/verdict.schema.json").read_text())
    assert set(schema["properties"]) == {"node", "task", "sha", "result", "findings"}
    assert set(schema["properties"]["findings"]["items"]["properties"]) == {
        "id", "severity", "title", "file", "line", "detail"
    }  # fmt: skip


def test_ingest_appends_record(tmp_path):
    s = state_with_task(tmp_path)
    path = write_json(tmp_path, verdict(sha="abc"))
    rec = ingest(s, "T1.task-review", path, NOW, head="abc")
    assert s.reviews == [ReviewRecord("T1", "abc", "T1.task-review", "pass", str(path), NOW)]
    assert rec is s.reviews[0]


def test_ingest_rejects_stale_sha(tmp_path):
    s = state_with_task(tmp_path)
    with pytest.raises(VerdictError, match="sha"):
        ingest(s, "T1.task-review", write_json(tmp_path, verdict(sha="old")), NOW, head="new")
    assert s.reviews == []


def test_ingest_rejects_wrong_node_and_unknown_node(tmp_path):
    s = state_with_task(tmp_path)
    path = write_json(tmp_path, verdict(node="T2.task-review", sha="abc"))
    with pytest.raises(VerdictError, match="T2.task-review"):
        ingest(s, "T1.task-review", path, NOW, head="abc")
    with pytest.raises(RunStateError, match="unknown node"):
        ingest(s, "T9.task-review", path, NOW, head="abc")


def test_ingest_final_review_is_keyed_by_node(tmp_path):
    s = state_with_task(tmp_path)
    path = write_json(tmp_path, verdict(node="final-review", task=None, sha="abc"))
    assert ingest(s, "final-review", path, NOW, head="abc").task == "final-review"
