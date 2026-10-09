from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import datetime
from uuid import UUID, uuid4

from app.source_contracts.canonical import (
    canonical_hash,
    default_publication_key,
    record_identity,
    version_identity,
)
from app.source_contracts.checks import (
    DefaultContractValidator,
    normalize_accessibility,
    normalize_safety_attributes,
)
from app.source_contracts.enums import (
    ContractStatus,
    FailureCategory,
    FreshnessState,
    PublicationStatus,
    RecordType,
    SourceKey,
    ValidationClassification,
)
from app.source_contracts.failures import SafeFailure
from app.source_contracts.freshness import DeterministicFreshnessPolicy, FreshnessInputError, state_for_age
from app.source_contracts.handoff import AdapterSubmission, ProviderAdapterHandoff, PublicationOutcome
from app.source_contracts.health import SourceHealth
from app.source_contracts.models import CSDIRouteResult, SourceRecord
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.registry import SourceRegistryEntry
from app.source_contracts.repository import (
    ATTEMPT_FAILURES,
    PersistenceUnavailableError,
    PublishCommand,
    PublishResult,
    SourceHealthRepository,
    SourcePublicationRepository,
    SourceRegistryRepository,
    StoredPublication,
)
from app.source_contracts.timeutil import require_utc
from app.source_contracts.validation import ValidationMetadata, finding, metadata_from_findings
from app.source_contracts.version import CANONICAL_VERSION, CONTRACT_VERSION

logger = logging.getLogger(__name__)

Normalized = SourceRecord | CSDIRouteResult

_ROUTE_EXPLANATIONS = {
    ContractStatus.ROUTE_RETURNED: (
        "A validated pedestrian route was returned. This is not an accessibility approval."
    ),
    ContractStatus.ROUTE_REJECTED: "The route response failed shared contract validation.",
    ContractStatus.ROUTE_UNAVAILABLE: "The provider established that no pedestrian route is available.",
    ContractStatus.ROUTE_UNKNOWN: (
        "The available information does not establish a valid route or a valid no-route result."
    ),
}


