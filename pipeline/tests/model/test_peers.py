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


def test_missing_feature_filled_with_median_not_mean() -> None:
    # y over A-E is {0, 0, 1, 1, 10}: median 1, mean 2.4. F is missing y.
    # Filled with the median F sits nearest B then D; a mean fill would give D then B.
    table = pd.DataFrame(
        {"x": [1.0, 5.0, 3.0, 4.0, 0.0, 5.0], "y": [0.0, 0.0, 1.0, 1.0, 10.0, np.nan]},
        index=list("ABCDEF"),
    )
    assert find_peers(table, k=2, min_features=1)["F"] == ["B", "D"]


def test_median_ignores_ineligible_counties() -> None:
    # G has one of three features, so it is not eligible, and its y of 40 must not enter
    # the median that fills A's missing y. Over B-F the median is 2; with G it would be 4,
    # which changes A's nearest two from C, D to E, C.
    table = pd.DataFrame(
        {
            "x": [3.0, 4.0, 5.0, 2.0, 4.0, 1.0, np.nan],
            "y": [np.nan, 5.0, 2.0, 0.0, 4.0, 1.0, 40.0],
            "z": [2.0, 5.0, 2.0, 1.0, 1.0, 5.0, np.nan],
        },
        index=list("ABCDEFG"),
    )
    peers = find_peers(table, k=2, min_features=2)
    assert peers["G"] == []
    assert peers["A"] == ["C", "D"]


def test_scaling_ignores_ineligible_counties() -> None:
    # F has one of three features and y of 100. Over A-E alone the order of E's and B's
    # peers differs from the order with F's y in the mean and standard deviation.
    table = pd.DataFrame(
        {
            "x": [0.0, 1.0, 2.0, 3.0, 4.0, np.nan],
            "y": [3.0, 1.0, 4.0, 1.0, 5.0, 100.0],
            "z": [1.0, 2.0, 3.0, 4.0, 5.0, np.nan],
        },
        index=list("ABCDEF"),
    )
    peers = find_peers(table, k=2, min_features=2)
    assert peers["B"] == ["A", "D"]
    assert peers["C"] == ["A", "E"]
    assert peers["E"] == ["C", "D"]


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
