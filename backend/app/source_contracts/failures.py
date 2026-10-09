from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.source_contracts.enums import FailureCategory, SourceKey
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.timeutil import require_utc
from app.source_contracts.validation import ValidationMetadata

_FORBIDDEN_TEXT = ("traceback", "authorization", "bearer ", "cookie", "token=")


class SafeFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: SourceKey
    category: FailureCategory
    outcome_code: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    observed_at: datetime
    message: str = Field(min_length=1, max_length=512)
    validation: ValidationMetadata | None = None
    last_known_provenance: ProvenanceEnvelope | None = None
    retryable: bool | None = None
    provider_request_id: str | None = None
    provider_response_id: str | None = None
    success: bool = False

    @field_validator("observed_at")
    @classmethod
    def utc_observed_at(cls, value: datetime) -> datetime:
        return require_utc(value, "observed_at")

    @field_validator("message")
    @classmethod
    def safe_message(cls, value: str) -> str:
        lowered = value.lower()
        if any(token in lowered for token in _FORBIDDEN_TEXT):
            raise ValueError("failure message contains unsafe diagnostic text")
        return value

    @field_validator("success")
    @classmethod
    def never_successful(cls, value: bool) -> bool:
        if value:
            raise ValueError("a safe failure cannot be a success outcome")
        return value