class SourceContractService:
    def __init__(
        self,
        registry: SourceRegistryRepository,
        publications: SourcePublicationRepository,
        health: SourceHealthRepository,
        *,
        validator: DefaultContractValidator | None = None,
        freshness: DeterministicFreshnessPolicy | None = None,
        ids: Callable[[], UUID] | None = None,
    ) -> None:
        self._registry = registry
        self._publications = publications
        self._health = health
        self._validator = validator or DefaultContractValidator()
        self._freshness = freshness or DeterministicFreshnessPolicy()
        self._ids = ids or uuid4

    def submit(self, submission: AdapterSubmission, now: datetime) -> ProviderAdapterHandoff:
        now = require_utc(now, "now")
        try:
            return self._submit(submission, now)
        except PersistenceUnavailableError:
            logger.warning(
                "source_contract_persistence_unavailable",
                extra={"source_key": submission.source.value, "contract_version": CONTRACT_VERSION},
            )
            failure = self._failure(
                submission,
                FailureCategory.DATABASE_UNAVAILABLE,
                "database_unavailable",
                "Official-source publication storage is unavailable.",
                now,
                submission.provenance,
                retryable=True,
            )
            return self._handoff(submission, None, submission.validation, None, failure)

    def validate(self, submission: AdapterSubmission, now: datetime) -> ValidationMetadata:
        now = require_utc(now, "now")
        _provenance, findings, _reject = self._freshness_for(submission, now)
        validation = self._validator.validate_handoff(submission)
        return metadata_from_findings(
            [*validation.findings, *findings],
            provider_request_id=submission.validation.provider_request_id,
            provider_response_id=submission.validation.provider_response_id,
            correlation_id=submission.validation.correlation_id,
        )

    def publish(self, submission: AdapterSubmission, now: datetime) -> PublicationOutcome:
        handoff = self.submit(submission, now)
        if handoff.publication is None:
            failure = handoff.safe_failure or self._failure(
                submission,
                FailureCategory.VALIDATION_FAILED,
                "source_response_invalid",
                "The submission was not published.",
                now,
                submission.provenance,
            )
            return PublicationOutcome(
                status=PublicationStatus.REJECTED,
                publication_id=None,
                publication_key=submission.publication_key or submission.source.value,
                payload_hash=_hash_failure(submission, failure),
                canonical_version=CANONICAL_VERSION,
                validation=handoff.validation,
                safe_failure=failure,
            )
        return handoff.publication

    def record_failure(self, source: SourceKey, failure: SafeFailure, attempted_at: datetime) -> SourceHealth:
        return self._health.record_failure(source, failure, require_utc(attempted_at, "attempted_at"))

    def get_source_health(self, source: SourceKey, now: datetime) -> SourceHealth:
        now = require_utc(now, "now")
        health = self._health.get(source)
        if health.last_successful_fetch_at is None:
            state = (
                FreshnessState.UNKNOWN
                if health.last_attempted_fetch_at is None
                else FreshnessState.UNAVAILABLE
            )
            return health.model_copy(update={"freshness_state": state, "data_age_seconds": None})
        entry = self._registry.get(source)
        age = int((now - health.last_successful_fetch_at).total_seconds())
        if age < 0 or entry is None:
            return health.model_copy(
                update={"freshness_state": FreshnessState.UNKNOWN, "data_age_seconds": None}
            )
        return health.model_copy(
            update={"freshness_state": state_for_age(age, entry.refresh_policy), "data_age_seconds": age}
        )

    def get_registry(self) -> list[SourceRegistryEntry]:
        return list(self._registry.list_configured())

    def get_publication(self, publication_id: UUID) -> StoredPublication | None:
        return self._publications.get_publication(publication_id)

    def human_shelter_candidates(self, records: Sequence[SourceRecord]) -> list[SourceRecord]:
        return [record for record in records if record.record_type is RecordType.HUMAN_SHELTER]

    def _submit(self, submission: AdapterSubmission, now: datetime) -> ProviderAdapterHandoff:
        if submission.failure is not None and submission.failure.category in ATTEMPT_FAILURES:
            self._remember_failure(submission.failure, submission.fetch_metadata.attempted_at)
            return self._handoff(submission, None, submission.validation, None, submission.failure)

        entry = self._registry.get(submission.source)
        if entry is None or not entry.enabled:
            failure = self._failure(
                submission,
                FailureCategory.SOURCE_UNAVAILABLE,
                "source_unavailable",
                "The source is not configured or is disabled.",
                now,
                submission.provenance,
            )
            self._remember_failure(failure, submission.fetch_metadata.attempted_at)
            return self._handoff(submission, None, submission.validation, None, failure)

        provenance, freshness_findings, freshness_rejects = self._freshness_for(submission, now)
        normalized, validation, trusted = self._prepare(submission, provenance, freshness_findings)
        if freshness_rejects:
            trusted = False
        if normalized is None:
            failure = self._failure(
                submission,
                FailureCategory.CONTRACT_INVALID,
                "source_response_invalid",
                "The submission did not contain a normalized contract result.",
                now,
                provenance,
                validation,
            )
            self._remember_failure(failure, submission.fetch_metadata.attempted_at)
            return self._handoff(submission, None, validation, None, failure)

        publication_key = submission.publication_key or default_publication_key(
            submission.source.value,
            provenance.source_record_id,
            provenance.source_version,
        )
        safe_failure = self._result_failure(submission, normalized, validation, now, provenance, trusted)
        if safe_failure is not None:
            normalized = self._attach_failure(normalized, safe_failure)
        hash_source = self._hash_source(submission, normalized)
        payload_hash = canonical_hash(
            hash_source,
            source=submission.source.value,
            publication_key=publication_key,
        )
        publication_id = self._ids() if trusted else None
        outcome = PublicationOutcome(
            status=PublicationStatus.PUBLISHED if trusted else PublicationStatus.REJECTED,
            publication_id=publication_id,
            publication_key=publication_key,
            payload_hash=payload_hash,
            canonical_version=CANONICAL_VERSION,
            validation=validation,
            safe_failure=safe_failure,
        )
        command = self._command(
            submission,
            normalized,
            provenance,
            validation,
            publication_key,
            payload_hash,
            trusted,
            publication_id,
            outcome,
            now,
            safe_failure,
        )
        try:
            stored = self._publications.publish_idempotently(command)
        except PersistenceUnavailableError:
            raise
        if stored.status is PublicationStatus.CONFLICT:
            conflict = self._failure(
                submission,
                FailureCategory.PUBLICATION_CONFLICT,
                "publication_conflict",
                "The publication identity is already associated with a different payload.",
                now,
                provenance,
                validation,
                retryable=False,
            )
            conflict_outcome = PublicationOutcome(
                status=PublicationStatus.CONFLICT,
                publication_id=stored.publication_id,
                publication_key=publication_key,
                payload_hash=payload_hash,
                canonical_version=CANONICAL_VERSION,
                validation=validation,
                safe_failure=conflict,
            )
            self._log(submission, "conflict", publication_key)
            return self._handoff(submission, normalized, validation, conflict_outcome, conflict)
        if stored.status is PublicationStatus.REJECTED:
            failure = stored.safe_failure or safe_failure
            if failure is not None:
                self._remember_failure(failure, submission.fetch_metadata.attempted_at)
            self._log(submission, "rejected", publication_key)
            return self._handoff(submission, normalized, stored.validation, self._outcome(stored), failure)
        self._log(submission, stored.status.value, publication_key)
        return self._handoff(
            submission,
            self._parse_stored(stored) or normalized,
            stored.validation,
            self._outcome(stored),
            stored.safe_failure,
        )

    def _freshness_for(
        self,
        submission: AdapterSubmission,
        now: datetime,
    ) -> tuple[ProvenanceEnvelope, list, bool]:
        entry = self._registry.get(submission.source)
        provenance = submission.provenance.model_copy(update={"contract_version": CONTRACT_VERSION})
        if entry is None:
            return provenance.model_copy(update={"freshness_state": FreshnessState.UNKNOWN}), [], False
        try:
            state = self._freshness.evaluate(now=now, provenance=provenance, policy=entry.refresh_policy)
            return provenance.model_copy(update={"freshness_state": state}), [], False
        except FreshnessInputError as exc:
            return (
                provenance.model_copy(update={"freshness_state": FreshnessState.UNKNOWN}),
                [
                    finding(
                        exc.code,
                        exc.path,
                        ValidationClassification.ERROR,
                        exc.detail,
                    )
                ],
                True,
            )

    def _prepare(
        self,
        submission: AdapterSubmission,
        provenance: ProvenanceEnvelope,
        extra: list,
    ) -> tuple[Normalized | None, ValidationMetadata, bool]:
        result = submission.normalization_result
        base = metadata_from_findings(
            [*submission.validation.findings, *extra],
            provider_request_id=submission.fetch_metadata.provider_request_id,
            provider_response_id=submission.fetch_metadata.provider_response_id,
            correlation_id=submission.validation.correlation_id,
        )
        if isinstance(result, CSDIRouteResult):
            return self._prepare_route(result, provenance, base)
        if isinstance(result, SourceRecord):
            return self._prepare_record(submission, result, provenance, base)
        validation = self._validator.validate_handoff(submission)
        return None, metadata_from_findings([*base.findings, *validation.findings]), False

    def _prepare_route(
        self,
        result: CSDIRouteResult,
        provenance: ProvenanceEnvelope,
        base: ValidationMetadata,
    ) -> tuple[CSDIRouteResult, ValidationMetadata, bool]:
        route = normalize_accessibility(
            result.model_copy(
                update={
                    "provenance": provenance,
                    "contract_version": CONTRACT_VERSION,
                    "provider_request_id": result.provider_request_id or base.provider_request_id,
                    "provider_response_id": result.provider_response_id or base.provider_response_id,
                }
            )
        )
        checked = self._validator.validate_csdi_route(route)
        validation = metadata_from_findings(
            [*base.findings, *checked.findings],
            provider_request_id=checked.provider_request_id,
            provider_response_id=checked.provider_response_id,
            correlation_id=checked.correlation_id,
        )
        if route.contract_status is ContractStatus.ROUTE_RETURNED and not validation.valid:
            rejected = route.model_copy(
                update={
                    "contract_status": ContractStatus.ROUTE_REJECTED,
                    "geometry": None,
                    "validation": validation,
                    "explanation": _ROUTE_EXPLANATIONS[ContractStatus.ROUTE_REJECTED],
                }
            )
            return rejected, validation, False
        if route.contract_status in {ContractStatus.ROUTE_UNAVAILABLE, ContractStatus.ROUTE_UNKNOWN}:
            stripped = route.model_copy(
                update={
                    "geometry": None,
                    "steps": None,
                    "distance_meters": None,
                    "duration_seconds": None,
                    "origin": None,
                    "destination": None,
                    "validation": validation,
                    "explanation": route.explanation or _ROUTE_EXPLANATIONS[route.contract_status],
                }
            )
            return stripped, validation, validation.valid
        if route.contract_status is ContractStatus.ROUTE_REJECTED:
            rejected = route.model_copy(update={"geometry": None, "validation": validation})
            return rejected, validation, False
        published = route.model_copy(
            update={
                "validation": validation,
                "explanation": route.explanation or _ROUTE_EXPLANATIONS[ContractStatus.ROUTE_RETURNED],
            }
        )
        return published, validation, validation.valid

    def _prepare_record(
        self,
        submission: AdapterSubmission,
        result: SourceRecord,
        provenance: ProvenanceEnvelope,
        base: ValidationMetadata,
    ) -> tuple[SourceRecord, ValidationMetadata, bool]:
        record_type = result.record_type
        if submission.source is SourceKey.MARINE_DEPARTMENT and record_type is not RecordType.HUMAN_SHELTER:
            record_type = RecordType.TYPHOON_SHELTER_REFERENCE
        record = normalize_safety_attributes(
            result.model_copy(
                update={
                    "record_type": record_type,
                    "source": submission.source,
                    "provenance": provenance,
                    "contract_version": CONTRACT_VERSION,
                }
            )
        )
        checked = self._validator.validate_source_record(record)
        validation = metadata_from_findings(
            [*base.findings, *checked.findings],
            provider_request_id=base.provider_request_id,
            provider_response_id=base.provider_response_id,
            correlation_id=base.correlation_id,
        )
        record = record.model_copy(update={"validation": validation})
        return record, validation, validation.valid

    def _result_failure(
        self,
        submission: AdapterSubmission,
        normalized: Normalized,
        validation: ValidationMetadata,
        now: datetime,
        provenance: ProvenanceEnvelope,
        trusted: bool,
    ) -> SafeFailure | None:
        if isinstance(normalized, CSDIRouteResult):
            status = normalized.contract_status
            if status is ContractStatus.ROUTE_UNAVAILABLE:
                return self._failure(
                    submission,
                    FailureCategory.NO_ROUTE,
                    "route_not_returned",
                    normalized.explanation,
                    now,
                    provenance,
                    validation,
                    retryable=False,
                )
            if status is ContractStatus.ROUTE_UNKNOWN:
                return self._failure(
                    submission,
                    FailureCategory.UNKNOWN_STATUS,
                    "route_status_unknown",
                    normalized.explanation,
                    now,
                    provenance,
                    validation,
                    retryable=False,
                )
            if status is ContractStatus.ROUTE_REJECTED or not trusted:
                category = (
                    FailureCategory.GEOMETRY_INVALID
                    if any(item.code.startswith("geometry_") for item in validation.error_findings())
                    else FailureCategory.VALIDATION_FAILED
                )
                return self._failure(
                    submission,
                    category,
                    "source_response_invalid",
                    normalized.explanation,
                    now,
                    provenance,
                    validation,
                    retryable=False,
                )
        if not trusted:
            return self._failure(
                submission,
                FailureCategory.VALIDATION_FAILED,
                "source_response_invalid",
                "The source record failed shared contract validation.",
                now,
                provenance,
                validation,
                retryable=False,
            )
        if provenance.freshness_state is FreshnessState.UNKNOWN:
            return None
        return None

    def _attach_failure(self, normalized: Normalized, failure: SafeFailure) -> Normalized:
        if isinstance(normalized, CSDIRouteResult):
            return normalized.model_copy(update={"safe_failure": failure})
        return normalized

    def _hash_source(self, submission: AdapterSubmission, normalized: Normalized) -> Normalized:
        original = submission.normalization_result
        if (
            isinstance(normalized, CSDIRouteResult)
            and normalized.contract_status is ContractStatus.ROUTE_REJECTED
            and isinstance(original, CSDIRouteResult)
            and original.geometry is not None
        ):
            return normalized.model_copy(update={"geometry": original.geometry})
        return normalized

    def _command(
        self,
        submission: AdapterSubmission,
        normalized: Normalized,
        provenance: ProvenanceEnvelope,
        validation: ValidationMetadata,
        publication_key: str,
        payload_hash: str,
        trusted: bool,
        publication_id: UUID | None,
        outcome: PublicationOutcome,
        now: datetime,
        safe_failure: SafeFailure | None,
    ) -> PublishCommand:
        payload = normalized.model_dump(mode="json")
        geometry = getattr(normalized, "geometry", None)
        geometry_json = geometry.model_dump(mode="json") if geometry is not None else None
        geometry_crs = geometry.crs if geometry is not None else None
        contract_status = normalized.contract_status.value if isinstance(normalized, CSDIRouteResult) else None
        record_type = (
            RecordType.CSDI_ROUTE_RESULT if isinstance(normalized, CSDIRouteResult) else normalized.record_type
        )
        age = None
        if provenance.fetched_at is not None:
            delta = int((now - provenance.fetched_at).total_seconds())
            age = delta if delta >= 0 else None
        return PublishCommand(
            source=submission.source,
            publication_key=publication_key,
            source_record_id=provenance.source_record_id,
            source_record_identity=record_identity(provenance.source_record_id, publication_key),
            source_version=provenance.source_version,
            source_version_identity=version_identity(provenance.source_version),
            payload_hash=payload_hash,
            canonical_version=CANONICAL_VERSION,
            trusted=trusted,
            record_type=record_type,
            contract_status=contract_status,
            contract_version=CONTRACT_VERSION,
            provenance_json=provenance.model_dump(mode="json"),
            validation_json=validation.model_dump(mode="json"),
            normalized_payload_json=payload,
            geometry_json=geometry_json if trusted else None,
            geometry_crs=geometry_crs if trusted else None,
            raw_response_hash=submission.raw_response_hash or submission.fetch_metadata.raw_response_hash,
            observed_at=now,
            safe_failure_json=safe_failure.model_dump(mode="json") if safe_failure else None,
            outcome_json=outcome.model_dump(mode="json"),
            health_freshness=provenance.freshness_state.value,
            health_data_age_seconds=age,
        )

    def _remember_failure(self, failure: SafeFailure, attempted_at: datetime) -> None:
        if failure.category is FailureCategory.DATABASE_UNAVAILABLE:
            return
        try:
            self._health.record_failure(failure.source, failure, attempted_at)
        except PersistenceUnavailableError:
            raise

    def _failure(
        self,
        submission: AdapterSubmission,
        category: FailureCategory,
        outcome_code: str,
        message: str,
        observed_at: datetime,
        provenance: ProvenanceEnvelope | None,
        validation: ValidationMetadata | None = None,
        retryable: bool | None = None,
    ) -> SafeFailure:
        last_known = None
        try:
            latest = self._publications.get_latest_valid(submission.source)
        except PersistenceUnavailableError:
            latest = None
        if latest is not None:
            last_known = ProvenanceEnvelope.model_validate(latest.provenance_json)
        elif provenance is not None and category not in {
            FailureCategory.VALIDATION_FAILED,
            FailureCategory.GEOMETRY_INVALID,
            FailureCategory.CONTRACT_INVALID,
        }:
            last_known = provenance
        return SafeFailure(
            source=submission.source,
            category=category,
            outcome_code=outcome_code,
            observed_at=observed_at,
            message=message,
            validation=validation,
            last_known_provenance=last_known,
            retryable=retryable,
            provider_request_id=submission.fetch_metadata.provider_request_id,
            provider_response_id=submission.fetch_metadata.provider_response_id,
        )

    def _handoff(
        self,
        submission: AdapterSubmission,
        normalized: Normalized | None,
        validation: ValidationMetadata,
        publication: PublicationOutcome | None,
        failure: SafeFailure | None,
    ) -> ProviderAdapterHandoff:
        return ProviderAdapterHandoff(
            source=submission.source,
            fetch_metadata=submission.fetch_metadata,
            normalized_result=normalized,
            provenance=None if normalized is None else normalized.provenance,
            validation=validation,
            publication=publication,
            safe_failure=failure,
            contract_version=CONTRACT_VERSION,
        )

    def _outcome(self, stored: PublishResult) -> PublicationOutcome:
        return PublicationOutcome(
            status=stored.status,
            publication_id=stored.publication_id,
            publication_key=stored.publication_key,
            payload_hash=stored.payload_hash,
            canonical_version=stored.canonical_version,
            validation=stored.validation,
            safe_failure=stored.safe_failure,
        )

    def _parse_stored(self, stored: PublishResult) -> Normalized | None:
        payload = stored.normalized_payload_json
        if payload is None or stored.publication_id is None:
            return None
        publication = self._publications.get_publication(stored.publication_id)
        if publication is None:
            return None
        if publication.record_type is RecordType.CSDI_ROUTE_RESULT:
            return CSDIRouteResult.model_validate(publication.normalized_payload_json)
        return SourceRecord.model_validate(publication.normalized_payload_json)

    def _log(self, submission: AdapterSubmission, event: str, publication_key: str) -> None:
        logger.info(
            "source_contract_%s",
            event,
            extra={
                "source_key": submission.source.value,
                "contract_version": CONTRACT_VERSION,
                "publication_key": publication_key,
                "correlation_id": submission.validation.correlation_id,
                "latency_ms": submission.fetch_metadata.latency_ms,
            },
        )


def _hash_failure(submission: AdapterSubmission, failure: SafeFailure) -> str:
    from pydantic import BaseModel

    class _FailureHash(BaseModel):
        source: str
        outcome_code: str
        category: str

    return canonical_hash(
        _FailureHash(
            source=submission.source.value,
            outcome_code=failure.outcome_code,
            category=failure.category.value,
        ),
        source=submission.source.value,
        publication_key=submission.publication_key or submission.source.value,
    )
