"""HTTP fetching with an on-disk cache and atomic writes."""

from __future__ import annotations

import os
from pathlib import Path

import httpx

USER_AGENT = "pnw-health-dashboard-pipeline"
REDACTED_PARAMS = frozenset({"key"})


class FetchError(Exception):
    """A request returned something other than a usable 2xx response."""


def make_client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    # Redirects are not followed: the Census API answers a missing or invalid key with a
    # 302 to an HTML page, which must fail loudly rather than be cached as data.
    return httpx.Client(
        transport=transport,
        timeout=60,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=False,
    )


def _redacted(url: httpx.URL) -> str:
    params = [(k, "REDACTED" if k in REDACTED_PARAMS else v) for k, v in url.params.multi_items()]
    return str(url.copy_with(params=params))


def cached_get(
    client: httpx.Client,
    url: str,
    dest: Path,
    *,
    params: dict[str, str] | None = None,
    refresh: bool = False,
) -> Path:
    """Download ``url`` to ``dest`` unless it is already cached.

    The body streams to ``dest.part`` and is renamed into place only after the whole
    response arrived, so an interrupted download never looks like a valid cache entry.
    """
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    try:
        with client.stream("GET", url, params=params) as resp:
            if resp.status_code == 204 or not resp.is_success:
                body = resp.read().decode("utf-8", errors="replace")[:200]
                location = resp.headers.get("Location", "")
                detail = f" -> {location}" if location else ""
                raise FetchError(
                    f"GET {_redacted(resp.request.url)} returned {resp.status_code}{detail}: {body}"
                )
            with part.open("wb") as fh:
                for chunk in resp.iter_bytes():
                    fh.write(chunk)
        os.replace(part, dest)
    finally:
        part.unlink(missing_ok=True)
    return dest
