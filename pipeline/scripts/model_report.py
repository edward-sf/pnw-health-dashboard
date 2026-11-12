"""Print a markdown checkpoint report of the exported model for human review.

Usage: ``uv run python scripts/model_report.py --root ..``. Reads files, writes nothing.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from pnw_health.config import CHR_YEAR, STATES
from pnw_health.contract import CountyModel, ModelFile, TargetModel
from pnw_health.indicators import load_catalog
from pnw_health.model.config import ALLOWED_CATEGORIES
from pnw_health.sources.chr import chr_cache_path

NAMED = {
    "53033": "King, WA",
    "41051": "Multnomah, OR",
    "16001": "Ada, ID",
    "02020": "Anchorage, AK",
    "02158": "Kusilvak, AK",
}
FLAGS = ["notably_better", "somewhat_better", "none", "somewhat_worse", "notably_worse"]


def _table(header: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(lines)


def _f(x: float | None, nd: int = 4) -> str:
    return "null" if x is None else f"{x:.{nd}f}"


def _metrics_section(model: TargetModel) -> list[str]:
    out = ["## Metrics", ""]
    rows = []
    for name, rm in (("ridge", model.metrics.ridge), ("lightgbm", model.metrics.lightgbm)):
        for region in ("national", "pnw"):
            m = getattr(rm, region)
            rows.append([name, region, str(m.n), _f(m.rmse), _f(m.mae), _f(m.r2)])
    out.append(_table(["model", "region", "n", "RMSE", "MAE", "R2"], rows))
    out += [
        "",
        "LightGBM RMSE margin over ridge (ridge minus LightGBM; positive means LightGBM lower):",
        "",
    ]
    for region in ("national", "pnw"):
        r = getattr(model.metrics.ridge, region).rmse
        g = getattr(model.metrics.lightgbm, region).rmse
        out.append(f"- {region}: {r - g:+.4f}")
    out += ["", "Behaviors comparison on shared counties:", ""]
    bc = model.behaviors_comparison
    rows = []
    for name, rm in (("main", bc.main), ("behaviors", bc.behaviors)):
        for region in ("national", "pnw"):
            m = getattr(rm, region)
            rows.append([name, region, str(m.n), _f(m.rmse), _f(m.mae), _f(m.r2)])
    out.append(_table(["model", "region", "n", "RMSE", "MAE", "R2"], rows))
    out.append("")
    for ex in bc.excluded_states:
        out.append(f"- excluded state {ex.state_fips}: {ex.counties} counties")
    return out + [""]


def _flag_counts(counties: dict[str, CountyModel]) -> dict[str, int]:
    counts = dict.fromkeys([*FLAGS, "insufficient_data"], 0)
    for c in counties.values():
        counts[c.flag] += 1
    return counts


def _flags_section(model: TargetModel, pop: pd.Series) -> list[str]:
    counties = model.counties
    keys = [*FLAGS, "insufficient_data"]
    out = ["## Flags by state", ""]
    rows = []
    for fips, abbr in STATES.items():
        sub = {k: v for k, v in counties.items() if k[:2] == fips}
        counts = _flag_counts(sub)
        rows.append([abbr, str(len(sub)), *[str(counts[k]) for k in keys]])
    total = _flag_counts(counties)
    rows.append(["all", str(len(counties)), *[str(total[k]) for k in keys]])
    out.append(_table(["state", "counties", *keys], rows))

    better = total["somewhat_better"] + total["notably_better"]
    worse = total["somewhat_worse"] + total["notably_worse"]
    out += [
        "",
        "## Better versus worse (PNW flags)",
        "",
        f"- flagged better than expected: {better}",
        f"- flagged worse than expected: {worse}",
        "",
    ]

    better_sign = "positive" if model.direction == "higher_is_better" else "negative"
    out += [f"## Mean residual by state ({better_sign} means better than expected)", ""]
    rows = []
    for fips, abbr in STATES.items():
        res = [c.residual for k, c in counties.items() if k[:2] == fips and c.residual is not None]
        rows.append([abbr, str(len(res)), _f(sum(res) / len(res)) if res else "n/a"])
    out.append(_table(["state", "counties with residual", "mean residual"], rows))

    out += ["", "## Flags by population tercile (PNW counties with non-null population)", ""]
    pops = pd.Series({k: pop.get(k) for k in counties}).dropna()
    missing = len(counties) - len(pops)
    tercile = pd.qcut(pops, 3, labels=["low", "middle", "high"])
    rows = []
    for t in ("low", "middle", "high"):
        ks = list(tercile[tercile == t].index)
        somewhat = sum(counties[k].flag in ("somewhat_better", "somewhat_worse") for k in ks)
        notably = sum(counties[k].flag in ("notably_better", "notably_worse") for k in ks)
        flaggable = sum(counties[k].flag != "insufficient_data" for k in ks)
        lo, hi = pops[ks].min(), pops[ks].max()
        rows.append(
            [
                t,
                f"{lo:,.0f}-{hi:,.0f}",
                str(len(ks)),
                str(somewhat),
                str(notably),
                f"{(somewhat + notably) / len(ks):.1%}",
                f"{(somewhat + notably) / flaggable:.1%}" if flaggable else "n/a",
            ]
        )
    out.append(
        _table(
            [
                "tercile",
                "population range",
                "counties",
                "flagged somewhat",
                "flagged notably",
                "share flagged",
                "share among flaggable",
            ],
            rows,
        )
    )
    out += [
        "",
        "Somewhat and notably counts each include both better and worse flags. "
        "Share flagged = (somewhat + notably) / counties in the tercile; share among "
        "flaggable leaves insufficient_data counties out of the denominator. "
        f"Counties without a population value (excluded): {missing}.",
        "",
    ]
    return out


def _named_section(model: TargetModel, long: pd.DataFrame) -> list[str]:
    out = ["## Named counties: top-5 factors associated with the prediction", ""]
    target = model.model_card.target
    for fips, name in NAMED.items():
        c = model.counties.get(fips)
        out.append(f"### {name} ({fips})")
        out.append("")
        if c is None:
            out += ["Not present in model.json.", ""]
            continue
        row = long[(long.fips == fips) & (long.indicator_id == target)]
        long_val = _f(float(row.value.iloc[0])) if len(row) else "absent"
        out.append(f"- flag: {c.flag}")
        if c.flag == "insufficient_data":
            out += [
                "- insufficient_data: no actual, predicted or residual.",
                f"- {target} in long.parquet: {long_val}",
                "",
            ]
            continue
        out += [
            f"- actual: {_f(c.actual)} (long.parquet {target}: {long_val})",
            f"- predicted: {_f(c.predicted)}",
            f"- residual: {_f(c.residual)}",
            f"- base value: {_f(c.base_value)}",
            "",
        ]
        out.append(
            _table(
                ["feature", "value", "contribution"],
                [
                    [s.feature, _f(s.value), f"{s.contribution:+.4f}"]
                    for s in sorted(c.shap, key=lambda s: (-abs(s.contribution), s.feature))[:5]
                ],
            )
        )
        out.append("")
    return out


def _importance_section(model: TargetModel) -> list[str]:
    cat = {i.id: i.category for i in load_catalog()}
    out = ["## Global importance and feature categories", ""]
    rows = [
        [e.feature, _f(e.mean_abs_shap), cat.get(e.feature, "NOT IN CATALOG")]
        for e in model.global_importance
    ]
    out.append(_table(["feature", "mean abs SHAP", "catalog category"], rows))
    bad = [f for f in model.model_card.features if cat.get(f) not in ALLOWED_CATEGORIES]
    out += [
        "",
        f"Model features: {len(model.model_card.features)}. "
        + (
            "Features outside Social & Economic / Access: " + ", ".join(bad)
            if bad
            else "All are in Social & Economic or Access; none in Behaviors, "
            "Demographics or Outcomes."
        ),
        "",
    ]
    for f in model.model_card.features:
        out.append(f"- {f}: {cat.get(f, 'NOT IN CATALOG')}")
    return out + [""]


def _demoted(lines: list[str]) -> list[str]:
    """Push each markdown heading one level down, to sit under a target's heading."""
    return [f"#{line}" if line.startswith("#") else line for line in lines]


