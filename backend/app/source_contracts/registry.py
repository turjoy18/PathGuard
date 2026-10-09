from __future__ import annotations

from datetime import datetime, timezone

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

from app.source_contracts.enums import SourceKey, TimeBasis
from app.source_contracts.freshness import RefreshPolicy

_SEED_TIME = datetime(2026, 10, 9, tzinfo=timezone.utc)


class SourceRegistryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: SourceKey
    source_name: str = Field(min_length=1)
    authority: str = Field(min_length=1)
    base_url: AnyHttpUrl
    terms_url: AnyHttpUrl
    attribution: str = Field(min_length=1)
    refresh_policy: RefreshPolicy
    enabled: bool


def initial_registry_entries() -> tuple[SourceRegistryEntry, ...]:
    return (
        SourceRegistryEntry(
            source_key=SourceKey.CSDI,
            source_name="CSDI 3D Pedestrian Network",
            authority="Lands Department, Hong Kong SAR Government",
            base_url="https://portal.csdi.gov.hk/",
            terms_url="https://portal.csdi.gov.hk/",
            attribution=(
                "© Lands Department, Hong Kong SAR Government. "
                "Common Spatial Data Infrastructure (CSDI)."
            ),
            refresh_policy=RefreshPolicy(
                fresh_after_seconds=300,
                stale_after_seconds=900,
                expired_after_seconds=3600,
                allow_source_provided_freshness=False,
                required_time_basis=TimeBasis.FETCHED_AT,
            ),
            enabled=True,
        ),
        SourceRegistryEntry(
            source_key=SourceKey.HKO,
            source_name="Hong Kong Observatory",
            authority="Hong Kong Observatory, Hong Kong SAR Government",
            base_url="https://www.hko.gov.hk/",
            terms_url="https://www.hko.gov.hk/en/abouthko/disclaimer.htm",
            attribution="© Hong Kong Observatory, Hong Kong SAR Government.",
            refresh_policy=RefreshPolicy(
                fresh_after_seconds=60,
                stale_after_seconds=300,
                expired_after_seconds=1800,
                allow_source_provided_freshness=False,
                required_time_basis=TimeBasis.ISSUED_AT,
            ),
            enabled=True,
        ),
        SourceRegistryEntry(
            source_key=SourceKey.MARINE_DEPARTMENT,
            source_name="Marine Department typhoon shelters",
            authority="Marine Department, Hong Kong SAR Government",
            base_url="https://www.mardep.gov.hk/",
            terms_url="https://www.mardep.gov.hk/",
            attribution="© Marine Department, Hong Kong SAR Government.",
            refresh_policy=RefreshPolicy(
                fresh_after_seconds=86400,
                stale_after_seconds=604800,
                expired_after_seconds=None,
                allow_source_provided_freshness=False,
                required_time_basis=TimeBasis.FETCHED_AT,
            ),
            enabled=True,
        ),
    )


def seed_timestamp() -> datetime:
    return _SEED_TIME
