import importlib.util
from pathlib import Path
from types import ModuleType

import httpx
import pytest

from pnw_health.fetch import FetchError, make_client

SCRIPT = Path(__file__).parents[1] / "scripts" / "record_fixtures.py"


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("record_fixtures", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_recorder_error_does_not_leak_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rf = load_script()
    monkeypatch.setattr(rf, "census_api_key", lambda root: "SECRET123")
    monkeypatch.setattr(rf, "FIXTURES", tmp_path)
    handler = lambda r: httpx.Response(400, text="error: unknown variable 'DP99'")  # noqa: E731
    with make_client(httpx.MockTransport(handler)) as client, pytest.raises(FetchError) as err:
        rf.record_acs_sample(client)
    assert "SECRET123" not in str(err.value)
    assert "unknown variable" in str(err.value)
    assert not any(tmp_path.iterdir())


def test_chr_recorder_skips_blank_rows(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rf = load_script()
    monkeypatch.setattr(rf, "FIXTURES", tmp_path)
    body = "\n".join(
        ["State,County,FIPS", "statecode,countycode,fipscode", "53,033,53033", "", "53,035,53035"]
    ).encode("latin-1")
    handler = lambda r: httpx.Response(200, content=body)  # noqa: E731
    with make_client(httpx.MockTransport(handler)) as client:
        out = rf._record_chr_file(client, 2023, ["statecode", "fipscode"], lambda f: True)
    lines = out.read_text(encoding="latin-1").splitlines()
    assert lines[2:] == ["53,53033", "53,53035"]
