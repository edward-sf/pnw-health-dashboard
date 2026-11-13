import pandas as pd
import pytest

from pnw_health import validate
from pnw_health.contract import ModelFile, PeerMethod, Peers, ShapEntry, StrataFile, StratumEntry
from pnw_health.harmonize import LEGACY_COLUMNS
from pnw_health.indicators import Indicator, load_catalog
from pnw_health.long import LONG_COLUMNS
from pnw_health.model.config import FEATURES, PEER_K, PEER_MIN_FEATURES
from pnw_health.model.config import TARGETS as real_targets
from pnw_health.sources.chr import STRATA_COLUMNS
from pnw_health.strata import build_strata_file
from pnw_health.validate import (
    DataValidationError,
    validate_display,
    validate_model,
    validate_strata,
)
from tests.helpers import make_county_model, make_model_file, make_null_county_model, pnw_fips


@pytest.fixture(autouse=True)
def _single_target(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most fixtures hold one target, so stand in for the three-target TARGETS."""
    monkeypatch.setattr(validate, "TARGETS", ("life_expectancy",))


@pytest.fixture
def one_peer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Peer fixtures hold two counties, so one peer each stands in for PEER_K."""
    monkeypatch.setattr(validate, "PEER_K", 1)


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


def target_indicator(id_: str, label: str, unit: str, direction: str) -> Indicator:
    return Indicator.model_validate(
        {
            **indicator(id_, unit).model_dump(),
            "label": label,
            "category": "Outcomes",
            "direction": direction,
        }
    )


MODEL_CATALOG = [
    target_indicator("life_expectancy", "Life expectancy", "years", "higher_is_better"),
    target_indicator("injury_deaths", "Injury deaths", "rate_per_100k", "higher_is_worse"),
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
    injury = broken.targets["injury_deaths"].model_copy(
        update={"label": "Injury deaths", "unit": "rate_per_100k", "direction": "higher_is_worse"}
    )
    model = ModelFile(
        targets={"life_expectancy": good.targets["life_expectancy"], "injury_deaths": injury},
        peers=good.peers,
    )
    problems = model_problems(model)
    assert len(problems) == 1
    assert problems[0].startswith("injury_deaths: model contributions do not sum")


def peers_of(counties: dict[str, list[str]], k: int | None = None) -> Peers:
    method = PeerMethod(
        features=list(FEATURES),
        k=validate.PEER_K if k is None else k,
        min_features=PEER_MIN_FEATURES,
    )
    return Peers(method=method, counties=counties)


def peer_model(peers: Peers) -> ModelFile:
    model = make_model_file({WITH_TARGET: make_county_model(), NO_TARGET: make_null_county_model()})
    return ModelFile(targets=model.targets, peers=peers)


def test_valid_peers_pass(one_peer: None) -> None:
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET], NO_TARGET: [WITH_TARGET]}))
    validate_model(model, target_rows(), MODEL_COUNTIES, MODEL_CATALOG)


def test_county_with_no_peers_passes() -> None:
    model = peer_model(peers_of({WITH_TARGET: [], NO_TARGET: []}))
    validate_model(model, target_rows(), MODEL_COUNTIES, MODEL_CATALOG)


def test_county_with_no_peers_listed_as_a_peer_rejected(one_peer: None) -> None:
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET], NO_TARGET: []}))
    assert model_problems(model) == [
        f"counties with no peers are listed as another county's peer: {NO_TARGET}; {RERUN}"
    ]


def test_peer_outside_pnw_rejected(one_peer: None) -> None:
    model = peer_model(peers_of({WITH_TARGET: ["06037"], NO_TARGET: []}))
    found = model_problems(model)
    assert len(found) == 1 and "peer" in found[0] and "06037" in found[0]


def test_peer_lists_itself_rejected(one_peer: None) -> None:
    model = peer_model(peers_of({WITH_TARGET: [WITH_TARGET], NO_TARGET: []}))
    found = model_problems(model)
    assert len(found) == 1 and "itself" in found[0] and WITH_TARGET in found[0]


def test_peer_list_duplicate_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(validate, "PEER_K", 2)
    model = peer_model(peers_of({WITH_TARGET: [], NO_TARGET: [WITH_TARGET, WITH_TARGET]}))
    found = [p for p in model_problems(model) if "listed as another county's peer" not in p]
    assert len(found) == 1 and "duplicate" in found[0]


def test_peer_list_wrong_length_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(validate, "PEER_K", 5)
    model = peer_model(peers_of({WITH_TARGET: [NO_TARGET, "53003", "53005"], NO_TARGET: []}, k=5))
    found = model_problems(model)
    assert any("5 entries or none" in p and WITH_TARGET in p for p in found)


