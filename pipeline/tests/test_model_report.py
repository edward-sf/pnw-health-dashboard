import importlib.util
from pathlib import Path
from types import ModuleType

import pandas as pd
import pytest

from pnw_health.config import CHR_YEAR
from pnw_health.contract import ShapEntry
from pnw_health.sources.chr import chr_cache_path
from tests.helpers import (
    make_county_model,
    make_model_file,
    make_null_county_model,
    make_target_model,
)

SCRIPT = Path(__file__).parents[1] / "scripts" / "model_report.py"


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("model_report", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_tercile_share_among_flaggable() -> None:
    mr = load_script()
    flags = ["somewhat_better", "none", None, "none", "none", "none", "none", "none", "none"]
    counties = {
        f"53{i:03d}": make_null_county_model() if f is None else make_county_model(flag=f)
        for i, f in enumerate(flags, start=1)
    }
    pop = pd.Series({fips: float(i) for i, fips in enumerate(counties, start=1)})
    text = "\n".join(mr._flags_section(make_target_model(counties), pop))
    assert "share among flaggable" in text
    low = next(line for line in text.splitlines() if line.startswith("| low |"))
    assert "33.3%" in low
    assert "50.0%" in low


def test_named_shap_sorted_by_magnitude() -> None:
    mr = load_script()
    shap = [
        ShapEntry(feature=f"f{i}", value=1.0, contribution=c)
        for i, c in enumerate([0.1, -0.2, 0.3, -0.4, 0.5, -0.6])
    ]
    model = make_target_model({"53033": make_county_model(shap=shap)})
    long = pd.DataFrame(columns=["fips", "indicator_id", "value"])
    lines = "\n".join(mr._named_section(model, long)).splitlines()
    rows = [line for line in lines if line.startswith("| f") and not line.startswith("| feature")]
    assert [r.split(" | ")[0] for r in rows] == ["| f5", "| f4", "| f3", "| f2", "| f1"]


@pytest.mark.parametrize(
    ("present", "missing", "stage"),
    [
        ([], "web/public/data/model.json", "export"),
        (["web/public/data/model.json"], "data/interim/long.parquet", "harmonize"),
        (
            ["web/public/data/model.json", "data/interim/long.parquet"],
            str(chr_cache_path(Path("data/raw"), CHR_YEAR)),
            "fetch",
        ),
    ],
)
def test_missing_input_message(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    present: list[str],
    missing: str,
    stage: str,
) -> None:
    mr = load_script()
    for rel in present:
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith(".json"):
            path.write_text(make_model_file({}).model_dump_json())
        else:
            pd.DataFrame({"fips": ["53033"], "indicator_id": ["x"], "value": [1.0]}).to_parquet(
                path
            )
    with pytest.raises(SystemExit) as err:
        mr.main(["--root", str(tmp_path)])
    assert err.value.code == 1
    assert f"{missing} not found; run `pnw-health run --stage {stage}` first" in (
        capsys.readouterr().err
    )


def test_tercile_with_no_flaggable_county_shows_na() -> None:
    mr = load_script()
    flags = [None, None, None, "none", "none", "none", "none", "none", "none"]
    counties = {
        f"53{i:03d}": make_null_county_model() if f is None else make_county_model(flag=f)
        for i, f in enumerate(flags, start=1)
    }
    pop = pd.Series({fips: float(i) for i, fips in enumerate(counties, start=1)})
    text = "\n".join(mr._flags_section(make_target_model(counties), pop))
    low = next(line for line in text.splitlines() if line.startswith("| low |"))
    assert low.rstrip().endswith("| 0.0% | n/a |")


def test_report_has_a_section_per_target(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    mr = load_script()
    counties = {f"53{i:03d}": make_county_model() for i in range(1, 10)}
    mr._population = lambda root: pd.Series({k: float(i) for i, k in enumerate(counties)})
    model = make_model_file(counties)
    model.targets["injury_deaths"] = make_target_model(counties).model_copy(
        update={"label": "Injury deaths"}
    )
    files = {
        "web/public/data/model.json": model.model_dump_json(),
        str(chr_cache_path(Path("data/raw"), CHR_YEAR)): "x",
    }
    for rel, text in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    long_path = tmp_path / "data/interim/long.parquet"
    long_path.parent.mkdir(parents=True)
    pd.DataFrame({"fips": ["53001"], "indicator_id": ["x"], "value": [1.0]}).to_parquet(long_path)
    mr.main(["--root", str(tmp_path)])
    out = capsys.readouterr().out
    assert [line for line in out.splitlines() if line.startswith("## ")] == [
        "## Life expectancy",
        "## Injury deaths",
    ]
    assert out.count("### Metrics") == 2


@pytest.mark.parametrize(
    ("direction", "heading"),
    [
        ("higher_is_better", "## Mean residual by state (positive means better than expected)"),
        ("higher_is_worse", "## Mean residual by state (negative means better than expected)"),
    ],
)
def test_residual_heading_follows_target_direction(direction: str, heading: str) -> None:
    mr = load_script()
    counties = {f"53{i:03d}": make_county_model() for i in range(1, 10)}
    model = make_target_model(counties).model_copy(update={"direction": direction})
    pop = pd.Series({fips: float(i) for i, fips in enumerate(counties, start=1)})
    lines = mr._flags_section(model, pop)
    assert [line for line in lines if line.startswith("## Mean residual")] == [heading]