def _population(root: Path) -> pd.Series:
    path = chr_cache_path(root / "data" / "raw", CHR_YEAR)
    df = pd.read_csv(
        path,
        header=1,
        encoding="latin-1",
        dtype={"fipscode": str},
        usecols=["fipscode", "v051_rawvalue"],
    )
    df["fipscode"] = df["fipscode"].str.zfill(5)
    df["v051_rawvalue"] = pd.to_numeric(df["v051_rawvalue"], errors="coerce")
    return df.drop_duplicates("fipscode").set_index("fipscode")["v051_rawvalue"]


def _require(path: Path, stage: str) -> Path:
    """Exit 1 with the CLI's message when an input from an earlier stage is missing."""
    if not path.exists():
        print(f"{path} not found; run `pnw-health run --stage {stage}` first", file=sys.stderr)
        raise SystemExit(1)
    return path


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, default=Path(".."))
    root = ap.parse_args(argv).root
    model_path = _require(root / "web/public/data/model.json", "export")
    long_path = _require(root / "data/interim/long.parquet", "harmonize")
    _require(chr_cache_path(root / "data" / "raw", CHR_YEAR), "fetch")
    model = ModelFile.model_validate_json(model_path.read_text())
    long = pd.read_parquet(long_path)
    long["fips"] = long["fips"].astype(str)
    pop = _population(root)
    lines = ["# Model checkpoint report", ""]
    for target in model.targets.values():
        card = target.model_card
        lines += [
            f"## {target.label}",
            "",
            f"Target: {card.target}. Training counties: {card.training_counties}. "
            f"Folds: {card.n_folds}.",
            "",
        ]
        lines += _demoted(_metrics_section(target))
        lines += _demoted(_flags_section(target, pop))
        lines += _demoted(_named_section(target, long))
        lines += _demoted(_importance_section(target))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
