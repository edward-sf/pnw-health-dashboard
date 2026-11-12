"""`pnw-health run`: fetch -> harmonize -> model -> export, each stage resumable from disk."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import httpx
import pandas as pd
import typer

from pnw_health.config import (
    ACS_YEAR,
    CHR_LEGACY_YEAR,
    CHR_YEAR,
    GEO_YEAR,
    PLACES_RELEASE,
    SCHEMA_VERSION,
    Paths,
    census_api_key,
    env_file_path,
)
from pnw_health.contract import Manifest, ModelFile, SourceVintage, write_schemas
from pnw_health.export import (
    ExportError,
    build_values_file,
    finalize_model,
    write_exports,
    write_model,
)
from pnw_health.fetch import FetchError, make_client
from pnw_health.harmonize import harmonize, pnw_only
from pnw_health.indicators import load_catalog
from pnw_health.model.run import run_model
from pnw_health.ranks import add_ranks
from pnw_health.sources.acs import acs_cache_path, fetch_acs, parse_acs, profile_url
from pnw_health.sources.chr import (
    chr_cache_path,
    chr_url,
    fetch_chr,
    parse_chr,
    parse_chr_legacy,
)
from pnw_health.sources.geo import (
    boundaries_cache_path,
    boundary_url,
    fetch_boundaries,
    load_pnw_counties,
    to_topojson,
)
from pnw_health.sources.places import fetch_places, parse_places, places_cache_path, places_url
from pnw_health.validate import DataValidationError, validate_display, validate_model

app = typer.Typer(add_completion=False, help=__doc__)


MODEL_INPUT_DIGEST = "model.input.sha256"


class StageInputError(Exception):
    """A stage's input is missing because an earlier stage has not run."""


def _require(path: Path, stage: str) -> Path:
    if not path.exists():
        raise StageInputError(f"{path} not found; run `pnw-health run --stage {stage}` first")
    return path


class Stage(StrEnum):
    fetch = "fetch"
    harmonize = "harmonize"
    model = "model"
    export = "export"
    all = "all"


def _fetch(
    paths: Paths,
    client: httpx.Client,
    api_key: str | None,
    refresh: bool,
    env_file: Path | None,
) -> None:
    catalog = load_catalog()
    if not api_key and (refresh or not acs_cache_path(paths.raw, catalog).exists()):
        where = env_file if env_file is not None else ".env"
        raise StageInputError(f"CENSUS_API_KEY not set (environment or {where})")
    fetch_acs(client, paths.raw, catalog, api_key=api_key, refresh=refresh)
    fetch_places(client, paths.raw, catalog, refresh=refresh)
    fetch_chr(client, paths.raw, catalog, CHR_YEAR, refresh=refresh)
    fetch_chr(client, paths.raw, catalog, CHR_LEGACY_YEAR, refresh=refresh)
    fetch_boundaries(client, paths.raw, refresh=refresh)


def _harmonize(paths: Paths) -> None:
    catalog = load_catalog()
    acs = parse_acs(_require(acs_cache_path(paths.raw, catalog), "fetch"), catalog)
    places = parse_places(_require(places_cache_path(paths.raw, catalog), "fetch"), catalog)
    chr_ = parse_chr(_require(chr_cache_path(paths.raw, CHR_YEAR), "fetch"), catalog)
    legacy = parse_chr_legacy(
        _require(chr_cache_path(paths.raw, CHR_LEGACY_YEAR), "fetch"), catalog
    )
    result = harmonize([acs, places, chr_, legacy])
    paths.interim.mkdir(parents=True, exist_ok=True)
    result.values.to_parquet(paths.interim / "long.parquet", index=False)
    result.legacy.to_parquet(paths.interim / "legacy.parquet", index=False)
    warnings_path = paths.interim / "warnings.txt"
    warnings_path.write_text("".join(f"{w}\n" for w in result.warnings))
    typer.echo(f"harmonize: {len(result.warnings)} warning(s), see {warnings_path}", err=True)


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _model(paths: Paths) -> None:
    long_path = _require(paths.interim / "long.parquet", "harmonize")
    model = run_model(pd.read_parquet(long_path), load_catalog())
    model_path = write_model(paths.interim / "model.json", model)
    # Lets export reject a model trained on other data, including non-PNW counties.
    (paths.interim / MODEL_INPUT_DIGEST).write_text(_digest(long_path) + "\n")
    dropped = len(model.model_card.excluded_counties)
    typer.echo(f"model: {dropped} dropped county(ies), see {model_path}", err=True)


