import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from typer.testing import CliRunner

from pnw_health import cli
from pnw_health.cli import Stage, run_pipeline
from pnw_health.config import Paths
from pnw_health.contract import Manifest, ValuesFile
from pnw_health.fetch import FetchError, make_client
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
