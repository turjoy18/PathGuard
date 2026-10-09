from __future__ import annotations

from datetime import datetime
from typing import Protocol, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.source_contracts.enums import FreshnessState, OperatingMode, TimeBasis
from app.source_contracts.provenance import OfflineMetadata, ProvenanceEnvelope
from app.source_contracts.timeutil import require_utc


class FreshnessInputError(ValueError):
    def __init__(self, code: str, path: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.path = path
        self.detail = detail


class RefreshPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fresh_after_seconds: int = Field(gt=0)
    stale_after_seconds: int = Field(gt=0)
    expired_after_seconds: int | None = Field(default=None, gt=0)
    allow_source_provided_freshness: bool
    required_time_basis: TimeBasis

    @model_validator(mode="after")
    def ordered_thresholds(self) -> Self:
        if self.fresh_after_seconds > self.stale_after_seconds:
            raise ValueError("fresh_after_seconds must be less than or equal to stale_after_seconds")
        if (
            self.expired_after_seconds is not None
            and self.stale_after_seconds > self.expired_after_seconds
        ):
            raise ValueError("stale_after_seconds must be less than or equal to expired_after_seconds")
        return self


class FreshnessPolicy(Protocol):
    def evaluate(
        self,
        *,
        now: datetime,
        provenance: ProvenanceEnvelope,
        policy: RefreshPolicy,
    ) -> FreshnessState: ...


def state_for_age(age: int, policy: RefreshPolicy) -> FreshnessState:
    if age <= policy.fresh_after_seconds:
        return FreshnessState.FRESH
    if policy.expired_after_seconds is not None and age > policy.expired_after_seconds:
        return FreshnessState.EXPIRED
    return FreshnessState.STALE


class DeterministicFreshnessPolicy:
    def evaluate(
        self,
        *,
        now: datetime,
        provenance: ProvenanceEnvelope,
        policy: RefreshPolicy,
    ) -> FreshnessState:
        now = require_utc(now, "now")
        if policy.allow_source_provided_freshness and provenance.source_provided_freshness is not None:
            return provenance.source_provided_freshness
        age = self._age_seconds(now, provenance, policy)
        if age is None:
            return FreshnessState.UNKNOWN
        return state_for_age(age, policy)

    def _age_seconds(
        self,
        now: datetime,
        provenance: ProvenanceEnvelope,
        policy: RefreshPolicy,
    ) -> int | None:
        basis = policy.required_time_basis
        if basis is TimeBasis.CACHED_AGE:
            if provenance.mode is not OperatingMode.OFFLINE or not isinstance(
                provenance.mode_metadata, OfflineMetadata
            ):
                return None
            return provenance.mode_metadata.cached_age_seconds
        if basis is TimeBasis.VALID_UNTIL:
            if provenance.valid_until is None:
                return None
            if now > provenance.valid_until:
                return (policy.expired_after_seconds or policy.stale_after_seconds) + 1
            return 0
        timestamp = provenance.fetched_at if basis is TimeBasis.FETCHED_AT else provenance.issued_at
        field = "fetched_at" if basis is TimeBasis.FETCHED_AT else "issued_at"
        if timestamp is None:
            return None
        delta = (now - timestamp).total_seconds()
        if delta < 0:
            raise FreshnessInputError(
                "negative_age",
                field,
                "Source time is in the future and cannot be treated as fresh.",
            )
        return int(delta)
