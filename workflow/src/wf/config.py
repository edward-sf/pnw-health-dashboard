"""Graph and project configuration loaded from TOML."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

NodeKind = Literal["agent", "script", "gate"]
_KINDS: tuple[str, ...] = ("agent", "script", "gate")


class ConfigError(Exception):
    """A config file is missing, malformed or inconsistent."""


@dataclass(frozen=True)
class NodeSpec:
    name: str
    kind: NodeKind
    per_task: bool
    model_tier: str | None
    budget: int | None
    after: tuple[str, ...]


@dataclass(frozen=True)
class Graph:
    nodes: dict[str, NodeSpec]
    tiers: dict[str, str]

    def model_for(self, node: str) -> str | None:
        tier = self.nodes[node].model_tier
        return None if tier is None else self.tiers[tier]


@dataclass(frozen=True)
class Pacing:
    margin: float
    min_samples: int
    default_pct_per_step: float


@dataclass(frozen=True)
class AreaChecks:
    paths: tuple[str, ...]
    commands: tuple[str, ...]
    cwd: str


@dataclass(frozen=True)
class E2EConfig:
    paths: tuple[str, ...]
    build: str
    run: str
    spec_glob: str
    repeat_each: int
    throttle: int
    cwd: str


@dataclass(frozen=True)
class Project:
    repo: str
    main_branch: str
    milestone_branch: str
    plans_dir: str
    specs_dir: str
    reviews_dir: str
    roadmap: str
    areas: dict[str, AreaChecks]
    e2e: E2EConfig
    pacing: Pacing
    deploy_workflow: str


def _read(path: Path) -> dict[str, Any]:
    try:
        with path.open("rb") as f:
            return tomllib.load(f)
    except OSError as e:
        raise ConfigError(f"cannot read {path}: {e.strerror}") from e
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"invalid TOML in {path}: {e}") from e


def _get[T](table: dict[str, Any], key: str, kind: type[T], where: str) -> T:
    if key not in table:
        raise ConfigError(f"missing key '{key}' in {where}")
    value = table[key]
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise ConfigError(f"key '{key}' in {where} must be {kind.__name__}")
    return value


def _strs(table: dict[str, Any], key: str, where: str) -> tuple[str, ...]:
    items = _get(table, key, list, where)
    if not all(isinstance(i, str) for i in items):
        raise ConfigError(f"key '{key}' in {where} must be a list of strings")
    return tuple(items)


def _number(table: dict[str, Any], key: str, where: str) -> float:
    value = _get(table, key, (int | float), where)  # type: ignore[arg-type]
    return float(value)


def load_graph(path: Path) -> Graph:
    raw = _read(path)
    tiers_raw = _get(raw, "tiers", dict, str(path))
    tiers: dict[str, str] = {}
    for tier, model in tiers_raw.items():
        if not isinstance(model, str):
            raise ConfigError(f"tier '{tier}' in {path} must be a string")
        tiers[tier] = model
    nodes_raw = _get(raw, "nodes", dict, str(path))
    nodes: dict[str, NodeSpec] = {}
    for name, table in nodes_raw.items():
        where = f"node '{name}'"
        if not isinstance(table, dict):
            raise ConfigError(f"{where} must be a table")
        kind = _get(table, "kind", str, where)
        if kind not in _KINDS:
            raise ConfigError(f"unknown kind '{kind}' in {where}")
        tier = table.get("tier")
        if tier is not None and tier not in tiers:
            raise ConfigError(f"unknown tier '{tier}' in {where}")
        budget = table.get("budget")
        if budget is not None and (not isinstance(budget, int) or isinstance(budget, bool)):
            raise ConfigError(f"key 'budget' in {where} must be int")
        nodes[name] = NodeSpec(
            name=name,
            kind=kind,  # type: ignore[arg-type]
            per_task=_get(table, "per_task", bool, where),
            model_tier=tier,
            budget=budget,
            after=_strs(table, "after", where),
        )
    for spec in nodes.values():
        for dep in spec.after:
            if dep not in nodes:
                raise ConfigError(f"unknown node '{dep}' in 'after' of node '{spec.name}'")
    return Graph(nodes=nodes, tiers=tiers)


def load_project(path: Path) -> Project:
    raw = _read(path)
    where = str(path)
    areas: dict[str, AreaChecks] = {}
    for name, table in _get(raw, "areas", dict, where).items():
        aw = f"area '{name}'"
        areas[name] = AreaChecks(
            paths=_strs(table, "paths", aw),
            commands=_strs(table, "commands", aw),
            cwd=_get(table, "cwd", str, aw),
        )
    e = _get(raw, "e2e", dict, where)
    e2e = E2EConfig(
        paths=_strs(e, "paths", "e2e"),
        build=_get(e, "build", str, "e2e"),
        run=_get(e, "run", str, "e2e"),
        spec_glob=_get(e, "spec_glob", str, "e2e"),
        repeat_each=_get(e, "repeat_each", int, "e2e"),
        throttle=_get(e, "throttle", int, "e2e"),
        cwd=_get(e, "cwd", str, "e2e"),
    )
    p = _get(raw, "pacing", dict, where)
    pacing = Pacing(
        margin=_number(p, "margin", "pacing"),
        min_samples=_get(p, "min_samples", int, "pacing"),
        default_pct_per_step=_number(p, "default_pct_per_step", "pacing"),
    )
    return Project(
        repo=_get(raw, "repo", str, where),
        main_branch=_get(raw, "main_branch", str, where),
        milestone_branch=_get(raw, "milestone_branch", str, where),
        plans_dir=_get(raw, "plans_dir", str, where),
        specs_dir=_get(raw, "specs_dir", str, where),
        reviews_dir=_get(raw, "reviews_dir", str, where),
        roadmap=_get(raw, "roadmap", str, where),
        areas=areas,
        e2e=e2e,
        pacing=pacing,
        deploy_workflow=_get(raw, "deploy_workflow", str, where),
    )
