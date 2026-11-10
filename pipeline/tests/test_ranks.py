import pandas as pd

from pnw_health.ranks import add_ranks
from tests.helpers import make_indicator


def frame(values: list[float], fips: list[str] | None = None, ind: str = "x") -> pd.DataFrame:
    fips = fips or [f"53{i:03d}" for i in range(1, len(values) + 1)]
    return pd.DataFrame({"fips": fips, "indicator_id": ind, "value": values})


def ranks(df: pd.DataFrame, direction: str, col: str = "rank") -> list[object]:
    out = add_ranks(df, [make_indicator("x", direction=direction)])
    return [None if pd.isna(v) else int(v) for v in out[col]]


def test_higher_is_better() -> None:
    assert ranks(frame([3, 1, 2]), "higher_is_better") == [1, 3, 2]


def test_higher_is_worse() -> None:
    assert ranks(frame([3, 1, 2]), "higher_is_worse") == [3, 1, 2]


def test_ties_use_competition_ranking() -> None:
    assert ranks(frame([5, 5, 1]), "higher_is_better") == [1, 1, 3]


def test_nan_unranked_and_ignored() -> None:
    assert ranks(frame([3, float("nan"), 2]), "higher_is_better") == [1, None, 2]


def test_neutral_unranked() -> None:
    assert ranks(frame([3, 1]), "neutral") == [None, None]


def test_state_rank_within_state() -> None:
    df = frame([4, 3, 2, 1], fips=["53001", "53003", "41001", "41003"])
    assert ranks(df, "higher_is_better") == [1, 2, 3, 4]
    assert ranks(df, "higher_is_better", "state_rank") == [1, 2, 1, 2]


def test_rank_columns_are_nullable_int() -> None:
    out = add_ranks(frame([1.0, float("nan")]), [make_indicator("x")])
    assert str(out["rank"].dtype) == "Int64"
    assert str(out["state_rank"].dtype) == "Int64"
