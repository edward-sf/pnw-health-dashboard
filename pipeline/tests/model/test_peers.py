import numpy as np
import pandas as pd

from pnw_health.model.peers import find_peers


def one_feature(values: dict[str, float]) -> pd.DataFrame:
    return pd.DataFrame({"x": values})


def test_nearest_first_on_hand_computed_distances() -> None:
    table = one_feature({"A": 0.0, "B": 1.0, "C": 3.0, "D": 10.0})
    peers = find_peers(table, k=2, min_features=1)
    assert peers["A"] == ["B", "C"]
    assert peers["D"] == ["C", "B"]
    assert list(peers) == ["A", "B", "C", "D"]


def test_ties_broken_by_fips() -> None:
    table = one_feature({"A": 0.0, "B": 1.0, "C": -1.0})
    peers = find_peers(table, k=2, min_features=1)
    assert peers["A"] == ["B", "C"]


def test_never_lists_itself_and_no_duplicates() -> None:
    table = one_feature({f"F{i}": float(i * i) for i in range(8)})
    peers = find_peers(table, k=5, min_features=1)
    for fips, found in peers.items():
        assert fips not in found
        assert len(found) == len(set(found)) == 5


def test_too_few_features_gets_no_peers_and_is_not_a_peer() -> None:
    table = pd.DataFrame(
        {f"f{i}": [float(j) for j in range(4)] + [1.0] for i in range(9)},
        index=["A", "B", "C", "D", "E"],
    )
    table.loc["E", [f"f{i}" for i in range(4)]] = np.nan  # 5 of 9 present
    peers = find_peers(table, k=3, min_features=6)
    assert peers["E"] == []
    assert all("E" not in found for found in peers.values())
    assert len(peers["A"]) == 3


def test_missing_feature_filled_with_pnw_median_before_scaling() -> None:
    base = pd.DataFrame(
        {"x": [0.0, 1.0, 2.0, 3.0, 4.0, 2.0], "y": [5.0, 1.0, 4.0, 2.0, 3.0, np.nan]},
        index=list("ABCDEF"),
    )
    median_y = base["y"].iloc[:5].median()
    filled = base.copy()
    filled.loc["F", "y"] = median_y
    assert find_peers(base, k=3, min_features=1) == find_peers(filled, k=3, min_features=1)


def test_ineligible_county_does_not_shift_the_median() -> None:
    table = pd.DataFrame(
        {"x": [0.0, 1.0, 2.0, 100.0], "y": [1.0, 2.0, 3.0, np.nan]},
        index=list("ABCD"),
    )
    # D has 1 of 2 features: ineligible, so excluded from the pool and the statistics.
    peers = find_peers(table, k=2, min_features=2)
    assert peers["D"] == []
    assert peers["A"] == ["B", "C"]


def test_constant_feature_contributes_nothing() -> None:
    varying = {"A": 0.0, "B": 1.0, "C": 3.0, "D": 10.0}
    with_constant = pd.DataFrame({"x": varying, "const": 7.0})
    result = find_peers(with_constant, k=2, min_features=1)
    assert result == find_peers(one_feature(varying), k=2, min_features=1)


def test_deterministic() -> None:
    rng = np.random.default_rng(0)
    table = pd.DataFrame(
        rng.normal(size=(12, 4)), index=[f"{i:05d}" for i in range(12)], columns=list("wxyz")
    )
    shuffled = table.sample(frac=1.0, random_state=3)
    assert find_peers(table, k=4, min_features=1) == find_peers(shuffled, k=4, min_features=1)
