from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.source_contracts.enums import FreshnessState, OperatingMode
from app.source_contracts.timeutil import require_utc
from app.source_contracts.version import CONTRACT_VERSION


class LiveMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[OperatingMode.LIVE]
    fetched_at: datetime
    provider_request_id: str | None = None
    provider_response_id: str | None = None

    @model_validator(mode="after")
    def require_fetched_time(self) -> Self:
        self.fetched_at = require_utc(self.fetched_at, "fetched_at")
        return self


class SnapshotMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[OperatingMode.SNAPSHOT]
    snapshot_version: str = Field(min_length=1)
    snapshot_at: datetime

    @model_validator(mode="after")
    def require_snapshot_time(self) -> Self:
        self.snapshot_at = require_utc(self.snapshot_at, "snapshot_at")
        return self


class ReplayMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[OperatingMode.REPLAY]
    fixture_id: str | None = None
    event_sequence_id: str | None = None
    demo_or_test: Literal[True] = True

    @model_validator(mode="after")
    def require_replay_identity(self) -> Self:
        fixture = (self.fixture_id or "").strip()
        event = (self.event_sequence_id or "").strip()
        if not fixture and not event:
            raise ValueError("replay mode requires fixture_id or event_sequence_id")
        self.fixture_id = fixture or None
        self.event_sequence_id = event or None
        return self


class OfflineMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal[OperatingMode.OFFLINE]
    cached_age_seconds: int = Field(ge=0)
    non_live_limitation: str = Field(min_length=1)


ModeMetadata = Annotated[
    LiveMetadata | SnapshotMetadata | ReplayMetadata | OfflineMetadata,
    Field(discriminator="mode"),
]


class ProvenanceEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: str = CONTRACT_VERSION
    mode: OperatingMode
    source_name: str = Field(min_length=1)
    source_record_id: str | None = None
    fetched_at: datetime | None = None
    issued_at: datetime | None = None
    valid_until: datetime | None = None
    source_version: str | None = None
    freshness_state: FreshnessState
    source_provided_freshness: FreshnessState | None = None
    mode_metadata: ModeMetadata

    @model_validator(mode="after")
    def enforce_mode_contract(self) -> Self:
        if self.contract_version != CONTRACT_VERSION:
            raise ValueError("unsupported contract version")
        if self.mode is not self.mode_metadata.mode:
            raise ValueError("mode_metadata.mode must match mode")
        self.source_record_id = self.source_record_id.strip() if self.source_record_id else None
        if self.source_record_id == "":
            self.source_record_id = None
        for field in ("fetched_at", "issued_at", "valid_until"):
            value = getattr(self, field)
            if value is not None:
                setattr(self, field, require_utc(value, field))
        if self.mode is OperatingMode.LIVE:
            if self.fetched_at is None:
                raise ValueError("live mode requires fetched_at")
            if not isinstance(self.mode_metadata, LiveMetadata):
                raise ValueError("live mode requires live metadata")
            if self.fetched_at != self.mode_metadata.fetched_at:
                raise ValueError("live fetched_at must match live metadata")
        if self.mode is OperatingMode.SNAPSHOT and not isinstance(self.mode_metadata, SnapshotMetadata):
            raise ValueError("snapshot mode requires snapshot metadata")
        if self.mode is OperatingMode.REPLAY and not isinstance(self.mode_metadata, ReplayMetadata):
            raise ValueError("replay mode requires replay metadata")
        if self.mode is OperatingMode.OFFLINE and not isinstance(self.mode_metadata, OfflineMetadata):
            raise ValueError("offline mode requires offline metadata")
        if self.issued_at is not None and self.fetched_at is not None and self.issued_at > self.fetched_at:
            raise ValueError("issued_at must be earlier than or equal to fetched_at")
        if self.valid_until is not None and self.issued_at is not None and self.valid_until < self.issued_at:
            raise ValueError("valid_until must be greater than or equal to issued_at")
        return self
