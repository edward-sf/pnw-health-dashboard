from pathlib import Path

from pnw_health.contract import write_schemas

REPO_SCHEMA = Path(__file__).resolve().parents[2] / "schema"


def test_write_schemas_files(tmp_path: Path) -> None:
    paths = write_schemas(tmp_path)
    assert sorted(p.name for p in paths) == ["manifest.schema.json", "values.schema.json"]


def test_committed_schema_matches_models(tmp_path: Path) -> None:
    """Drift guard: regenerate with `write_schemas(Path('../schema'))` after contract changes."""
    for path in write_schemas(tmp_path):
        committed = REPO_SCHEMA / path.name
        assert committed.exists(), f"missing {committed}"
        assert committed.read_text() == path.read_text(), f"{path.name} is stale"
