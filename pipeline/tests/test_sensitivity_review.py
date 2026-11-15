from pathlib import Path
from typing import get_args

from pnw_health.indicators import RaceGroup, load_catalog
from pnw_health.model.config import TARGETS

SPEC = (
    Path(__file__).resolve().parents[2] / "docs/superpowers/specs/2026-11-14-m13-branding-design.md"
)


def _first_column(heading: str) -> set[str]:
    text = SPEC.read_text()
    appendix = text.split("## Appendix A — Sensitivity decision table", 1)[1]
    section = appendix.split(heading, 1)[1]
    ids: set[str] = set()
    started = False
    for line in section.splitlines()[1:]:
        if line.startswith("#"):
            break
        if line.startswith("|"):
            started = True
            cell = line.split("|")[1].strip().strip("`")
            ids.add(cell)
        elif started:
            break
    return ids


def test_every_indicator_is_in_the_review() -> None:
    reviewed = _first_column("### Indicators")
    missing = {i.id for i in load_catalog()} - reviewed
    assert not missing, f"indicators missing from Appendix A: {sorted(missing)}"


def test_every_race_group_is_in_the_review() -> None:
    reviewed = _first_column("### Race and ethnicity groups (CHR breakdowns)")
    assert set(get_args(RaceGroup)) <= reviewed


def test_every_target_is_in_the_review() -> None:
    reviewed = _first_column("### Model outcomes and tier mapping")
    assert set(TARGETS) <= reviewed
