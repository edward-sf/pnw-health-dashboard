import json
import math
from pathlib import Path

import httpx
import pytest

from pnw_health.errors import InputError
from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import load_catalog
from pnw_health.long import LONG_COLUMNS
from pnw_health.sources.acs import acs_cache_path, fetch_acs, parse_acs
from tests.helpers import make_indicator

FIXTURE = Path(__file__).parents[1] / "fixtures" / "acs_profile_2024_sample.json"
VALID_BODY = json.dumps(
    [
        ["NAME", "DP03_0062E", "DP03_0062M", "DP03_0009PE", "DP03_0009PM", "state", "county"],
        ["A", "50000", "2500", "12.5", "1.5", "53", "001"],
    ]
).encode()
BAD_BODIES = {
    "html": b"<html>maintenance</html>",
    "not-a-table": b'{"error": "nope"}',
    "empty": b"[]",
    "header-only": json.dumps([json.loads(VALID_BODY)[0]]).encode(),
    "missing-field": b'[["NAME","state","county"],["A","53","001"]]',
    "no-county-columns": b'[["NAME","DP03_0062E","DP03_0062M","DP03_0009PE","DP03_0009PM"],'
    b'["A","1","1","1","1"]]',
}


def write_table(tmp_path: Path, rows: list[list[str]]) -> Path:
    path = tmp_path / "acs.json"
    header = ["NAME", "DP03_0062E", "DP03_0062M", "DP03_0009PE", "DP03_0009PM", "state", "county"]
    path.write_text(json.dumps([header, *rows]))
    return path


def two_indicators() -> list:  # type: ignore[type-arg]
    inc = make_indicator("income", unit="dollars").model_copy(
        update={"source_field": "DP03_0062E", "moe_field": "DP03_0062M"}
    )
    unemp = make_indicator("unemp").model_copy(
        update={"source_field": "DP03_0009PE", "moe_field": "DP03_0009PM"}
    )
    return [inc, unemp]


def by(df, fips: str, ind: str):  # type: ignore[no-untyped-def]
    return df[(df.fips == fips) & (df.indicator_id == ind)].iloc[0]


def test_parse_shape() -> None:
    df = parse_acs(FIXTURE, load_catalog())
    assert set(df.columns) == set(LONG_COLUMNS)
    assert df.fips.str.len().eq(5).all()
    assert df.fips.nunique() == 151
    assert len(df) == 151 * 14
    assert set(df.source) == {"acs"}
    assert set(df.year) == {2024}
    assert df[df.fips.str.startswith("02")].fips.nunique() == 30


def test_alaska_fips_zero_padded(tmp_path: Path) -> None:
    path = write_table(tmp_path, [["Juneau", "90000", "5000", "4.0", "1.0", "2", "110"]])
    df = parse_acs(path, two_indicators())
    assert set(df.fips) == {"02110"}


def test_sentinels_become_null(tmp_path: Path) -> None:
    path = write_table(
        tmp_path, [["A", "-666666666", "-222222222", "4.0", "-555555555", "53", "001"]]
    )
    df = parse_acs(path, two_indicators())
    inc = by(df, "53001", "income")
    assert math.isnan(inc.value) and math.isnan(inc.ci_low) and math.isnan(inc.ci_high)
    unemp = by(df, "53001", "unemp")
    assert unemp.value == 4.0
    assert math.isnan(unemp.ci_low) and math.isnan(unemp.ci_high)


def test_unparseable_and_null_cells_become_null(tmp_path: Path) -> None:
    path = write_table(tmp_path, [["A", None, "1", "N", "1", "53", "001"]])  # type: ignore[list-item]
    df = parse_acs(path, two_indicators())
    assert df.value.isna().all()


def test_ci_from_moe(tmp_path: Path) -> None:
    path = write_table(tmp_path, [["A", "50000", "2500", "12.5", "1.5", "53", "001"]])
    unemp = by(parse_acs(path, two_indicators()), "53001", "unemp")
    assert (unemp.value, unemp.ci_low, unemp.ci_high) == (12.5, 11.0, 14.0)


