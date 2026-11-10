import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def acs_variables() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / "acs_profile_variables_2024.json").read_text())
    return data
