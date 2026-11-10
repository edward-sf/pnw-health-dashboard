from pathlib import Path

from pnw_health.config import EXPECTED_COUNTY_COUNTS, STATES, Paths, state_abbr


def test_expected_total_is_149() -> None:
    assert sum(EXPECTED_COUNTY_COUNTS.values()) == 149


def test_states_cover_expected_counts() -> None:
    assert set(STATES.values()) == set(EXPECTED_COUNTY_COUNTS)


def test_state_abbr() -> None:
    assert state_abbr("02013") == "AK"
    assert state_abbr("53033") == "WA"
    assert state_abbr("06037") is None


def test_default_paths(tmp_path: Path) -> None:
    p = Paths.default(tmp_path)
    assert p.raw == tmp_path / "data" / "raw"
    assert p.interim == tmp_path / "data" / "interim"
    assert p.out == tmp_path / "web" / "public" / "data"
    assert p.schema == tmp_path / "schema"
