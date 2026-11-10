import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from typer.testing import CliRunner, Result

from pnw_health import cli
from pnw_health.cli import Stage, StageInputError, run_pipeline
from pnw_health.config import Paths
from pnw_health.contract import Manifest, ValuesFile
from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import load_catalog
from pnw_health.sources.acs import acs_cache_path
from pnw_health.validate import DataValidationError
from tests.helpers import make_boundary_zip

FIXTURES = Path(__file__).parent / "fixtures"
ACS_SAMPLE = FIXTURES / "acs_profile_2024_sample.json"


def sample_pnw_fips() -> list[str]:
    _, *rows = json.loads(ACS_SAMPLE.read_text())
    fips = [r[-2] + r[-1] for r in rows]
    return [f for f in fips if f[:2] in {"53", "41", "16", "02"}]


def transport(boundary_zip: Path) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.census.gov":
            return httpx.Response(200, content=ACS_SAMPLE.read_bytes())
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
    assert len(manifest.indicators) == 6
    assert {s.source for s in manifest.sources} == {"acs", "boundaries"}
    assert len(values.root) == 6
    assert all(len(entries) == 149 for entries in values.root.values())
    assert len(topo["objects"]["counties"]["geometries"]) == 149
    assert (paths.interim / "warnings.txt").exists()


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
    """Put the recorded ACS sample in the cache, after editing its data rows."""
    header, *rows = json.loads(ACS_SAMPLE.read_text())
    cache = acs_cache_path(paths.raw, load_catalog())
    cache.parent.mkdir(parents=True)
    cache.write_text(json.dumps([header, *rows_edit(rows)]))


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
    # One legacy-only warning per catalog indicator.
    assert "6 warning(s)" in capsys.readouterr().err
    assert len((paths.interim / "warnings.txt").read_text().splitlines()) == 6