def test_indicator_without_moe_has_null_ci(tmp_path: Path) -> None:
    path = write_table(tmp_path, [["A", "50000", "2500", "12.5", "1.5", "53", "001"]])
    cat = [two_indicators()[0].model_copy(update={"moe_field": None})]
    inc = by(parse_acs(path, cat), "53001", "income")
    assert inc.value == 50000.0 and math.isnan(inc.ci_low)


def test_fetch_acs_requests_national_profile(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=VALID_BODY)

    with make_client(httpx.MockTransport(handler)) as client:
        path = fetch_acs(client, tmp_path, two_indicators(), api_key="K")
        fetch_acs(client, tmp_path / "nokey", two_indicators())
    assert path == acs_cache_path(tmp_path, two_indicators())
    req = seen[0]
    assert req.url.path == "/data/2024/acs/acs5/profile"
    assert req.url.params["get"] == "NAME,DP03_0062E,DP03_0062M,DP03_0009PE,DP03_0009PM"
    assert req.url.params["for"] == "county:*"
    assert "in" not in req.url.params
    assert req.url.params["key"] == "K"
    assert "key" not in seen[1].url.params


def test_too_many_fields_rejected(tmp_path: Path) -> None:
    base = two_indicators()[1]
    cat = [
        base.model_copy(update={"id": f"i{n}", "source_field": f"F{n}E", "moe_field": f"F{n}M"})
        for n in range(25)
    ]
    with make_client(httpx.MockTransport(lambda r: httpx.Response(200))) as client:
        with pytest.raises(InputError, match="50"):
            fetch_acs(client, tmp_path, cat)


def test_cache_name_tracks_fields(tmp_path: Path) -> None:
    both, one = two_indicators(), two_indicators()[:1]
    assert acs_cache_path(tmp_path, both) == acs_cache_path(tmp_path, list(both))
    assert acs_cache_path(tmp_path, both) != acs_cache_path(tmp_path, one)
    renamed = [one[0].model_copy(update={"moe_field": "DP03_0062PM"})]
    assert acs_cache_path(tmp_path, one) != acs_cache_path(tmp_path, renamed)
    path = acs_cache_path(tmp_path, both)
    assert path.parent == tmp_path / "acs"
    assert path.name.startswith("acs5_profile_2024_") and path.suffix == ".json"


def test_ci_clipped_to_unit_bounds(tmp_path: Path) -> None:
    path = write_table(
        tmp_path,
        [
            ["A", "100", "500", "0.8", "1.2", "53", "001"],
            ["B", "100", "5", "99.5", "1.0", "53", "003"],
        ],
    )
    df = parse_acs(path, two_indicators())
    low = by(df, "53001", "unemp")
    assert (low.ci_low, low.ci_high) == (0.0, 2.0)
    assert by(df, "53003", "unemp").ci_high == 100.0
    assert by(df, "53001", "income").ci_low == 0.0


def test_ci_has_no_float_noise(tmp_path: Path) -> None:
    path = write_table(tmp_path, [["A", "1", "1", "2.6", "1.2", "53", "001"]])
    assert by(parse_acs(path, two_indicators()), "53001", "unemp").ci_low == 1.4


@pytest.mark.parametrize("body", BAD_BODIES.values(), ids=BAD_BODIES.keys())
def test_bad_response_is_not_cached(tmp_path: Path, body: bytes) -> None:
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=body))
    with make_client(transport) as client, pytest.raises(FetchError):
        fetch_acs(client, tmp_path, two_indicators(), api_key="SECRET")
    assert not acs_cache_path(tmp_path, two_indicators()).exists()


def test_bad_response_error_omits_key(tmp_path: Path) -> None:
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=b"<html>"))
    with make_client(transport) as client, pytest.raises(FetchError) as err:
        fetch_acs(client, tmp_path, two_indicators(), api_key="SECRET")
    assert "SECRET" not in str(err.value)


@pytest.mark.parametrize("body", BAD_BODIES.values(), ids=BAD_BODIES.keys())
def test_bad_existing_cache_says_refresh(tmp_path: Path, body: bytes) -> None:
    # A file cached before responses were validated must not crash with a traceback.
    path = tmp_path / "acs.json"
    path.write_bytes(body)
    with pytest.raises(FetchError, match="--refresh"):
        parse_acs(path, two_indicators())
