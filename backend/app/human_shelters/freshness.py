from __future__ import annotations

from datetime import datetime

from app.human_shelters.constants import FRESHNESS_WINDOW
from app.source_contracts.enums import FreshnessState
from app.source_contracts.timeutil import require_utc


def newest_usable(*timestamps: datetime | None, now: datetime) -> datetime | None:
    """Return the newest UTC timestamp that is not after the evaluation time."""

    now = require_utc(now, "now")
    usable = [
        require_utc(value, "timestamp")
        for value in timestamps
        if value is not None and value <= now
    ]
    if not usable:
        return None
    return max(usable)


def evaluate_record_freshness(
    *,
    fetched_at: datetime | None,
    issued_at: datetime | None,
    valid_until: datetime | None,
    last_verified_at: datetime | None,
    now: datetime,
) -> FreshnessState:
    """Apply the prototype catalogue policy.

    Precedence when the publication is available:
    a past ``valid_until`` is stale; otherwise no usable timestamp is unknown;
    otherwise age over 30 days is stale; otherwise the record is fresh.
    A usable timestamp is timezone-aware UTC and not later than ``now``.
    The newest of ``fetched_at``, ``issued_at``, and ``last_verified_at`` wins.
    """

    now = require_utc(now, "now")
    if valid_until is not None and now > require_utc(valid_until, "valid_until"):
        return FreshnessState.STALE
    newest = newest_usable(fetched_at, issued_at, last_verified_at, now=now)
    if newest is None:
        return FreshnessState.UNKNOWN
    if now - newest > FRESHNESS_WINDOW:
        return FreshnessState.STALE
    return FreshnessState.FRESH


def evaluate_facility_freshness(verified_at: datetime | None, now: datetime) -> FreshnessState:
    """Age one facility's own verification time without changing the record clock."""

    now = require_utc(now, "now")
    if verified_at is None:
        return FreshnessState.UNKNOWN
    verified_at = require_utc(verified_at, "verified_at")
    if verified_at > now:
        return FreshnessState.UNKNOWN
    if now - verified_at > FRESHNESS_WINDOW:
        return FreshnessState.STALE
    return FreshnessState.FRESH
