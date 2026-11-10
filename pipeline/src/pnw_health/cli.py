"""`pnw-health run`: fetch -> harmonize -> export, each stage resumable from disk."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import httpx
import pandas as pd
import typer

from pnw_health.config import ACS_YEAR, GEO_YEAR, SCHEMA_VERSION, Paths, census_api_key
from pnw_health.contract import Manifest, SourceVintage
from pnw_health.export import build_values_file, write_exports
from pnw_health.fetch import FetchError, make_client
from pnw_health.harmonize import harmonize, pnw_only
from pnw_health.indicators import load_catalog
from pnw_health.ranks import add_ranks
from pnw_health.sources.acs import fetch_acs, parse_acs, profile_url
from pnw_health.sources.geo import boundary_url, fetch_boundaries, load_pnw_counties, to_topojson
from pnw_health.validate import DataValidationError, validate_display

app = typer.Typer(add_completion=False, help=__doc__)


class Stage(StrEnum):
    fetch = "fetch"
    harmonize = "harmonize"
    export = "export"
    all = "all"


def _fetch(paths: Paths, client: httpx.Client, api_key: str | None, refresh: bool) -> None:
    fetch_acs(client, paths.raw, load_catalog(), api_key=api_key, refresh=refresh)
    fetch_boundaries(client, paths.raw, refresh=refresh)


def _harmonize(paths: Paths, client: httpx.Client) -> None:
    catalog = load_catalog()
    acs = parse_acs(fetch_acs(client, paths.raw, catalog), catalog)  # cache hit after fetch
    result = harmonize([acs])
    paths.interim.mkdir(parents=True, exist_ok=True)
    result.values.to_parquet(paths.interim / "long.parquet", index=False)
    result.legacy.to_parquet(paths.interim / "legacy.parquet", index=False)
    (paths.interim / "warnings.txt").write_text("".join(f"{w}\n" for w in result.warnings))


def _export(paths: Paths, client: httpx.Client) -> None:
    catalog = load_catalog()
    counties = load_pnw_counties(fetch_boundaries(client, paths.raw))  # cache hit after fetch
    county_fips = set(counties.fips)
    values = pnw_only(pd.read_parquet(paths.interim / "long.parquet"))
    legacy = pnw_only(pd.read_parquet(paths.interim / "legacy.parquet"))

    validate_display(values, county_fips, catalog)

    manifest = Manifest(
        schema_version=SCHEMA_VERSION,
        built_at=datetime.now(UTC),
        sources=[
            SourceVintage(source="acs", year=ACS_YEAR, url=profile_url(ACS_YEAR)),
            SourceVintage(source="boundaries", year=GEO_YEAR, url=boundary_url(GEO_YEAR)),
        ],
        indicators=catalog,
    )
    values_file = build_values_file(add_ranks(values, catalog), legacy, county_fips, catalog)
    topology = to_topojson(counties)
    write_exports(paths.out, manifest, values_file, topology)  # only after validation passed


def run_pipeline(
    paths: Paths,
    stage: Stage,
    *,
    client: httpx.Client,
    api_key: str | None = None,
    refresh: bool = False,
) -> None:
    """Run one stage, or all of them in order. Raises FetchError / DataValidationError."""
    if stage in (Stage.fetch, Stage.all):
        _fetch(paths, client, api_key, refresh)
    if stage in (Stage.harmonize, Stage.all):
        _harmonize(paths, client)
    if stage in (Stage.export, Stage.all):
        _export(paths, client)


@app.callback()
def main() -> None:
    """PNW health dashboard data pipeline."""


@app.command()
def run(
    stage: Annotated[Stage, typer.Option(help="Stage to run.")] = Stage.all,
    root: Annotated[Path, typer.Option(help="Repository root.")] = Path("."),
    refresh: Annotated[bool, typer.Option(help="Re-download cached sources.")] = False,
) -> None:
    """Fetch, harmonize, validate, and export the dashboard data."""
    root = root.resolve()
    try:
        with make_client() as client:
            run_pipeline(
                Paths.default(root),
                stage,
                client=client,
                api_key=census_api_key(root),
                refresh=refresh,
            )
    except (DataValidationError, FetchError) as err:
        typer.echo(f"pipeline failed:\n{err}", err=True)
        raise typer.Exit(1) from err