def test_peers_missing_a_county_rejected(one_peer: None) -> None:
    model = peer_model(peers_of({WITH_TARGET: []}))
    found = model_problems(model)
    assert len(found) == 1 and "peers" in found[0] and NO_TARGET in found[0]


def test_peers_for_county_outside_pnw_rejected(one_peer: None) -> None:
    model = peer_model(peers_of({WITH_TARGET: [], NO_TARGET: [], "06037": []}))
    found = model_problems(model)
    assert len(found) == 1 and "peers" in found[0] and "06037" in found[0]


def with_target(model: ModelFile, **update: object) -> ModelFile:
    target = model.targets["life_expectancy"]
    return ModelFile(
        targets={"life_expectancy": target.model_copy(update=update)}, peers=model.peers
    )


@pytest.mark.parametrize(
    ("field", "stale", "current"),
    [
        ("direction", "higher_is_worse", "higher_is_better"),
        ("label", "Life expectancy at birth", "Life expectancy"),
        ("unit", "percent", "years"),
    ],
)
def test_model_target_metadata_must_match_catalog(field: str, stale: str, current: str) -> None:
    model = with_target(valid_model(), **{field: stale})
    assert model_problems(model) == [
        f"life_expectancy: model {field} {stale!r} does not match the catalog {current!r}; {RERUN}"
    ]


def test_model_target_must_be_in_catalog() -> None:
    catalog = [ind for ind in MODEL_CATALOG if ind.id != "life_expectancy"]
    with pytest.raises(DataValidationError) as err:
        validate_model(valid_model(), target_rows(), MODEL_COUNTIES, catalog)
    assert err.value.problems == [f"life_expectancy: target is not in the catalog; {RERUN}"]


def test_model_card_target_must_match_target_id() -> None:
    model = valid_model()
    card = model.targets["life_expectancy"].model_card.model_copy(update={"target": "obesity"})
    assert model_problems(with_target(model, model_card=card)) == [
        f"life_expectancy: model card target 'obesity' does not match 'life_expectancy'; {RERUN}"
    ]


def test_peer_method_stale_k_rejected() -> None:
    model = peer_model(peers_of({WITH_TARGET: [], NO_TARGET: []}, k=PEER_K + 1))
    assert model_problems(model) == [
        f"peer method k {PEER_K + 1} does not match PEER_K {PEER_K}; {RERUN}"
    ]


def test_peer_method_stale_features_rejected() -> None:
    peers = peers_of({WITH_TARGET: [], NO_TARGET: []})
    peers.method.features = ["poverty_rate"]
    assert model_problems(peer_model(peers)) == [
        f"peer method features ['poverty_rate'] do not match FEATURES {list(FEATURES)}; {RERUN}"
    ]


def test_peer_method_stale_min_features_rejected() -> None:
    peers = peers_of({WITH_TARGET: [], NO_TARGET: []})
    peers.method.min_features = PEER_MIN_FEATURES + 1
    assert model_problems(peer_model(peers)) == [
        f"peer method min_features {PEER_MIN_FEATURES + 1} does not match "
        f"PEER_MIN_FEATURES {PEER_MIN_FEATURES}; {RERUN}"
    ]


# --- strata.json (M10 spec §4.5) ---------------------------------------------------------

STRATA_FIPS = set(pnw_fips())


def strata_catalog() -> list[Indicator]:
    return [i for i in load_catalog() if i.race_groups]


def valid_strata() -> StrataFile:
    """Every race indicator has one White value in 53001 (and 53077 for life expectancy)."""
    rows = [("53001", ind.id, "white", 10.0, 9.0, 11.0, False) for ind in strata_catalog()] + [
        ("53077", "life_expectancy", "white", 75.0, 74.0, 76.0, False)
    ]
    frame = pd.DataFrame(rows, columns=STRATA_COLUMNS)
    return build_strata_file(frame, STRATA_FIPS, strata_catalog())


def strata_problems(strata: StrataFile, catalog: list[Indicator] | None = None) -> list[str]:
    with pytest.raises(DataValidationError) as err:
        validate_strata(strata, STRATA_FIPS, catalog or strata_catalog())
    return err.value.problems


def set_entry(strata: StrataFile, ind: str, fips: str, group: str, **fields: object) -> None:
    current = strata.indicators[ind].counties[fips][group]
    base = current.model_dump() if current is not None else {"v": 1.0, "lo": None, "hi": None}
    strata.indicators[ind].counties[fips][group] = StratumEntry(**{**base, **fields})


