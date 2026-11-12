from pathlib import Path

import pytest

from pnw_health.config import (
    EXPECTED_COUNTY_COUNTS,
    STATES,
    Paths,
    census_api_key,
    state_abbr,
)


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


def test_census_api_key_from_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", "from-env")
    (tmp_path / ".env").write_text("CENSUS_API_KEY=from-file\n")
    assert census_api_key(tmp_path) == "from-env"


def test_census_api_key_from_dotenv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    (tmp_path / ".env").write_text('# comment\nOTHER=1\nCENSUS_API_KEY="abc123"\n')
    assert census_api_key(tmp_path) == "abc123"


def test_census_api_key_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    assert census_api_key(tmp_path) is None


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("export CENSUS_API_KEY=abc", "abc"),
        ("export   CENSUS_API_KEY=abc", "abc"),
        ("CENSUS_API_KEY=abc # note", "abc"),
        ('CENSUS_API_KEY="abc # not a comment"', "abc # not a comment"),
        ("CENSUS_API_KEY='abc' # note", "abc"),
        ("CENSUS_API_KEY=ab#c", "ab#c"),
        ("# CENSUS_API_KEY=abc", None),
        ("CENSUS_API_KEY= # note", None),
    ],
)
def test_census_api_key_dotenv_forms(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, line: str, expected: str | None
) -> None:
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    (tmp_path / ".env").write_text(f"{line}\n")
    assert census_api_key(tmp_path) == expected


@pytest.mark.parametrize("value", ["", "   ", "\t"])
def test_blank_env_key_falls_back_to_dotenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", value)
    (tmp_path / ".env").write_text("CENSUS_API_KEY=from-file\n")
    assert census_api_key(tmp_path) == "from-file"


def test_blank_env_key_without_dotenv_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", "   ")
    assert census_api_key(tmp_path) is None


def test_env_key_is_stripped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", "  abc  ")
    assert census_api_key(tmp_path) == "abc"
