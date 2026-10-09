from __future__ import annotations

from datetime import datetime, timezone


def require_utc(value: datetime, field: str) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError(f"{field} must be timezone-aware UTC")
    if value.utcoffset() != timezone.utc.utcoffset(None):
        raise ValueError(f"{field} must use UTC")
    return value