def test_validate_strata_valid_passes() -> None:
    validate_strata(valid_strata(), STRATA_FIPS, strata_catalog())


def test_validate_strata_lo_above_v_names_indicator_fips_group() -> None:
    strata = valid_strata()
    set_entry(strata, "life_expectancy", "53077", "white", lo=76.0)
    problems = strata_problems(strata)
    assert len(problems) == 1
    assert problems[0].startswith("strata life_expectancy 53077 white:")


def test_validate_strata_v_above_hi() -> None:
    strata = valid_strata()
    set_entry(strata, "injury_deaths", "53001", "white", hi=5.0)
    assert strata_problems(strata) == [
        "strata injury_deaths 53001 white: v 10.0 is outside its interval [9.0, 5.0]"
    ]


def test_validate_strata_percent_over_100() -> None:
    strata = valid_strata()
    set_entry(strata, "low_birth_weight", "53001", "tom", v=101.0)
    assert strata_problems(strata) == ["strata low_birth_weight 53001 tom: 101.0 outside [0, 100]"]


def test_validate_strata_negative_rate() -> None:
    strata = valid_strata()
    set_entry(strata, "premature_death", "53003", "black", v=5.0, lo=-1.0, hi=8.0)
    assert strata_problems(strata) == ["strata premature_death 53003 black: -1.0 negative"]


def test_validate_strata_years_have_no_upper_bound() -> None:
    strata = valid_strata()
    set_entry(strata, "life_expectancy", "53077", "white", v=115.0, lo=70.0, hi=161.0)
    validate_strata(strata, STRATA_FIPS, strata_catalog())
    set_entry(strata, "life_expectancy", "53077", "white", v=5.0, lo=-1.0, hi=8.0)
    assert strata_problems(strata) == ["strata life_expectancy 53077 white: -1.0 negative"]


def test_validate_strata_groups_mismatch_catalog() -> None:
    strata = valid_strata()
    stays = strata.indicators["preventable_hospital_stays"]
    stays.groups = [*stays.groups, "nhopi"]
    for groups in stays.counties.values():
        groups["nhopi"] = None
    assert strata_problems(strata) == [
        "strata preventable_hospital_stays: groups ['aian', 'asian', 'black', 'hispanic', "
        "'white', 'nhopi'] do not match the catalog's race_groups "
        "['aian', 'asian', 'black', 'hispanic', 'white']"
    ]


def test_validate_strata_labels_mismatch_catalog() -> None:
    strata = valid_strata()
    strata.indicators["preventable_hospital_stays"].labels = {}
    assert strata_problems(strata) == [
        "strata preventable_hospital_stays: labels {} do not match the catalog's race_labels "
        "{'asian': 'Asian and Pacific Islander'}"
    ]


def test_validate_strata_county_missing_a_group() -> None:
    strata = valid_strata()
    del strata.indicators["injury_deaths"].counties["53001"]["asian"]
    assert strata_problems(strata) == [
        "strata injury_deaths: counties whose groups do not match its groups: 53001"
    ]


def test_validate_strata_missing_fips() -> None:
    strata = valid_strata()
    del strata.indicators["life_expectancy"].counties["02013"]
    strata.indicators["life_expectancy"].counties["06037"] = {
        g: None for g in strata.indicators["life_expectancy"].groups
    }
    assert strata_problems(strata) == [
        "strata life_expectancy: missing counties: 02013",
        "strata life_expectancy: counties outside the display set: 06037",
    ]


def test_validate_strata_indicator_sets_match_catalog() -> None:
    strata = valid_strata()
    del strata.indicators["injury_deaths"]
    catalog = strata_catalog()
    assert strata_problems(strata, catalog) == [
        "strata is missing catalog indicator(s) with race_groups: injury_deaths"
    ]
    full = valid_strata()
    no_injury = [i for i in catalog if i.id != "injury_deaths"]
    assert strata_problems(full, no_injury) == [
        "strata has indicator(s) without catalog race_groups: injury_deaths"
    ]


def test_validate_strata_indicator_with_no_pnw_value() -> None:
    strata = valid_strata()
    strata.indicators["injury_deaths"].counties["53001"]["white"] = None
    assert strata_problems(strata) == ["strata injury_deaths: no non-null values"]


def test_validate_strata_groups_and_labels_fixed() -> None:
    strata = valid_strata()
    strata.groups = strata.groups[::-1]
    assert strata_problems(strata) == [
        "strata groups do not match RACE_GROUP_LABELS in display order"
    ]
