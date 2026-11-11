from pathlib import Path

import httpx
import pytest

from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS
from pnw_health.sources.chr import (
    chr_cache_path,
    chr_url,
    fetch_chr,
    parse_chr,
    parse_chr_legacy,
)
from tests.helpers import make_indicator

HEADER = "statecode,countycode,fipscode,state,county,year,v147_rawvalue,v147_cilow,v147_cihigh"
LABELS = "State FIPS,County FIPS,5-digit FIPS,State,Name,Release Year,Life exp,low,high"


def chr_indicator(
    id_: str = "life_expectancy", code: str = "v147", scale: float = 1.0
) -> Indicator:
    return make_indicator(id_).model_copy(
        update={
            "source": "chr",
            "source_field": f"{code}_rawvalue",
            "source_scale": scale,
            "year": 2025,
            "ci_level": 0.95,
        }
    )


def write_csv(tmp_path: Path, rows: list[str], header: str = HEADER) -> Path:
    path = tmp_path / "chr.csv"
    path.write_text("\n".join([LABELS, header, *rows]) + "\n", encoding="latin-1")
    return path


def test_skips_state_and_national_rows(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        [
            "00,000,00000,US,United States,2025,78,77,79",
            "53,000,53000,WA,Washington,2025,79,78,80",
            "53,033,53033,WA,King,2025,81,80,82",
        ],
    )
    out = parse_chr(path, [chr_indicator()])
    assert list(out.columns) == LONG_COLUMNS
    assert list(out.fips) == ["53033"]
    assert (out.source == "chr").all()


def test_blanks_are_null(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        ["53,033,53033,WA,King,2025,,,", "53,001,53001,WA,Adams,2025,0,0,0"],
    )
    out = parse_chr(path, [chr_indicator()]).set_index("fips")
    assert out.loc["53033", "value"] != out.loc["53033", "value"]
    assert out.loc["53001", "value"] == 0.0


def test_scale_applies_to_value_and_ci(tmp_path: Path) -> None:
    path = write_csv(tmp_path, ["53,033,53033,WA,King,2025,0.25,0.2,0.3"])
    out = parse_chr(path, [chr_indicator(scale=100)])
    row = out.iloc[0]
    assert row.value == pytest.approx(25.0)
    assert row.ci_low == pytest.approx(20.0)
    assert row.ci_high == pytest.approx(30.0)


def test_missing_ci_columns_are_null(tmp_path: Path) -> None:
    header = "statecode,countycode,fipscode,state,county,year,v147_rawvalue"
    path = write_csv(tmp_path, ["53,033,53033,WA,King,2025,81"], header=header)
    row = parse_chr(path, [chr_indicator()]).iloc[0]
    assert row.value == 81.0
    assert row.ci_low != row.ci_low
    assert row.ci_high != row.ci_high


def test_blank_ci_columns_are_null(tmp_path: Path) -> None:
    path = write_csv(tmp_path, ["53,033,53033,WA,King,2025,81,,"])
    row = parse_chr(path, [chr_indicator()]).iloc[0]
    assert row.ci_low != row.ci_low


def test_non_chr_indicators_ignored(tmp_path: Path) -> None:
    path = write_csv(tmp_path, ["53,033,53033,WA,King,2025,81,80,82"])
    out = parse_chr(path, [chr_indicator(), make_indicator("acs_one")])
    assert set(out.indicator_id) == {"life_expectancy"}


def test_url_and_cache_path(tmp_path: Path) -> None:
    assert chr_url(2025) == (
        "https://www.countyhealthrankings.org/sites/default/files/media/document/"
        "analytic_data2025_v3.csv"
    )
    assert chr_cache_path(tmp_path, 2023) == tmp_path / "chr" / "analytic_data2023_0.csv"


def good_body() -> bytes:
    return "\n".join([LABELS, HEADER, "53,033,53033,WA,King,2025,81,80,82"]).encode("latin-1")


def test_fetch_caches_then_reuses(tmp_path: Path) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, content=good_body())

    with make_client(httpx.MockTransport(handler)) as client:
        path = fetch_chr(client, tmp_path, [chr_indicator()])
        fetch_chr(client, tmp_path, [chr_indicator()])
    assert path == chr_cache_path(tmp_path, 2025)
    assert len(calls) == 1


BAD_BODIES = {
    "html": b"<html>maintenance</html>",
    "missing-column": b"a,b\nx,y\n1,2\n",
}


@pytest.mark.parametrize("body", BAD_BODIES.values(), ids=BAD_BODIES.keys())
def test_missing_required_column_not_cached(tmp_path: Path, body: bytes) -> None:
    handler = lambda r: httpx.Response(200, content=body)  # noqa: E731
    with make_client(httpx.MockTransport(handler)) as client, pytest.raises(FetchError):
        fetch_chr(client, tmp_path, [chr_indicator()])
    assert not chr_cache_path(tmp_path, 2025).exists()
    assert not list((tmp_path / "chr").glob("*"))


def test_legacy_keeps_only_retired_fips(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        [
            "02,261,02261,AK,Valdez-Cordova,2023,0.5,0.4,0.6",
            "02,000,02000,AK,Alaska,2023,0.7,0.6,0.8",
            "53,033,53033,WA,King,2023,0.8,0.7,0.9",
        ],
    )
    out = parse_chr_legacy(path, [chr_indicator(scale=100.0)])
    assert list(out.columns) == LONG_COLUMNS
    assert out.fips.tolist() == ["02261"]
    assert out.year.tolist() == [2023]
    assert out.value.tolist() == [50.0]
    assert out.ci_low.tolist() == [40.0]


def test_legacy_skips_null_and_absent_fields(tmp_path: Path) -> None:
    path = write_csv(tmp_path, ["02,261,02261,AK,Valdez-Cordova,2023,,,"])
    absent = chr_indicator("other", code="v999")
    out = parse_chr_legacy(path, [chr_indicator(), absent])
    assert out.empty
    assert list(out.columns) == LONG_COLUMNS
