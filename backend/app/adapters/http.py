from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


class AdapterHTTPError(Exception):
    def __init__(self, category: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.category = category
        self.status = status


class TtlCache:
    def __init__(self, ttl_seconds: float) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: dict[str, tuple[float, object]] = {}

    def get(self, key: str) -> object | None:
        item = self._items.get(key)
        if item is None or time.monotonic() - item[0] > self.ttl_seconds:
            return None
        return item[1]

    def put(self, key: str, value: object) -> None:
        self._items[key] = (time.monotonic(), value)


class GuestLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = [stamp for stamp in self._hits.get(key, []) if now - stamp < self.window_seconds]
        if len(bucket) >= self.limit:
            self._hits[key] = bucket
            return False
        bucket.append(now)
        self._hits[key] = bucket
        return True


@dataclass(frozen=True, slots=True)
class HttpJson:
    payload: dict
    status: int
    body: bytes

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.body).hexdigest()


def fetch_json(url: str, *, timeout_seconds: float = 8, retries: int = 2) -> HttpJson:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "PathGuard/0.1"})
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                body = response.read()
                payload = json.loads(body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise AdapterHTTPError("malformed_response", "The provider response was not a JSON object.")
                return HttpJson(payload=payload, status=response.status, body=body)
        except AdapterHTTPError:
            raise
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise AdapterHTTPError("rate_limited", "The provider rate limit was reached.", exc.code) from exc
            if exc.code >= 500 and attempt + 1 < retries:
                time.sleep(0.2 * (attempt + 1))
                last_error = exc
                continue
            category = "source_unavailable" if exc.code >= 500 else "malformed_response"
            raise AdapterHTTPError(category, "The provider request failed.", exc.code) from exc
        except TimeoutError as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(0.2 * (attempt + 1))
                continue
            raise AdapterHTTPError("timeout", "The source could not be reached before the configured timeout.") from exc
        except (urllib.error.URLError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            if isinstance(exc, urllib.error.URLError) and isinstance(exc.reason, TimeoutError) and attempt + 1 < retries:
                time.sleep(0.2 * (attempt + 1))
                last_error = exc
                continue
            category = "timeout" if isinstance(getattr(exc, "reason", None), TimeoutError) else "malformed_response"
            if isinstance(exc, urllib.error.URLError) and category != "timeout":
                category = "transport"
            raise AdapterHTTPError(category, "The provider response could not be used.") from exc
    raise AdapterHTTPError("transport", "The provider request failed.") from last_error
