import pandas as pd
import pytest

from pnw_health import validate
from pnw_health.contract import ModelFile, PeerMethod, Peers, ShapEntry
from pnw_health.harmonize import LEGACY_COLUMNS
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS
from pnw_health.model.config import TARGETS as real_targets
from pnw_health.validate import DataValidationError, validate_display, validate_model
from tests.helpers import make_county_model, make_model_file, make_null_county_model, pnw_fips


@pytest.fixture(autouse=True)
def _single_target(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most fixtures hold one target, so stand in for the three-target TARGETS."""
    monkeypatch.setattr(validate, "TARGETS", ("life_expectancy",))


def indicator(id_: str, unit: str) -> Indicator:
    return Indicator.model_validate(
        {
            "id": id_,
            "label": id_,
            "unit": unit,
            "source": "acs",
            "source_field": "X",
            "moe_field": None,
            "ci_level": None,
            "year": 2024,
            "category": "Social & Economic",
            "direction": "higher_is_worse",
            "description": "d",
        }
    )


CATALOG = [indicator("pct", "percent"), indicator("usd", "dollars")]


def valid_values(fips: list[str]) -> pd.DataFrame:
    rows = [
        {
            "fips": f,
            "indicator_id": ind.id,
            "year": 2024,
            "value": 50.0,
            "ci_low": None,
            "ci_high": None,
            "source": "acs",
        }
        for f in fips
        for ind in CATALOG
    ]
    return pd.DataFrame(rows, columns=LONG_COLUMNS)


def problems(values: pd.DataFrame, counties: set[str]) -> list[str]:
    with pytest.raises(DataValidationError) as err:
        validate_display(values, counties, CATALOG)
    return err.value.problems


def test_valid_data_passes() -> None:
    fips = pnw_fips()
    validate_display(valid_values(fips), set(fips), CATALOG)


def test_nan_values_allowed() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[0, "value"] = float("nan")
    validate_display(v, set(fips), CATALOG)


def test_county_count_per_state() -> None:
    fips = [f for f in pnw_fips() if f != "02001"]
    assert problems(valid_values(fips), set(fips)) == ["county count AK: expected 30, got 29"]


def test_non_pnw_county_in_boundaries() -> None:
    fips = pnw_fips()
    found = problems(valid_values(fips), set(fips) | {"06037"})
    assert found == ["boundaries include non-PNW counties: 06037"]


def test_unknown_fips_in_values() -> None:
    fips = pnw_fips()
    v = pd.concat([valid_values(fips), valid_values(["53999"]).iloc[:1]])
    assert problems(v, set(fips)) == ["values reference unknown counties: 53999"]


def test_duplicate_keys() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v = pd.concat([v, v.iloc[:1]])
    assert problems(v, set(fips)) == ["duplicate (fips, indicator_id): 53001/pct"]


def test_percent_out_of_range() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[(v.fips == "53001") & (v.indicator_id == "pct"), "value"] = 101.0
    assert problems(v, set(fips)) == ["pct: 1 value(s) outside [0, 100] (e.g. 53001=101.0)"]


def test_negative_dollars() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[(v.fips == "41001") & (v.indicator_id == "usd"), "value"] = -666666666.0
    assert problems(v, set(fips)) == ["usd: 1 value(s) negative (e.g. 41001=-666666666.0)"]


def test_indicator_without_data() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[v.indicator_id == "usd", "value"] = float("nan")
    assert problems(v, set(fips)) == ["usd: no non-null values"]


def test_collects_all_problems() -> None:
    fips = [f for f in pnw_fips() if f != "02001"]
    v = valid_values(fips)
    v.loc[v.index[0], "value"] = 150.0
    found = problems(v, set(fips))
    assert len(found) == 2  # AK count, out-of-range
    assert "\n" in str(DataValidationError(found))


def years_indicator() -> Indicator:
    return indicator("life", "years")


@pytest.mark.parametrize("bad", [-1.0, 121.0])
def test_years_out_of_range(bad: float) -> None:
    fips = pnw_fips()
    catalog = [years_indicator()]
    v = valid_values(fips)
    v = v[v.indicator_id == "pct"].assign(indicator_id="life", value=65.0)
    v.loc[v.index[0], "value"] = bad
    with pytest.raises(DataValidationError) as err:
        validate_display(v, set(fips), catalog)
    assert any("outside [0, 120]" in p for p in err.value.problems)


def test_years_in_range() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v = v[v.indicator_id == "pct"].assign(indicator_id="life", value=65.0)
    validate_display(v, set(fips), [years_indicator()])


def legacy_row(indicator_id: str, value: float) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "fips": "02063",
                "indicator_id": indicator_id,
                "legacy_fips": "02261",
                "legacy_name": "Valdez-Cordova Census Area (former)",
                "year": 2023,
                "value": value,
                "ci_low": None,
                "ci_high": None,
            }
        ],
        columns=LEGACY_COLUMNS,
    )


def test_legacy_out_of_range() -> None:
    fips = pnw_fips()
    with pytest.raises(DataValidationError) as err:
        validate_display(valid_values(fips), set(fips), CATALOG, legacy_row("pct", 447.0))
    assert err.value.problems == ["pct legacy: 1 value(s) outside [0, 100] (e.g. 02063=447.0)"]


def test_legacy_in_range_passes() -> None:
    fips = pnw_fips()
    validate_display(valid_values(fips), set(fips), CATALOG, legacy_row("pct", 4.5))


MODEL_CATALOG = [
    indicator("poverty_rate", "percent"),
    Indicator.model_validate(
        {**indicator("obesity", "percent").model_dump(), "category": "Behaviors"}
    ),
]
WITH_TARGET = "53001"
NO_TARGET = "02063"
MODEL_COUNTIES = {WITH_TARGET, NO_TARGET}


def target_rows(feature_value: float | None = 10.0) -> pd.DataFrame:
    def row(fips: str, indicator_id: str, value: float | None) -> dict[str, object]:
        return {
            "fips": fips,
            "indicator_id": indicator_id,
            "year": 2025,
            "value": value,
            "ci_low": None,
            "ci_high": None,
            "source": "chr",
        }

    rows = [
        row(WITH_TARGET, "life_expectancy", 78.0),
        row(NO_TARGET, "life_expectancy", float("nan")),
        row(WITH_TARGET, "injury_deaths", 78.0),
        row(NO_TARGET, "injury_deaths", float("nan")),
        row(WITH_TARGET, "poverty_rate", feature_value),
    ]
    return pd.DataFrame(rows, columns=LONG_COLUMNS)


def model_problems(model: ModelFile, values: pd.DataFrame | None = None) -> list[str]:
    values = target_rows() if values is None else values
    with pytest.raises(DataValidationError) as err:
        validate_model(model, values, MODEL_COUNTIES, MODEL_CATALOG)
    return err.value.problems


def test_valid_model_passes() -> None:
    model = make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()})
    validate_model(model, target_rows(), MODEL_COUNTIES, MODEL_CATALOG)


def test_model_missing_county() -> None:
    peers = peers_of({WITH_TARGET: [], NO_TARGET: []})
    model = make_model_file({WITH_TARGET: make_county_model()}, peers=peers)
    assert model_problems(model) == [f"life_expectancy: model is missing counties: {NO_TARGET}"]


def test_model_flag_where_target_present() -> None:
    model = make_model_file(
        {WITH_TARGET: make_null_county_model(), NO_TARGET: make_null_county_model()}
    )
    assert model_problems(model) == [
        f"life_expectancy: model flags counties insufficient_data despite a target: {WITH_TARGET}"
    ]


def test_model_flag_missing_where_target_null() -> None:
    model = make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_county_model()})
    assert model_problems(model) == [
        f"life_expectancy: model is not insufficient_data for counties with no target: {NO_TARGET}"
    ]


def test_model_additivity_broken() -> None:
    model = make_model_file(
        {
            WITH_TARGET: make_county_model(predicted=77.00001),
            NO_TARGET: make_null_county_model(),
        }
    )
    assert model_problems(model) == [
        f"life_expectancy: model contributions do not sum to the prediction: {WITH_TARGET}"
    ]


def test_model_additivity_needs_a_prediction() -> None:
    model = make_model_file(
        {WITH_TARGET: make_county_model(predicted=None), NO_TARGET: make_null_county_model()}
    )
    assert model_problems(model) == [
        f"life_expectancy: model contributions do not sum to the prediction: {WITH_TARGET}"
    ]


@pytest.mark.parametrize("feature", ["obesity", "not_in_catalog"])
def test_model_excluded_feature_present(feature: str) -> None:
    model = make_model_file(
        {WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()},
        features=["poverty_rate", feature],
    )
    assert model_problems(model) == [
        f"life_expectancy: model uses features outside allowed categories: {feature}"
    ]


RERUN = "re-run `pnw-health run --stage model`"


def valid_model() -> ModelFile:
    return make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()})


def test_model_actual_differs_from_data() -> None:
    model = make_model_file(
        {
            WITH_TARGET: make_county_model(actual=83.0, residual=6.0),
            NO_TARGET: make_null_county_model(),
        }
    )
    assert model_problems(model) == [
        f"life_expectancy: model actual does not match the current data for: {WITH_TARGET}; {RERUN}"
    ]


def test_model_shap_value_differs_from_data() -> None:
    assert model_problems(valid_model(), target_rows(feature_value=5.0)) == [
        "life_expectancy: model SHAP feature values do not match the current data for: "
        f"{WITH_TARGET}; {RERUN}"
    ]


def test_model_shap_null_value_needs_missing_feature() -> None:
    model = make_model_file(
        {
            WITH_TARGET: make_county_model(
                shap=[ShapEntry(feature="poverty_rate", value=None, contribution=1.0)]
            ),
            NO_TARGET: make_null_county_model(),
        }
    )
    assert model_problems(model) == [
        "life_expectancy: model SHAP feature values do not match the current data for: "
        f"{WITH_TARGET}; {RERUN}"
    ]


def test_model_shap_null_value_matches_missing_feature() -> None:
    model = make_model_file(
        {
            WITH_TARGET: make_county_model(
                shap=[ShapEntry(feature="poverty_rate", value=None, contribution=1.0)]
            ),
            NO_TARGET: make_null_county_model(),
        }
    )
    validate_model(model, target_rows(feature_value=None), MODEL_COUNTIES, MODEL_CATALOG)


def test_model_has_county_outside_the_pnw() -> None:
    model = make_model_file(
        {
            WITH_TARGET: make_county_model(),
            NO_TARGET: make_null_county_model(),
            "06037": make_null_county_model(),
        }
    )
    assert model_problems(model) == [
        f"life_expectancy: model has counties outside the PNW: 06037; {RERUN}"
    ]


def test_state_with_no_rows_fails() -> None:
    fips = pnw_fips()
    values = valid_values(fips)
    values = values[~((values.indicator_id == "pct") & values.fips.str.startswith("02"))]
    assert "pct: no values for AK" in problems(values, set(fips))


def test_state_with_all_null_values_fails() -> None:
    fips = pnw_fips()
    values = valid_values(fips)
    values.loc[(values.indicator_id == "pct") & values.fips.str.startswith("02"), "value"] = None
    assert "pct: no values for AK" in problems(values, set(fips))


def test_partial_state_exempt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(validate.PARTIAL_STATES, "pct", frozenset({"AK"}))
    fips = pnw_fips()
    values = valid_values(fips)
    values = values[~((values.indicator_id == "pct") & values.fips.str.startswith("02"))]
    validate_display(values, set(fips), CATALOG)


def test_unknown_partial_state_id_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(validate.PARTIAL_STATES, "nope", frozenset({"AK"}))
    fips = pnw_fips()
    found = problems(valid_values(fips), set(fips))
    assert "PARTIAL_STATES lists nope which is not in the catalog" in found


def test_partial_states_empty() -> None:
    # Deliberate tripwire: an exemption hides a state's missing data from validation, so
    # adding one should be a visible, reviewed change to this test too (M8 spec §3.5).
    assert validate.PARTIAL_STATES == {}


def test_unknown_partial_state_abbreviation_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(validate.PARTIAL_STATES, "pct", frozenset({"CA"}))
    fips = pnw_fips()
    found = problems(valid_values(fips), set(fips))
    assert "PARTIAL_STATES lists CA for pct, which is not a PNW state" in found


def test_stale_partial_state_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(validate.PARTIAL_STATES, "pct", frozenset({"AK"}))
    fips = pnw_fips()
    found = problems(valid_values(fips), set(fips))
    assert "PARTIAL_STATES exempts AK for pct, but it has values; remove the exemption" in found


def test_model_targets_must_match_targets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(validate, "TARGETS", real_targets)  # not the single-target stand-in
    model = peer_model_of_one()
    found = model_problems(model)
    assert (
        "model targets ['life_expectancy'] do not match TARGETS "
        "['life_expectancy', 'premature_death', 'injury_deaths']; rerun the model stage"
    ) in found


def test_model_with_an_extra_target_is_flagged(monkeypatch: pytest.MonkeyPatch) -> None:
    extra = peer_model_of_one()
    model = ModelFile(
        targets={**extra.targets, "diabetes": extra.targets["life_expectancy"]}, peers=extra.peers
    )
    found = model_problems(model)
    assert (
        "model targets ['life_expectancy', 'diabetes'] do not match TARGETS "
        "['life_expectancy']; rerun the model stage"
    ) in found


def peer_model_of_one() -> ModelFile:
    return make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()})


def test_validate_model_prefixes_problems_with_target(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(validate, "TARGETS", ("life_expectancy", "injury_deaths"))
    good = make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()})
    broken = make_model_file(
        {WITH_TARGET: make_county_model(predicted=77.00001), NO_TARGET: make_null_county_model()},
        target_id="injury_deaths",
    )
    model = ModelFile(
        targets={"life_expectancy": good.targets["life_expectancy"], **broken.targets},
        peers=good.peers,
    )
    problems = model_problems(model)
    assert len(problems) == 1
    assert problems[0].startswith("injury_deaths: model contributions do not sum")


def peers_of(counties: dict[str, list[str]], k: int = 1) -> Peers:
    return Peers(
        method=PeerMethod(features=["poverty_rate"], k=k, min_features=6), counties=counties
    )


def peer_model(peers: Peers) -> ModelFile:
    model = make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()})
    return ModelFile(targets=model.targets, peers=peers)


def test_valid_peers_pass() -> None:
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET], NO_TARGET: [WITH_TARGET]}))
    validate_model(model, target_rows(), MODEL_COUNTIES, MODEL_CATALOG)


def test_county_with_no_peers_passes() -> None:
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET], NO_TARGET: []}))
    validate_model(model, target_rows(), MODEL_COUNTIES, MODEL_CATALOG)


def test_peer_outside_pnw_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: ["06037"], NO_TARGET: []}))
    found = model_problems(model)
    assert len(found) == 1 and "peer" in found[0] and "06037" in found[0]


def test_peer_lists_itself_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: [WITH_TARGET], NO_TARGET: []}))
    found = model_problems(model)
    assert len(found) == 1 and "itself" in found[0] and WITH_TARGET in found[0]


def test_peer_list_duplicate_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET, NO_TARGET], NO_TARGET: []}, k=2))
    found = model_problems(model)
    assert len(found) == 1 and "duplicate" in found[0]


def test_peer_list_wrong_length_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET, "53003", "53005"], NO_TARGET: []}, k=5))
    found = model_problems(model)
    assert any("5 entries or none" in p and WITH_TARGET in p for p in found)


def test_peers_missing_a_county_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: []}))
    found = model_problems(model)
    assert len(found) == 1 and "peers" in found[0] and NO_TARGET in found[0]


def test_peers_for_county_outside_pnw_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: [], NO_TARGET: [], "06037": []}))
    found = model_problems(model)
    assert len(found) == 1 and "peers" in found[0] and "06037" in found[0]
