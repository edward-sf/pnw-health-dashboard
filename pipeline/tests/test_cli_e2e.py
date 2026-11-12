import csv
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
import pytest
from typer.testing import CliRunner, Result

from pnw_health import cli
from pnw_health.cli import Stage, StageInputError, run_pipeline
from pnw_health.config import CHR_LEGACY_YEAR, CHR_YEAR, Paths
from pnw_health.contract import Manifest, ModelFile, ValuesFile, write_schemas
from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import load_catalog
from pnw_health.model.config import TOP_N
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
    assert len(manifest.indicators) == 37
    assert {s.source for s in manifest.sources} == {"acs", "places", "chr", "boundaries"}
    assert sorted(s.year for s in manifest.sources if s.source == "chr") == [2023, 2025]
    assert len(values.root) == 37
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
        run_pipeline(paths, Stage.model, client=client)
        assert (paths.interim / "model.json").exists()
        run_pipeline(paths, Stage.export, client=client)
    assert (paths.out / "values.json").exists()
    assert (paths.out / "model.json").exists()


def test_full_run_writes_model(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    model = ModelFile.model_validate_json((paths.out / "model.json").read_text())
    assert len(model.counties) == 149
    assert "02013" in model.counties
    assert all(len(county.shap) <= TOP_N for county in model.counties.values())


def test_legacy_counties_are_insufficient_data(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    model = ModelFile.model_validate_json((paths.out / "model.json").read_text())
    for fips in ("02063", "02066"):
        assert model.counties[fips].flag == "insufficient_data"
        assert model.counties[fips].actual is None


def test_two_runs_are_byte_identical(tmp_path: Path, full_zip: Path) -> None:
    outputs = []
    for name in ("one", "two"):
        paths = Paths.default(tmp_path / name)
        with client_for(transport(full_zip)) as client:
            run_pipeline(paths, Stage.all, client=client, api_key="K")
        outputs.append((paths.out / "model.json").read_bytes())
    assert outputs[0] == outputs[1]


def test_model_stage_reports_dropped_counties(
    tmp_path: Path, full_zip: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    assert "model: 0 dropped county(ies)" in capsys.readouterr().err


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


def test_export_before_model_says_run_model(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key="K")
    with client_for(failing) as client:
        run_pipeline(paths, Stage.harmonize, client=client)
        with pytest.raises(StageInputError, match="--stage model"):
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
    # One legacy-only warning per ACS indicator (14) plus one per CHR indicator the 2023
    # fixture reports for 02261 where 2025 has no successor value (4); PLACES has none.
    assert "18 warning(s)" in capsys.readouterr().err
    assert len((paths.interim / "warnings.txt").read_text().splitlines()) == 18


def test_unreliable_flag_reaches_values_json(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    values = ValuesFile.model_validate_json((paths.out / "values.json").read_text())
    assert values.root["low_birth_weight"]["41063"].unreliable is True  # Wallowa, flag 1
    assert values.root["low_birth_weight"]["53033"].unreliable is False


def test_bad_legacy_value_stops_export(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key="K")
    cache = chr_cache_path(paths.raw, CHR_LEGACY_YEAR)
    rows = list(csv.reader(cache.read_text(encoding="latin-1").splitlines()))
    fips_at, life_at = rows[1].index("fipscode"), rows[1].index("v147_rawvalue")
    next(r for r in rows if r[fips_at] == "02261")[life_at] = "780"
    with cache.open("w", newline="", encoding="latin-1") as fh:
        csv.writer(fh, lineterminator="\n").writerows(rows)
    with client_for(failing) as client:
        run_pipeline(paths, Stage.harmonize, client=client)
        with pytest.raises(DataValidationError) as err:
            run_pipeline(paths, Stage.export, client=client)
    assert any(p.startswith("life_expectancy legacy:") for p in err.value.problems)
    assert not paths.out.exists() or not any(paths.out.iterdir())


def test_model_validation_failure_writes_nothing(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key="K")
    with client_for(failing) as client:
        run_pipeline(paths, Stage.harmonize, client=client)
        run_pipeline(paths, Stage.model, client=client)
        model_path = paths.interim / "model.json"
        model = ModelFile.model_validate_json(model_path.read_text())
        county = next(c for c in model.counties.values() if c.predicted is not None)
        county.predicted = county.predicted + 1.0
        model_path.write_text(model.model_dump_json())
        with pytest.raises(DataValidationError) as err:
            run_pipeline(paths, Stage.export, client=client)
    assert any("do not sum to the prediction" in p for p in err.value.problems)
    assert not paths.out.exists() or not any(paths.out.iterdir())


def test_export_rejects_model_built_from_other_national_data(
    tmp_path: Path, full_zip: Path
) -> None:
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key="K")
    with client_for(failing) as client:
        run_pipeline(paths, Stage.harmonize, client=client)
        run_pipeline(paths, Stage.model, client=client)
        long_path = paths.interim / "long.parquet"
        long = pd.read_parquet(long_path)
        outside_pnw = (long.fips.str[:2] == "06") & (long.indicator_id == "life_expectancy")
        assert outside_pnw.any()
        long.loc[outside_pnw, "value"] += 5.0
        long.to_parquet(long_path)
        with pytest.raises(StageInputError, match="--stage model"):
            run_pipeline(paths, Stage.export, client=client)
    assert not paths.out.exists() or not any(paths.out.iterdir())


def recording(seen: list[str]) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(500, text="network should not be used")

    return handler


def test_fetch_without_key_or_cache_fails_fast(tmp_path: Path) -> None:
    seen: list[str] = []
    with client_for(recording(seen)) as client, pytest.raises(StageInputError) as err:
        run_pipeline(
            Paths.default(tmp_path),
            Stage.fetch,
            client=client,
            api_key=None,
            env_file=tmp_path / ".env",
        )
    assert str(err.value) == f"CENSUS_API_KEY not set (environment or {tmp_path / '.env'})"
    assert seen == []


def _cache_acs(paths: Paths) -> None:
    dest = acs_cache_path(paths.raw, load_catalog())
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(ACS_SAMPLE.read_bytes())


def test_fetch_without_key_uses_acs_cache(tmp_path: Path, full_zip: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    _cache_acs(paths)
    seen: list[str] = []
    serve = transport(full_zip)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.host)
        return serve(request)

    with client_for(handler) as client:
        run_pipeline(paths, Stage.fetch, client=client, api_key=None)
    assert "api.census.gov" not in seen


def test_refresh_without_key_fails_fast(tmp_path: Path) -> None:
    paths = Paths.default(tmp_path / "repo")
    _cache_acs(paths)
    seen: list[str] = []
    with client_for(recording(seen)) as client, pytest.raises(StageInputError, match="not set"):
        run_pipeline(paths, Stage.fetch, client=client, api_key=None, refresh=True)
    assert seen == []


def test_cli_empty_env_key_fails_fast(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", "")
    seen: list[str] = []
    monkeypatch.setattr(cli, "make_client", lambda: client_for(recording(seen)))
    result = CliRunner().invoke(cli.app, ["run", "--stage", "fetch", "--root", str(tmp_path)])
    assert result.exit_code == 1
    assert "CENSUS_API_KEY not set" in result.output
    assert seen == []


def test_schema_command_writes_files(tmp_path: Path) -> None:
    result = CliRunner().invoke(cli.app, ["schema", "--root", str(tmp_path)])
    assert result.exit_code == 0, result.output
    reference = write_schemas(tmp_path / "ref")
    for ref in reference:
        written = tmp_path / "schema" / ref.name
        assert written.read_bytes() == ref.read_bytes()
        assert str(written) in result.output


def test_export_stages_outside_the_site(
    tmp_path: Path, full_zip: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A killed export must not leave files where Vite copies them (all of web/public)."""
    staged: list[Path] = []
    real = cli.write_exports

    def spy(*args: Any, staging: Path, **kwargs: Any) -> list[Path]:
        staged.append(staging)
        return real(*args, staging=staging, **kwargs)

    monkeypatch.setattr(cli, "write_exports", spy)
    paths = Paths.default(tmp_path / "repo")
    with client_for(transport(full_zip)) as client:
        run_pipeline(paths, Stage.all, client=client, api_key="K")
    assert staged == [paths.interim]
    assert not staged[0].is_relative_to(paths.out.parent)


def test_cli_reports_export_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from pnw_health.export import ExportError

    def boom(*args: object, **kwargs: object) -> None:
        raise ExportError("export stopped after replacing manifest.json")

    monkeypatch.setattr(cli, "run_pipeline", boom)
    result = CliRunner().invoke(cli.app, ["run", "--root", str(tmp_path)])
    assert result.exit_code == 1
    assert "export stopped after replacing manifest.json" in result.output


def test_bad_dotenv_does_not_block_stages_without_fetch(tmp_path: Path) -> None:
    """Only a stage that may download ACS reads the key, so a broken .env can't block others."""
    monkey_env = {"CENSUS_API_KEY": ""}
    (tmp_path / ".env").write_text('CENSUS_API_KEY="unclosed\n')
    result = CliRunner().invoke(
        cli.app, ["run", "--stage", "harmonize", "--root", str(tmp_path)], env=monkey_env
    )
    assert result.exit_code == 1
    assert "--stage fetch" in result.output
    assert "unclosed quote" not in result.output


def test_bad_dotenv_still_reported_for_fetch(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text('CENSUS_API_KEY="unclosed\n')
    result = CliRunner().invoke(
        cli.app,
        ["run", "--stage", "fetch", "--root", str(tmp_path)],
        env={"CENSUS_API_KEY": ""},
    )
    assert result.exit_code == 1
    assert "unclosed quote" in result.output
