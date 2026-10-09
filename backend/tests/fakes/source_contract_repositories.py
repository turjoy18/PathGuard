from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.source_contracts.enums import FreshnessState, PublicationStatus, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.health import SourceHealth
from app.source_contracts.registry import SourceRegistryEntry, initial_registry_entries
from app.source_contracts.repository import PublishCommand, PublishResult, StoredPublication
from app.source_contracts.validation import ValidationMetadata


class InMemorySourceContractRepository:
    """Deterministic registry, publication, and health store for service tests."""

    def __init__(self, entries: tuple[SourceRegistryEntry, ...] | None = None) -> None:
        self._entries: dict[SourceKey, SourceRegistryEntry] = {}
        self._health: dict[SourceKey, SourceHealth] = {}
        self._publications: dict[UUID, StoredPublication] = {}
        self._latest: dict[SourceKey, UUID] = {}
        self._receipts: dict[tuple[str, str, str, str], PublishResult] = {}
        for entry in entries or initial_registry_entries():
            self._entries[entry.source_key] = entry

    def seed_missing(self) -> None:
        for entry in initial_registry_entries():
            self._entries.setdefault(entry.source_key, entry)

    def replace_entry(self, entry: SourceRegistryEntry) -> None:
        self._entries[entry.source_key] = entry

    def get_entry(self, source: SourceKey) -> SourceRegistryEntry | None:
        return self._entries.get(source)

    def list_configured(self) -> list[SourceRegistryEntry]:
        return [self._entries[key] for key in sorted(self._entries, key=lambda item: item.value)]

    def list_enabled(self) -> list[SourceRegistryEntry]:
        return [entry for entry in self.list_configured() if entry.enabled]

    def publish_idempotently(self, command: PublishCommand) -> PublishResult:
        identity = (
            command.source.value,
            command.source_record_identity,
            command.source_version_identity,
            command.publication_key,
        )
        existing = self._receipts.get(identity)
        if existing is not None:
            if (
                existing.payload_hash == command.payload_hash
                and existing.canonical_version == command.canonical_version
            ):
                status = (
                    PublicationStatus.IDEMPOTENT_REPLAY
                    if existing.status is PublicationStatus.PUBLISHED
                    else existing.status
                )
                return PublishResult(
                    status=status,
                    publication_id=existing.publication_id,
                    publication_key=existing.publication_key,
                    payload_hash=existing.payload_hash,
                    canonical_version=existing.canonical_version,
                    validation=existing.validation,
                    safe_failure=existing.safe_failure,
                    normalized_payload_json=existing.normalized_payload_json,
                )
            return PublishResult(
                status=PublicationStatus.CONFLICT,
                publication_id=existing.publication_id,
                publication_key=command.publication_key,
                payload_hash=command.payload_hash,
                canonical_version=command.canonical_version,
                validation=ValidationMetadata.model_validate(command.validation_json),
                safe_failure=None,
                normalized_payload_json=existing.normalized_payload_json,
            )
        validation = ValidationMetadata.model_validate(command.validation_json)
        safe_failure = (
            SafeFailure.model_validate(command.safe_failure_json) if command.safe_failure_json else None
        )
        if not command.trusted or command.outcome_json.get("publication_id") is None:
            result = PublishResult(
                status=PublicationStatus.REJECTED,
                publication_id=None,
                publication_key=command.publication_key,
                payload_hash=command.payload_hash,
                canonical_version=command.canonical_version,
                validation=validation,
                safe_failure=safe_failure,
                normalized_payload_json=command.normalized_payload_json,
            )
            self._receipts[identity] = result
            return result
        publication_id = UUID(str(command.outcome_json["publication_id"]))
        stored = StoredPublication(
            publication_id=publication_id,
            source_key=command.source,
            record_type=command.record_type,
            source_record_id=command.source_record_id,
            source_record_identity=command.source_record_identity,
            source_version=command.source_version,
            source_version_identity=command.source_version_identity,
            publication_key=command.publication_key,
            contract_version=command.contract_version,
            contract_status=command.contract_status,
            provenance_json=command.provenance_json,
            validation_json=command.validation_json,
            normalized_payload_json=command.normalized_payload_json,
            payload_hash=command.payload_hash,
            canonical_version=command.canonical_version,
            raw_response_hash=command.raw_response_hash,
            geometry_json=command.geometry_json,
            geometry_crs=command.geometry_crs,
            published_at=command.observed_at,
        )
        self._publications[publication_id] = stored
        self._latest[command.source] = publication_id
        result = PublishResult(
            status=PublicationStatus.PUBLISHED,
            publication_id=publication_id,
            publication_key=command.publication_key,
            payload_hash=command.payload_hash,
            canonical_version=command.canonical_version,
            validation=validation,
            safe_failure=safe_failure,
            normalized_payload_json=command.normalized_payload_json,
        )
        self._receipts[identity] = result
        self.record_success(
            command.source,
            successful_at=command.observed_at,
            attempted_at=command.observed_at,
            publication_id=publication_id,
            data_age_seconds=command.health_data_age_seconds,
            freshness_state=command.health_freshness or FreshnessState.UNKNOWN.value,
        )
        return result

    def get_publication(self, publication_id: UUID) -> StoredPublication | None:
        return self._publications.get(publication_id)

    def get_latest_valid(self, source: SourceKey) -> StoredPublication | None:
        publication_id = self._latest.get(source)
        if publication_id is None:
            return None
        return self._publications.get(publication_id)

    def record_success(
        self,
        source: SourceKey,
        *,
        successful_at: datetime,
        attempted_at: datetime,
        publication_id: UUID,
        data_age_seconds: int | None,
        freshness_state: str,
    ) -> SourceHealth:
        current = self._health.get(source)
        health = SourceHealth(
            source_key=source,
            last_successful_fetch_at=successful_at,
            last_attempted_fetch_at=attempted_at,
            last_failure=None if current is None else current.last_failure,
            data_age_seconds=data_age_seconds,
            freshness_state=FreshnessState(freshness_state),
            last_successful_publication_id=publication_id,
        )
        self._health[source] = health
        return health

    def record_failure(self, source: SourceKey, failure: SafeFailure, attempted_at: datetime) -> SourceHealth:
        current = self._health.get(source)
        health = SourceHealth(
            source_key=source,
            last_successful_fetch_at=None if current is None else current.last_successful_fetch_at,
            last_attempted_fetch_at=attempted_at,
            last_failure=failure,
            data_age_seconds=None if current is None else current.data_age_seconds,
            freshness_state=(
                FreshnessState.UNAVAILABLE
                if current is None or current.last_successful_fetch_at is None
                else current.freshness_state
            ),
            last_successful_publication_id=None if current is None else current.last_successful_publication_id,
        )
        self._health[source] = health
        return health

    def get_health(self, source: SourceKey) -> SourceHealth:
        return self._health.get(
            source,
            SourceHealth(source_key=source, freshness_state=FreshnessState.UNKNOWN),
        )


