import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from typer.testing import CliRunner, Result

from pnw_health import cli
from pnw_health.cli import Stage, StageInputError, run_pipeline
from pnw_health.config import CHR_LEGACY_YEAR, CHR_YEAR, Paths
from pnw_health.contract import Manifest, ValuesFile
from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import load_catalog
from pnw_health.sources.acs import acs_cache_path
from pnw_health.sources.chr import chr_cache_path
from pnw_health.sources.places import places_cache_path
from pnw_health.validate import DataValidationError
from tests.helpers import make_boundary_zip

FIXTURES = Path(__file__).parent / "fixtures"
ACS_SAMPLE = FIXTURES / "acs_profile_2024_sample.json"
PLACES_SAMPLE = FIXTURES / "places_2025_sample.json"
CHR_SAMPLE = FIXTURES / "chr_2025_sample.csv"
CHR_LEGACY_SAMPLE = FIXTURES / "chr_2023_sample.csv"


def sample_pnw_fips() -> list[str]:
    _, *rows = json.loads(ACS_SAMPLE.read_text())
    fips = [r[-2] + r[-1] for r in rows]
    return [f for f in fips if f[:2] in {"53", "41", "16", "02"}]


def transport(boundary_zip: Path) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.census.gov":
            return httpx.Response(200, content=ACS_SAMPLE.read_bytes())
        if request.url.host == "data.cdc.gov":
            return httpx.Response(200, content=PLACES_SAMPLE.read_bytes())
        if request.url.host == "www.countyhealthrankings.org":
            sample = CHR_LEGACY_SAMPLE if request.url.path.endswith("2023_0.csv") else CHR_SAMPLE
            return httpx.Response(200, content=sample.read_bytes())
        if request.url.path.endswith("cb_2024_us_county_5m.zip"):
            return httpx.Response(200, content=boundary_zip.read_bytes())
        return httpx.Response(404)

    return handler


def failing(request: httpx.Request) -> httpx.Response:
    return httpx.Response(500, text="network should not be used")


