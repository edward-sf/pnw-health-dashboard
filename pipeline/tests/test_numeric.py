import numpy as np
import pandas as pd

from pnw_health.numeric import nan_to_none


def test_missing_values_become_none() -> None:
    assert nan_to_none(None) is None
    assert nan_to_none(pd.NA) is None
    assert nan_to_none(float("nan")) is None
    assert nan_to_none(np.float64("nan")) is None


def test_numbers_become_floats() -> None:
    assert nan_to_none(1) == 1.0
    assert isinstance(nan_to_none(1), float)
    assert nan_to_none(np.float64(2.5)) == 2.5
