from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest

from pnw_health.fetch import FetchError, cached_get, make_client

URL = "https://example.test/data.json"
Handler = Callable[[httpx.Request], httpx.Response]


def counting(handler: Handler) -> tuple[Handler, list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request)

    return wrapped, calls


def client_for(handler: Handler) -> httpx.Client:
    return make_client(transport=httpx.MockTransport(handler))


def test_downloads_and_caches(tmp_path: Path) -> None:
    handler, calls = counting(lambda r: httpx.Response(200, content=b'{"ok": 1}'))
    dest = tmp_path / "sub" / "data.json"
    with client_for(handler) as client:
        assert cached_get(client, URL, dest) == dest
        cached_get(client, URL, dest)
    assert len(calls) == 1
    assert dest.read_bytes() == b'{"ok": 1}'


def test_refresh_refetches(tmp_path: Path) -> None:
    handler, calls = counting(lambda r: httpx.Response(200, content=b"x"))
    dest = tmp_path / "data.json"
    with client_for(handler) as client:
        cached_get(client, URL, dest)
        cached_get(client, URL, dest, refresh=True)
    assert len(calls) == 2


def test_params_are_sent(tmp_path: Path) -> None:
    handler, calls = counting(lambda r: httpx.Response(200, content=b"x"))
    with client_for(handler) as client:
        cached_get(client, URL, tmp_path / "d", params={"for": "county:*"})
    assert calls[0].url.params["for"] == "county:*"


def assert_nothing_written(dest: Path) -> None:
    assert not dest.exists()
    assert not dest.with_suffix(dest.suffix + ".part").exists()


def test_http_error_raises_and_leaves_nothing(tmp_path: Path) -> None:
    dest = tmp_path / "data.json"
    handler = lambda r: httpx.Response(400, text="error: unknown variable 'DP99'")  # noqa: E731
    with client_for(handler) as client, pytest.raises(FetchError) as err:
        cached_get(client, URL, dest)
    assert "400" in str(err.value)
    assert "unknown variable" in str(err.value)
    assert URL in str(err.value)
    assert_nothing_written(dest)


def test_204_is_error(tmp_path: Path) -> None:
    dest = tmp_path / "data.json"
    with client_for(lambda r: httpx.Response(204)) as client, pytest.raises(FetchError):
        cached_get(client, URL, dest)
    assert_nothing_written(dest)


def test_redirect_is_error_not_followed(tmp_path: Path) -> None:
    # The Census API answers a missing key with 302 -> missing_key.html (an HTML page).
    dest = tmp_path / "data.json"
    handler, calls = counting(
        lambda r: httpx.Response(
            302, headers={"Location": "https://api.census.gov/data/missing_key.html"}
        )
    )
    with client_for(handler) as client, pytest.raises(FetchError) as err:
        cached_get(client, URL, dest)
    assert "missing_key" in str(err.value)
    assert len(calls) == 1
    assert_nothing_written(dest)


def test_api_key_redacted_in_error(tmp_path: Path) -> None:
    handler = lambda r: httpx.Response(400, text="bad")  # noqa: E731
    with client_for(handler) as client, pytest.raises(FetchError) as err:
        cached_get(client, URL, tmp_path / "d", params={"key": "SECRET", "get": "NAME"})
    assert "SECRET" not in str(err.value)
    assert "get=NAME" in str(err.value)


class FailingStream(httpx.SyncByteStream):
    def __iter__(self) -> Iterator[bytes]:
        yield b"partial"
        raise httpx.ReadError("connection reset")


def test_interrupted_write_does_not_poison_cache(tmp_path: Path) -> None:
    dest = tmp_path / "data.json"
    fail = lambda r: httpx.Response(200, stream=FailingStream())  # noqa: E731
    with client_for(fail) as client, pytest.raises(httpx.ReadError):
        cached_get(client, URL, dest)
    assert_nothing_written(dest)
    with client_for(lambda r: httpx.Response(200, content=b"full")) as client:
        cached_get(client, URL, dest)
    assert dest.read_bytes() == b"full"


def test_client_identifies_itself() -> None:
    handler, calls = counting(lambda r: httpx.Response(200, content=b"x"))
    with client_for(handler) as client:
        client.get(URL)
    assert calls[0].headers["User-Agent"] == "pnw-health-dashboard-pipeline"
