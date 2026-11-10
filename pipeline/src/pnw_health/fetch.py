"""HTTP fetching with an on-disk cache and atomic writes."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import quote

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


def _scrub(text: str, url: httpx.URL) -> str:
    """Remove the request's secret parameter values from text the server or httpx produced."""
    for name in REDACTED_PARAMS:
        for secret in url.params.get_list(name):
            if secret:
                text = text.replace(secret, "REDACTED")
                text = text.replace(quote(secret, safe=""), "REDACTED")
    return text


def _raise_for_response(resp: httpx.Response) -> None:
    if resp.status_code == 204 or not resp.is_success:
        url = resp.request.url
        # Scrub before truncating, so a secret cut off at the limit can't survive in part.
        body = _scrub(resp.read().decode("utf-8", errors="replace"), url)[:200]
        location = _scrub(resp.headers.get("Location", ""), url)
        detail = f" -> {location}" if location else ""
        raise FetchError(f"GET {_redacted(url)} returned {resp.status_code}{detail}: {body}")


def _transport_error(url: str, params: dict[str, str] | None, err: Exception) -> FetchError:
    target = httpx.URL(url, params=params)
    return FetchError(f"GET {_redacted(target)} failed: {_scrub(str(err), target)}")


def fetch_json(client: httpx.Client, url: str, *, params: dict[str, str] | None = None) -> Any:
    """GET and decode JSON, with the same error handling and key redaction as ``cached_get``."""
    try:
        resp = client.get(url, params=params)
    except httpx.TransportError as err:
        raise _transport_error(url, params, err) from err
    _raise_for_response(resp)
    return resp.json()


def cached_get(
    client: httpx.Client,
    url: str,
    dest: Path,
    *,
    params: dict[str, str] | None = None,
    refresh: bool = False,
    validate: Callable[[Path], object] | None = None,
) -> Path:
    """Download ``url`` to ``dest`` unless it is already cached.

    The body streams to ``dest.part`` and is renamed into place only after the whole
    response arrived, so an interrupted download never looks like a valid cache entry.
    ``validate`` inspects that complete file first and raises FetchError to reject it, so
    a 200 with an unusable body is never cached and an existing good file is kept.
    """
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    try:
        with client.stream("GET", url, params=params) as resp:
            _raise_for_response(resp)
            with part.open("wb") as fh:
                for chunk in resp.iter_bytes():
                    fh.write(chunk)
        if validate is not None:
            validate(part)
        os.replace(part, dest)
    except httpx.TransportError as err:
        raise _transport_error(url, params, err) from err
    finally:
        part.unlink(missing_ok=True)
    return dest