def client_for(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.Client:
    return make_client(httpx.MockTransport(handler))


@pytest.fixture
def full_zip(tmp_path: Path) -> Path:
    return make_boundary_zip(tmp_path / "zip" / "b.zip", [*sample_pnw_fips(), "06037"])


def test_full_run_produces_valid_exports(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    manifest = Manifest.model_validate_json((paths.out / "manifest.json").read_text())
    values = ValuesFile.model_validate_json((paths.out / "values.json").read_text())
    topo = json.loads((paths.out / "counties.topojson").read_text())
    assert len(manifest.indicators) == 29
    assert {s.source for s in manifest.sources} == {"acs", "places", "chr", "boundaries"}
    assert sorted(s.year for s in manifest.sources if s.source == "chr") == [2023, 2025]
    assert len(values.root) == 29
    assert all(len(entries) == 149 for entries in values.root.values())
    assert len(topo["objects"]["counties"]["geometries"]) == 149
    assert (paths.interim / "warnings.txt").exists()


def test_chugach_gets_labeled_legacy(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    values = ValuesFile.model_validate_json((paths.out / "values.json").read_text())
    for fips in ("02063", "02066"):
        entry = values.root["life_expectancy"][fips]
        assert entry.v is None
        assert entry.legacy is not None
        assert entry.legacy.year == 2023
        assert entry.legacy.fips == "02261"


def test_validation_failure_writes_nothing(tmp_path: Path) -> None:
    missing_one_ak = [f for f in sample_pnw_fips() if f != "02013"]
    zp = make_boundary_zip(tmp_path / "zip" / "b.zip", missing_one_ak)
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(zp)) as client, pytest.raises(DataValidationError) as err:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    assert "county count AK: expected 30, got 29" in err.value.problems
    assert not paths.out.exists() or not any(paths.out.iterdir())


def test_stages_are_resumable(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key="K")
    with client_for(failing) as client:
        run_pipeline(paths, Stage.harmonize, client=client)
        run_pipeline(paths, Stage.export, client=client)
    assert (paths.out / "values.json").exists()


def test_fetch_error_propagates(tmp_path: Path) -> None:
    with client_for(failing) as client, pytest.raises(FetchError):
        run_pipeline(Paths.default(tmp_path), Stage.fetch, client=client, api_key="K")


def test_cli_exit_code(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def boom(*args: object, **kwargs: object) -> None:
        raise DataValidationError(["something is wrong"])

    monkeypatch.setattr(cli, "run_pipeline", boom)
    result = CliRunner().invoke(cli.app, ["run", "--root", str(tmp_path)])
    assert result.exit_code == 1
    assert "something is wrong" in result.output


def test_harmonize_before_fetch_says_run_fetch(tmp_path: Path) -> None:
    with client_for(failing) as client, pytest.raises(StageInputError, match="--stage fetch"):
        run_pipeline(Paths.default(tmp_path), Stage.harmonize, client=client)


def test_export_before_harmonize_says_run_harmonize(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key="K")
    with client_for(failing) as client, pytest.raises(StageInputError, match="--stage harmonize"):
        run_pipeline(paths, Stage.export, client=client)


def test_cli_reports_stage_input_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def boom(*args: object, **kwargs: object) -> None:
        raise StageInputError("run --stage fetch first")

    monkeypatch.setattr(cli, "run_pipeline", boom)
    result = CliRunner().invoke(cli.app, ["run", "--root", str(tmp_path)])
    assert result.exit_code == 1
    assert "run --stage fetch first" in result.output


def write_acs_cache(paths: Paths, rows_edit: Callable[[list[list[str]]], list[list[str]]]) -> None:
    """Put the recorded ACS sample (edited) and PLACES and CHR samples in the cache."""
    header, *rows = json.loads(ACS_SAMPLE.read_text())
    cache = acs_cache_path(paths.raw, load_catalog())
    cache.parent.mkdir(parents=True)
    cache.write_text(json.dumps([header, *rows_edit(rows)]))
    places_cache = places_cache_path(paths.raw, load_catalog())
    places_cache.parent.mkdir(parents=True)
    places_cache.write_bytes(PLACES_SAMPLE.read_bytes())
    chr_cache = chr_cache_path(paths.raw, CHR_YEAR)
    chr_cache.parent.mkdir(parents=True)
    chr_cache.write_bytes(CHR_SAMPLE.read_bytes())
    legacy_cache = chr_cache_path(paths.raw, CHR_LEGACY_YEAR)
    legacy_cache.write_bytes(CHR_LEGACY_SAMPLE.read_bytes())


def run_harmonize_cli(root: Path) -> Result:
    return CliRunner().invoke(cli.app, ["run", "--stage", "harmonize", "--root", str(root)])


def test_cli_reports_duplicate_counties_without_traceback(tmp_path: Path) -> None:
    def add_wade_hampton(rows: list[list[str]]) -> list[list[str]]:
        kusilvak = next(r for r in rows if r[-2:] == ["02", "158"])
        return [*rows, [*kusilvak[:-1], "270"]]  # 02270 renames onto the existing 02158

    write_acs_cache(Paths.default(tmp_path), add_wade_hampton)
    result = run_harmonize_cli(tmp_path)
    assert result.exit_code == 1
    assert isinstance(result.exception, SystemExit)
    assert "duplicate (fips, indicator_id)" in result.output


def test_cli_reports_corrupt_cache_without_traceback(tmp_path: Path) -> None:
    cache = acs_cache_path(Paths.default(tmp_path).raw, load_catalog())
    cache.parent.mkdir(parents=True)
    cache.write_text("<html>maintenance</html>")
    result = run_harmonize_cli(tmp_path)
    assert result.exit_code == 1
    assert isinstance(result.exception, SystemExit)
    assert "--refresh" in result.output


def test_bad_census_response_stops_the_run_and_is_retried(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    bad_html = lambda r: httpx.Response(200, text="<html>maintenance</html>")  # noqa: E731
    with client_for(bad_html) as client, pytest.raises(FetchError):
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    assert (paths.out / "values.json").exists()


def test_harmonize_reports_warning_count(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    def report_only_valdez_cordova(rows: list[list[str]]) -> list[list[str]]:
        kept = [r for r in rows if r[-2:] not in (["02", "063"], ["02", "066"])]
        chugach = next(r for r in rows if r[-2:] == ["02", "063"])
        return [*kept, [*chugach[:-1], "261"]]

    paths = Paths.default(tmp_path)
    write_acs_cache(paths, report_only_valdez_cordova)
    with client_for(failing) as client:
        run_pipeline(paths, Stage.harmonize, client=client)
    # One legacy-only warning per ACS indicator (6) plus one per CHR indicator the 2023
    # fixture reports for 02261 where 2025 has no successor value (4); PLACES has none.
    assert "10 warning(s)" in capsys.readouterr().err
    assert len((paths.interim / "warnings.txt").read_text().splitlines()) == 10
