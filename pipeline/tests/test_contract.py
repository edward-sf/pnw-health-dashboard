import json
from datetime import UTC, datetime
from pathlib import Path

from pnw_health.contract import Manifest, write_schemas
from pnw_health.indicators import Indicator
from tests.helpers import make_indicator

REPO_SCHEMA = Path(__file__).resolve().parents[2] / "schema"
STALE = "schema/ is out of date; run `uv run pnw-health schema --root ..` from pipeline/"


def test_write_schemas_files(tmp_path: Path) -> None:
    paths = write_schemas(tmp_path)
    assert sorted(p.name for p in paths) == [
        "manifest.schema.json",
        "model.schema.json",
        "values.schema.json",
    ]


def test_committed_schema_matches_models(tmp_path: Path) -> None:
    """Drift guard: after a contract change, run `uv run pnw-health schema --root ..`."""
    for path in write_schemas(tmp_path):
        committed = REPO_SCHEMA / path.name
        assert committed.exists(), f"missing {committed}; {STALE}"
        assert committed.read_text() == path.read_text(), f"{path.name}: {STALE}"


def test_source_scale_not_exported() -> None:
    ind = Indicator.model_validate({**make_indicator("x").model_dump(), "source_scale": 100.0})
    assert ind.source_scale == 100.0
    manifest = Manifest(
        schema_version="1.0.0", built_at=datetime.now(UTC), sources=[], indicators=[ind]
    )
    assert "source_scale" not in json.dumps(manifest.model_dump(mode="json"))
    assert "source_scale" not in json.dumps(Manifest.model_json_schema())