def _export(paths: Paths) -> None:
    catalog = load_catalog()
    counties = load_pnw_counties(_require(boundaries_cache_path(paths.raw), "fetch"))
    county_fips = set(counties.fips)
    values = pnw_only(pd.read_parquet(_require(paths.interim / "long.parquet", "harmonize")))
    legacy = pnw_only(pd.read_parquet(_require(paths.interim / "legacy.parquet", "harmonize")))

    validate_display(values, county_fips, catalog, legacy)
    model_path = _require(paths.interim / "model.json", "model")
    digest = _require(paths.interim / MODEL_INPUT_DIGEST, "model").read_text().strip()
    if digest != _digest(paths.interim / "long.parquet"):
        raise StageInputError(
            f"{model_path} was trained on a different long.parquet; "
            "run `pnw-health run --stage model` first"
        )
    model = ModelFile.model_validate_json(model_path.read_text())
    validate_model(model, values, county_fips, catalog)

    manifest = Manifest(
        schema_version=SCHEMA_VERSION,
        built_at=datetime.now(UTC),
        sources=[
            SourceVintage(source="acs", year=ACS_YEAR, url=profile_url(ACS_YEAR)),
            SourceVintage(source="places", year=PLACES_RELEASE, url=places_url()),
            SourceVintage(source="chr", year=CHR_YEAR, url=chr_url(CHR_YEAR)),
            SourceVintage(source="chr", year=CHR_LEGACY_YEAR, url=chr_url(CHR_LEGACY_YEAR)),
            SourceVintage(source="boundaries", year=GEO_YEAR, url=boundary_url(GEO_YEAR)),
        ],
        indicators=catalog,
    )
    values_file = build_values_file(add_ranks(values, catalog), legacy, county_fips, catalog)
    topology = to_topojson(counties)
    # Only after validation passed, and rounded only now: validation needs full precision.
    write_exports(
        paths.out, manifest, values_file, topology, finalize_model(model), staging=paths.interim
    )


def run_pipeline(
    paths: Paths,
    stage: Stage,
    *,
    client: httpx.Client,
    api_key: str | None = None,
    refresh: bool = False,
    env_file: Path | None = None,
) -> None:
    """Run one stage, or all of them in order.

    Only ``fetch`` uses the network; the later stages read what earlier stages wrote and
    raise StageInputError if it is missing. ``fetch`` also raises StageInputError when ACS
    must be downloaded and there is no API key; ``env_file`` is the ``.env`` path that
    message names. Also raises FetchError and DataValidationError.
    """
    if stage in (Stage.fetch, Stage.all):
        _fetch(paths, client, api_key, refresh, env_file)
    if stage in (Stage.harmonize, Stage.all):
        _harmonize(paths)
    if stage in (Stage.model, Stage.all):
        _model(paths)
    if stage in (Stage.export, Stage.all):
        _export(paths)


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
                env_file=env_file_path(root),
            )
    # ValueError covers the data and config checks raised outside validation, such as
    # duplicate counties after a rename and an invalid indicator catalog.
    except (DataValidationError, ExportError, FetchError, StageInputError, ValueError) as err:
        typer.echo(f"pipeline failed:\n{err}", err=True)
        raise typer.Exit(1) from err


@app.command()
def schema(
    root: Annotated[Path, typer.Option(help="Repository root.")] = Path("."),
) -> None:
    """Regenerate the committed JSON Schema files in ``schema/`` from the contract."""
    for path in write_schemas(Paths.default(root.resolve()).schema):
        typer.echo(str(path))
