from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, Sequence
from uuid import UUID

from app.source_contracts.enums import FailureCategory, PublicationStatus, RecordType, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.health import SourceHealth
from app.source_contracts.registry import SourceRegistryEntry
from app.source_contracts.validation import ValidationMetadata
from app.source_contracts.version import CANONICAL_VERSION


class PersistenceUnavailableError(RuntimeError):
    """Source-contract persistence could not be reached. The message stays internal."""


@dataclass(frozen=True, slots=True)
class PublishCommand:
    source: SourceKey
    publication_key: str
    source_record_id: str | None
    source_record_identity: str
    source_version: str | None
    source_version_identity: str
    payload_hash: str
    canonical_version: str
    trusted: bool
    record_type: RecordType
    contract_status: str | None
    contract_version: str
    provenance_json: dict
    validation_json: dict
    normalized_payload_json: dict
    geometry_json: dict | None
    geometry_crs: str | None
    raw_response_hash: str | None
    observed_at: datetime
    safe_failure_json: dict | None
    outcome_json: dict
    health_freshness: str | None
    health_data_age_seconds: int | None


@dataclass(frozen=True, slots=True)
class PublishResult:
    status: PublicationStatus
    publication_id: UUID | None
    publication_key: str
    payload_hash: str
    canonical_version: str
    validation: ValidationMetadata
    safe_failure: SafeFailure | None
    normalized_payload_json: dict | None


@dataclass(frozen=True, slots=True)
class StoredPublication:
    publication_id: UUID
    source_key: SourceKey
    record_type: RecordType
    source_record_id: str | None
    source_record_identity: str
    source_version: str | None
    source_version_identity: str
    publication_key: str
    contract_version: str
    contract_status: str | None
    provenance_json: dict
    validation_json: dict
    normalized_payload_json: dict
    payload_hash: str
    canonical_version: str
    raw_response_hash: str | None
    geometry_json: dict | None
    geometry_crs: str | None
    published_at: datetime


class SourceRegistryRepository(Protocol):
    def get(self, source: SourceKey) -> SourceRegistryEntry | None: ...

    def list_configured(self) -> Sequence[SourceRegistryEntry]: ...

    def list_enabled(self) -> Sequence[SourceRegistryEntry]: ...


class SourcePublicationRepository(Protocol):
    def publish_idempotently(self, command: PublishCommand) -> PublishResult: ...

    def get_publication(self, publication_id: UUID) -> StoredPublication | None: ...

    def get_latest_valid(self, source: SourceKey) -> StoredPublication | None: ...


class SourceHealthRepository(Protocol):
    def record_success(
        self,
        source: SourceKey,
        *,
        successful_at: datetime,
        attempted_at: datetime,
        publication_id: UUID,
        data_age_seconds: int | None,
        freshness_state: str,
    ) -> SourceHealth: ...

    def record_failure(
        self,
        source: SourceKey,
        failure: SafeFailure,
        attempted_at: datetime,
    ) -> SourceHealth: ...

    def get(self, source: SourceKey) -> SourceHealth: ...


ATTEMPT_FAILURES = {
    FailureCategory.TRANSPORT,
    FailureCategory.TIMEOUT,
    FailureCategory.RATE_LIMITED,
    FailureCategory.MALFORMED_RESPONSE,
    FailureCategory.VALIDATION_FAILED,
    FailureCategory.GEOMETRY_INVALID,
    FailureCategory.SOURCE_UNAVAILABLE,
    FailureCategory.CONTRACT_INVALID,
}
