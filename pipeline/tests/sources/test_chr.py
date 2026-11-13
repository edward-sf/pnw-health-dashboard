import csv
import io
from pathlib import Path

import httpx
import pandas as pd
import pytest

from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import Indicator, load_catalog
from pnw_health.long import LONG_COLUMNS
from pnw_health.sources.chr import (
    STRATA_COLUMNS,
    chr_cache_path,
    chr_url,
    fetch_chr,
    parse_chr,
    parse_chr_legacy,
    parse_chr_strata,
)
from tests.helpers import make_indicator

CHR_SAMPLE = Path(__file__).parents[1] / "fixtures" / "chr_2025_sample.csv"

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


FLAG_HEADER = f"{HEADER},v147_flag"


@pytest.mark.parametrize(
    ("flag", "expected"), [("1", True), ("0", False), ("2", False), ("", False)]
)
def test_only_flag_one_is_unreliable(tmp_path: Path, flag: str, expected: bool) -> None:
    path = write_csv(tmp_path, [f"53,033,53033,WA,King,2025,81,80,82,{flag}"], header=FLAG_HEADER)
    assert bool(parse_chr(path, [chr_indicator()]).iloc[0].unreliable) is expected


def test_absent_flag_column_is_not_unreliable(tmp_path: Path) -> None:
    path = write_csv(tmp_path, ["53,033,53033,WA,King,2025,81,80,82"])
    assert not parse_chr(path, [chr_indicator()]).unreliable.any()


def test_fetch_fails_when_ci_column_missing(tmp_path: Path) -> None:
    header = HEADER.replace(",v147_cilow", "")
    labels = LABELS.replace(",low", "")
    body = "\n".join([labels, header, "53,033,53033,WA,King,2025,81,82"]).encode("latin-1")
    handler = lambda r: httpx.Response(200, content=body)  # noqa: E731
    with (
        make_client(httpx.MockTransport(handler)) as client,
        pytest.raises(FetchError, match="v147_cilow"),
    ):
        fetch_chr(client, tmp_path, [chr_indicator()])


def test_fetch_does_not_need_ci_columns_without_ci_level(tmp_path: Path) -> None:
    header = "statecode,countycode,fipscode,state,county,year,v147_rawvalue"
    labels = "State FIPS,County FIPS,5-digit FIPS,State,Name,Release Year,Life exp"
    body = "\n".join([labels, header, "53,033,53033,WA,King,2025,81"]).encode("latin-1")
    handler = lambda r: httpx.Response(200, content=body)  # noqa: E731
    no_ci = chr_indicator().model_copy(update={"ci_level": None})
    with make_client(httpx.MockTransport(handler)) as client:
        fetch_chr(client, tmp_path, [no_ci])


@pytest.fixture(scope="module")
def strata() -> pd.DataFrame:
    return parse_chr_strata(CHR_SAMPLE, load_catalog())


def stratum(strata: pd.DataFrame, ind: str, fips: str, group: str) -> pd.DataFrame:
    return strata[(strata.indicator_id == ind) & (strata.fips == fips) & (strata.group == group)]


def test_strata_values_cis_and_scale(strata: pd.DataFrame) -> None:
    assert list(strata.columns) == STRATA_COLUMNS
    # Yakima: CHR's low birth weight is a proportion; the catalog's is a percent.
    row = stratum(strata, "low_birth_weight", "53077", "white").iloc[0]
    assert row.value == pytest.approx(5.99421877)
    assert row.ci_low == pytest.approx(5.42034308)
    assert row.ci_high == pytest.approx(6.56809447)
    assert not row.unreliable
    life = stratum(strata, "life_expectancy", "53077", "aian").iloc[0]
    assert (life.value, life.ci_low, life.ci_high) == pytest.approx(
        (57.378306, 55.369509, 59.387103)
    )


def test_strata_premature_death_flag_1_is_unreliable(strata: pd.DataFrame) -> None:
    assert bool(stratum(strata, "premature_death", "53077", "asian").iloc[0].unreliable)
    assert not bool(stratum(strata, "premature_death", "53077", "white").iloc[0].unreliable)


def test_strata_blank_value_has_no_row(strata: pd.DataFrame) -> None:
    # Yakima NHPI premature death is suppressed (flag 2, blank value).
    assert stratum(strata, "premature_death", "53077", "nhopi").empty
    assert strata.value.notna().all()


def test_strata_only_listed_groups(strata: pd.DataFrame) -> None:
    groups = {i.id: set(i.race_groups or ()) for i in load_catalog() if i.race_groups}
    assert set(strata.indicator_id) == set(groups)
    for ind_id, listed in groups.items():
        assert set(strata[strata.indicator_id == ind_id].group) <= listed
    assert "tom" in set(strata[strata.indicator_id == "low_birth_weight"].group)


def test_strata_preventable_stays_have_null_cis(strata: pd.DataFrame) -> None:
    stays = strata[strata.indicator_id == "preventable_hospital_stays"]
    assert not stays.empty
    assert stays.ci_low.isna().all()
    assert stays.ci_high.isna().all()
    assert stratum(strata, "preventable_hospital_stays", "53077", "white").iloc[0].value == 2422


def test_strata_drops_state_and_national_rows(strata: pd.DataFrame) -> None:
    assert not strata.fips.isin(["00000", "53000"]).any()
    assert not strata.fips.str.endswith("000").any()
    assert {"53033", "06037"} <= set(strata.fips)


@pytest.mark.parametrize(
    "column", ["v147_race_white", "v147_race_white_cilow", "v001_race_aian_flag"]
)
def test_fetch_check_requires_race_columns(tmp_path: Path, column: str) -> None:
    rows = list(csv.reader(CHR_SAMPLE.read_text(encoding="latin-1").splitlines()))
    drop = rows[1].index(column)
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(r[:drop] + r[drop + 1 :] for r in rows)
    body = out.getvalue().encode("latin-1")
    handler = lambda r: httpx.Response(200, content=body)  # noqa: E731
    with (
        make_client(httpx.MockTransport(handler)) as client,
        pytest.raises(FetchError, match=column),
    ):
        fetch_chr(client, tmp_path, load_catalog())


def test_fetch_accepts_the_recorded_sample(tmp_path: Path) -> None:
    handler = lambda r: httpx.Response(200, content=CHR_SAMPLE.read_bytes())  # noqa: E731
    with make_client(httpx.MockTransport(handler)) as client:
        fetch_chr(client, tmp_path, load_catalog())
