from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.source_contracts.enums import (
    AccessibilityState,
    ContractStatus,
    RecordType,
    SourceKey,
)
from app.source_contracts.failures import SafeFailure
from app.source_contracts.geometry import GeometryValue
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.validation import ValidationMetadata
from app.source_contracts.values import ValueState
from app.source_contracts.version import CONTRACT_VERSION

ACCESSIBILITY_FACTS = ("stairs", "lifts", "levels", "ramps", "indoor_outdoor", "footbridge")
SAFETY_FACTS = ("capacity", "accessibility", "opening_status", "facility_availability", "safety_evidence")


class ProviderIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_name: str = Field(min_length=1)
    provider_code: str | None = None
    dataset_name: str | None = None


class PointValue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    geometry: GeometryValue
    label: str | None = None


class VerticalTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str = Field(min_length=1)
    provider_id: str | None = None
    from_level: ValueState[str] | None = None
    to_level: ValueState[str] | None = None
    indoor_outdoor: ValueState[str] | None = None


class RouteStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: int = Field(ge=0)
    provider_step_id: str | None = None
    instruction: str | None = None
    geometry: GeometryValue | None = None
    level: ValueState[str] | None = None
    elevation_meters: ValueState[float] | None = None
    indoor_outdoor: ValueState[str] | None = None
    vertical_transition: VerticalTransition | None = None


class AccessibilityCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: AccessibilityState = AccessibilityState.NOT_EVALUATED
    attributes: dict[str, ValueState[Any]] = Field(default_factory=dict)
    explanation: str = Field(
        default="Accessibility was not evaluated. A returned pedestrian route is not an accessibility approval.",
        min_length=1,
        max_length=512,
    )


class SourceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_type: RecordType
    record_id: UUID
    source: SourceKey
    provenance: ProvenanceEnvelope
    attributes: dict[str, Any] = Field(default_factory=dict)
    geometry: GeometryValue | None = None
    validation: ValidationMetadata
    contract_version: str = CONTRACT_VERSION


class CSDIRouteResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: str = CONTRACT_VERSION
    contract_status: ContractStatus
    origin: PointValue | None = None
    destination: PointValue | None = None
    geometry: GeometryValue | None = None
    steps: list[RouteStep] | None = None
    distance_meters: float | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)
    provider_identity: ProviderIdentity
    provider_request_id: str | None = None
    provider_response_id: str | None = None
    network_version: str | None = None
    vertical_information: list[VerticalTransition] | None = None
    accessibility_check: AccessibilityCheck = Field(default_factory=AccessibilityCheck)
    provenance: ProvenanceEnvelope
    validation: ValidationMetadata
    safe_failure: SafeFailure | None = None
    explanation: str = Field(min_length=1, max_length=512)