class RegistryPort:
    def __init__(self, store: InMemorySourceContractRepository) -> None:
        self._store = store

    def get(self, source: SourceKey) -> SourceRegistryEntry | None:
        return self._store.get_entry(source)

    def list_configured(self) -> list[SourceRegistryEntry]:
        return self._store.list_configured()

    def list_enabled(self) -> list[SourceRegistryEntry]:
        return self._store.list_enabled()


class PublicationPort:
    def __init__(self, store: InMemorySourceContractRepository) -> None:
        self._store = store

    def publish_idempotently(self, command: PublishCommand) -> PublishResult:
        return self._store.publish_idempotently(command)

    def get_publication(self, publication_id: UUID) -> StoredPublication | None:
        return self._store.get_publication(publication_id)

    def get_latest_valid(self, source: SourceKey) -> StoredPublication | None:
        return self._store.get_latest_valid(source)


class HealthPort:
    def __init__(self, store: InMemorySourceContractRepository) -> None:
        self._store = store

    def record_success(self, source: SourceKey, **kwargs: object) -> SourceHealth:
        return self._store.record_success(source, **kwargs)  # type: ignore[arg-type]

    def record_failure(self, source: SourceKey, failure: SafeFailure, attempted_at: datetime) -> SourceHealth:
        return self._store.record_failure(source, failure, attempted_at)

    def get(self, source: SourceKey) -> SourceHealth:
        return self._store.get_health(source)


def service_for(store: InMemorySourceContractRepository) -> SourceContractService:
    from app.source_contracts.service import SourceContractService

    return SourceContractService(RegistryPort(store), PublicationPort(store), HealthPort(store))

