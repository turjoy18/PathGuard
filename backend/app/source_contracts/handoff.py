from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.source_contracts.enums import PublicationStatus, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.timeutil import require_utc
from app.source_contracts.validation import ValidationMetadata
from app.source_contracts.version import CANONICAL_VERSION

_SENSITIVE = ("authorization", "bearer ", "cookie", "token=", "api_key=")


class FetchMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempted_at: datetime
    completed_at: datetime | None = None
    transport_outcome: str = Field(min_length=1, max_length=64)
    latency_ms: int | None = Field(default=None, ge=0)
    provider_request_id: str | None = None
    provider_response_id: str | None = None
    network_version: str | None = None
    http_status_class: str | None = Field(default=None, pattern=r"^[1-5]xx$")
    raw_response_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")

    @field_validator("attempted_at", "completed_at")
    @classmethod
    def utc_times(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return require_utc(value, "fetch time")

    @model_validator(mode="after")
    def reject_secrets(self) -> "FetchMetadata":
        blob = " ".join(
            str(part)
            for part in (
                self.transport_outcome,
                self.provider_request_id,
                self.provider_response_id,
                self.network_version,
            )
            if part
        ).lower()
        if any(token in blob for token in _SENSITIVE):
            raise ValueError("fetch metadata contains secret material")
        return self


class PublicationOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: PublicationStatus
    publication_id: UUID | None = None
    publication_key: str = Field(min_length=1)
    payload_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    canonical_version: str = CANONICAL_VERSION
    validation: ValidationMetadata
    safe_failure: SafeFailure | None = None


class AdapterSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: SourceKey
    fetch_metadata: FetchMetadata
    provider_payload: dict[str, Any] = Field(default_factory=dict)
    normalization_result: Any = None
    provenance: ProvenanceEnvelope
    validation: ValidationMetadata
    publication_key: str | None = Field(default=None, min_length=1)
    raw_response_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    failure: SafeFailure | None = None


class ProviderAdapterHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: SourceKey
    fetch_metadata: FetchMetadata
    normalized_result: Any = None
    provenance: ProvenanceEnvelope | None = None
    validation: ValidationMetadata
    publication: PublicationOutcome | None = None
    safe_failure: SafeFailure | None = None
    contract_version: str
