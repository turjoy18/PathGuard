from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.db.session import create_db_engine
from app.source_contracts.enums import FreshnessState, PublicationStatus, RecordType, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.freshness import RefreshPolicy
from app.source_contracts.health import SourceHealth
from app.source_contracts.registry import SourceRegistryEntry
from app.source_contracts.repository import (
    PersistenceUnavailableError,
    PublishCommand,
    PublishResult,
    StoredPublication,
)
from app.source_contracts.validation import ValidationMetadata


class SqlSourceContractRepository:
    def __init__(self, database_url: str, engine: Engine | None = None) -> None:
        self._engine = engine or create_db_engine(database_url)

    def get_entry(self, source: SourceKey) -> SourceRegistryEntry | None:
        try:
            with self._engine.connect() as connection:
                row = connection.execute(
                    text(
                        """
                        SELECT source_key, source_name, authority, base_url, terms_url, attribution,
                               refresh_policy_json, enabled
                        FROM source_registry
                        WHERE source_key = :source_key
                        """
                    ),
                    {"source_key": source.value},
                ).mappings().one_or_none()
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("registry read failed") from exc
        return None if row is None else _entry(row)

    def list_configured(self) -> list[SourceRegistryEntry]:
        try:
            with self._engine.connect() as connection:
                rows = connection.execute(
                    text(
                        """
                        SELECT source_key, source_name, authority, base_url, terms_url, attribution,
                               refresh_policy_json, enabled
                        FROM source_registry
                        ORDER BY source_key
                        """
                    )
                ).mappings()
                return [_entry(row) for row in rows]
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("registry list failed") from exc

    def list_enabled(self) -> list[SourceRegistryEntry]:
        return [entry for entry in self.list_configured() if entry.enabled]

    def publish_idempotently(self, command: PublishCommand) -> PublishResult:
        try:
            with self._engine.begin() as connection:
                return self._publish(connection, command)
        except IntegrityError:
            with self._engine.begin() as connection:
                existing = self._lock_receipt(connection, command)
                if existing is None:
                    raise PersistenceUnavailableError("publication identity could not be reread")
                return _replay_or_conflict(existing, command)
        except PersistenceUnavailableError:
            raise
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("publication failed") from exc

    def get_publication(self, publication_id: UUID) -> StoredPublication | None:
        try:
            with self._engine.connect() as connection:
                row = connection.execute(
                    text(
                        """
                        SELECT publication_id, source_key, record_type, source_record_id,
                               source_record_identity, source_version, source_version_identity,
                               publication_key, contract_version, contract_status, provenance_json,
                               validation_json, normalized_payload_json, payload_hash, canonical_version,
                               raw_response_hash, geometry_json, geometry_crs, published_at
                        FROM source_publications
                        WHERE publication_id = :publication_id
                        """
                    ),
                    {"publication_id": publication_id},
                ).mappings().one_or_none()
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("publication read failed") from exc
        return None if row is None else _stored(row)

    def get_latest_valid(self, source: SourceKey) -> StoredPublication | None:
        try:
            with self._engine.connect() as connection:
                row = connection.execute(
                    text(
                        """
                        SELECT publication_id, source_key, record_type, source_record_id,
                               source_record_identity, source_version, source_version_identity,
                               publication_key, contract_version, contract_status, provenance_json,
                               validation_json, normalized_payload_json, payload_hash, canonical_version,
                               raw_response_hash, geometry_json, geometry_crs, published_at
                        FROM source_publications
                        WHERE source_key = :source_key
                        ORDER BY published_at DESC
                        LIMIT 1
                        """
                    ),
                    {"source_key": source.value},
                ).mappings().one_or_none()
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("latest publication read failed") from exc
        return None if row is None else _stored(row)

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
        try:
            with self._engine.begin() as connection:
                return _upsert_success(
                    connection,
                    source,
                    successful_at=successful_at,
                    attempted_at=attempted_at,
                    publication_id=publication_id,
                    data_age_seconds=data_age_seconds,
                    freshness_state=freshness_state,
                )
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("health success update failed") from exc

    def record_failure(self, source: SourceKey, failure: SafeFailure, attempted_at: datetime) -> SourceHealth:
        try:
            with self._engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        INSERT INTO source_health (
                            source_key, last_successful_fetch_at, last_attempted_fetch_at, last_failure_json,
                            last_successful_publication_id, data_age_seconds, freshness_state, updated_at
                        ) VALUES (
                            :source_key, NULL, :attempted_at, CAST(:failure AS jsonb),
                            NULL, NULL, :freshness_state, :updated_at
                        )
                        ON CONFLICT (source_key) DO UPDATE SET
                            last_attempted_fetch_at = EXCLUDED.last_attempted_fetch_at,
                            last_failure_json = EXCLUDED.last_failure_json,
                            freshness_state = CASE
                                WHEN source_health.last_successful_fetch_at IS NULL THEN 'unavailable'
                                ELSE source_health.freshness_state
                            END,
                            updated_at = EXCLUDED.updated_at
                        """
                    ),
                    {
                        "source_key": source.value,
                        "attempted_at": attempted_at,
                        "failure": json.dumps(failure.model_dump(mode="json")),
                        "freshness_state": FreshnessState.UNAVAILABLE.value,
                        "updated_at": attempted_at,
                    },
                )
                return self._read_health(connection, source)
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("health failure update failed") from exc

    def get_health(self, source: SourceKey) -> SourceHealth:
        try:
            with self._engine.connect() as connection:
                return self._read_health(connection, source)
        except SQLAlchemyError as exc:
            raise PersistenceUnavailableError("health read failed") from exc

    def _publish(self, connection: Connection, command: PublishCommand) -> PublishResult:
        geometry_document = _geojson(command.geometry_json) if command.geometry_json is not None else None
        if geometry_document is not None and command.geometry_crs == "EPSG:4326" and command.trusted:
            valid = connection.execute(
                text(
                    """
                    SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
                    """
                ),
                    {"geojson": json.dumps(geometry_document)},
            ).scalar()
            if not valid:
                command = _as_rejected(command)
        existing = self._lock_receipt(connection, command)
        if existing is not None:
            return _replay_or_conflict(existing, command)
        if not command.trusted or command.outcome_json.get("publication_id") is None:
            self._insert_receipt(connection, command, None, PublicationStatus.REJECTED)
            return _result(command, PublicationStatus.REJECTED, None)
        publication_id = UUID(str(command.outcome_json["publication_id"]))
        geometry_parameter = (
            json.dumps(geometry_document)
            if geometry_document is not None and command.geometry_crs == "EPSG:4326"
            else None
        )
        connection.execute(
            text(
                """
                INSERT INTO source_publications (
                    publication_id, source_key, record_type, source_record_id, source_record_identity,
                    source_version, source_version_identity, publication_key, contract_version,
                    contract_status, provenance_json, validation_json, normalized_payload_json,
                    payload_hash, canonical_version, raw_response_hash, geometry_json, geometry_crs,
                    geometry, published_at, created_at
                ) VALUES (
                    :publication_id, :source_key, :record_type, :source_record_id, :source_record_identity,
                    :source_version, :source_version_identity, :publication_key, :contract_version,
                    :contract_status, CAST(:provenance_json AS jsonb), CAST(:validation_json AS jsonb),
                    CAST(:normalized_payload_json AS jsonb), :payload_hash, :canonical_version,
                    :raw_response_hash, CAST(:geometry_json AS jsonb), :geometry_crs,
                    CASE
                        WHEN :geometry_parameter IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_GeomFromGeoJSON(:geometry_parameter), 4326)
                    END,
                    :published_at, :created_at
                )
                """
            ),
            {
                "publication_id": publication_id,
                "source_key": command.source.value,
                "record_type": command.record_type.value,
                "source_record_id": command.source_record_id,
                "source_record_identity": command.source_record_identity,
                "source_version": command.source_version,
                "source_version_identity": command.source_version_identity,
                "publication_key": command.publication_key,
                "contract_version": command.contract_version,
                "contract_status": command.contract_status,
                "provenance_json": json.dumps(command.provenance_json),
                "validation_json": json.dumps(command.validation_json),
                "normalized_payload_json": json.dumps(command.normalized_payload_json),
                "payload_hash": command.payload_hash,
                "canonical_version": command.canonical_version,
                "raw_response_hash": command.raw_response_hash,
                "geometry_json": json.dumps(command.geometry_json) if command.geometry_json is not None else None,
                "geometry_crs": command.geometry_crs,
                "geometry_parameter": geometry_parameter,
                "published_at": command.observed_at,
                "created_at": command.observed_at,
            },
        )
        self._insert_receipt(connection, command, publication_id, PublicationStatus.PUBLISHED)
        _upsert_success(
            connection,
            command.source,
            successful_at=command.observed_at,
            attempted_at=command.observed_at,
            publication_id=publication_id,
            data_age_seconds=command.health_data_age_seconds,
            freshness_state=command.health_freshness or FreshnessState.UNKNOWN.value,
        )
        return _result(command, PublicationStatus.PUBLISHED, publication_id)

    def _lock_receipt(self, connection: Connection, command: PublishCommand) -> dict[str, Any] | None:
        row = connection.execute(
            text(
                """
                SELECT payload_hash, canonical_version, outcome_status, publication_id, outcome_json
                FROM publication_receipts
                WHERE source_key = :source_key
                  AND source_record_identity = :source_record_identity
                  AND source_version_identity = :source_version_identity
                  AND publication_key = :publication_key
                FOR UPDATE
                """
            ),
            _identity(command),
        ).mappings().one_or_none()
        return None if row is None else dict(row)

    def _insert_receipt(
        self,
        connection: Connection,
        command: PublishCommand,
        publication_id: UUID | None,
        status: PublicationStatus,
    ) -> None:
        connection.execute(
            text(
                """
                INSERT INTO publication_receipts (
                    source_key, source_record_identity, source_version, source_version_identity,
                    publication_key, payload_hash, canonical_version, outcome_status, outcome_json,
                    publication_id, created_at
                ) VALUES (
                    :source_key, :source_record_identity, :source_version, :source_version_identity,
                    :publication_key, :payload_hash, :canonical_version, :outcome_status,
                    CAST(:outcome_json AS jsonb), :publication_id, :created_at
                )
                """
            ),
            {
                **_identity(command),
                "source_version": command.source_version,
                "payload_hash": command.payload_hash,
                "canonical_version": command.canonical_version,
                "outcome_status": status.value,
                "outcome_json": json.dumps(command.outcome_json),
                "publication_id": publication_id,
                "created_at": command.observed_at,
            },
        )

    def _read_health(self, connection: Connection, source: SourceKey) -> SourceHealth:
        row = connection.execute(
            text(
                """
                SELECT source_key, last_successful_fetch_at, last_attempted_fetch_at, last_failure_json,
                       data_age_seconds, freshness_state, last_successful_publication_id
                FROM source_health
                WHERE source_key = :source_key
                """
            ),
            {"source_key": source.value},
        ).mappings().one_or_none()
        if row is None:
            return SourceHealth(source_key=source, freshness_state=FreshnessState.UNKNOWN)
        failure = row["last_failure_json"]
        return SourceHealth(
            source_key=source,
            last_successful_fetch_at=row["last_successful_fetch_at"],
            last_attempted_fetch_at=row["last_attempted_fetch_at"],
            last_failure=None if failure is None else SafeFailure.model_validate(failure),
            data_age_seconds=row["data_age_seconds"],
            freshness_state=FreshnessState(row["freshness_state"]),
            last_successful_publication_id=row["last_successful_publication_id"],
        )


def build_sql_service(repository: SqlSourceContractRepository) -> SourceContractService:
    from app.source_contracts.service import SourceContractService

    return SourceContractService(
        _RegistryPort(repository),
        _PublicationPort(repository),
        _HealthPort(repository),
    )


class _RegistryPort:
    def __init__(self, repository: SqlSourceContractRepository) -> None:
        self._repository = repository

    def get(self, source: SourceKey) -> SourceRegistryEntry | None:
        return self._repository.get_entry(source)

    def list_configured(self) -> list[SourceRegistryEntry]:
        return self._repository.list_configured()

    def list_enabled(self) -> list[SourceRegistryEntry]:
        return self._repository.list_enabled()


class _PublicationPort:
    def __init__(self, repository: SqlSourceContractRepository) -> None:
        self._repository = repository

    def publish_idempotently(self, command: PublishCommand) -> PublishResult:
        return self._repository.publish_idempotently(command)

    def get_publication(self, publication_id: UUID) -> StoredPublication | None:
        return self._repository.get_publication(publication_id)

    def get_latest_valid(self, source: SourceKey) -> StoredPublication | None:
        return self._repository.get_latest_valid(source)


class _HealthPort:
    def __init__(self, repository: SqlSourceContractRepository) -> None:
        self._repository = repository

    def record_success(self, source: SourceKey, **kwargs: object) -> SourceHealth:
        return self._repository.record_success(source, **kwargs)  # type: ignore[arg-type]

    def record_failure(self, source: SourceKey, failure: SafeFailure, attempted_at: datetime) -> SourceHealth:
        return self._repository.record_failure(source, failure, attempted_at)

    def get(self, source: SourceKey) -> SourceHealth:
        return self._repository.get_health(source)


def _geojson(geometry_json: dict[str, Any]) -> dict[str, Any]:
    return {"type": geometry_json["geometry_type"], "coordinates": geometry_json["coordinates"]}


def _identity(command: PublishCommand) -> dict[str, str]:
    return {
        "source_key": command.source.value,
        "source_record_identity": command.source_record_identity,
        "source_version_identity": command.source_version_identity,
        "publication_key": command.publication_key,
    }


def _result(command: PublishCommand, status: PublicationStatus, publication_id: UUID | None) -> PublishResult:
    return PublishResult(
        status=status,
        publication_id=publication_id,
        publication_key=command.publication_key,
        payload_hash=command.payload_hash,
        canonical_version=command.canonical_version,
        validation=ValidationMetadata.model_validate(command.validation_json),
        safe_failure=SafeFailure.model_validate(command.safe_failure_json) if command.safe_failure_json else None,
        normalized_payload_json=command.normalized_payload_json,
    )


def _replay_or_conflict(existing: dict[str, Any], command: PublishCommand) -> PublishResult:
    if existing["payload_hash"] == command.payload_hash and existing["canonical_version"] == command.canonical_version:
        status = (
            PublicationStatus.IDEMPOTENT_REPLAY
            if existing["outcome_status"] == PublicationStatus.PUBLISHED.value
            else PublicationStatus(existing["outcome_status"])
        )
        outcome = existing["outcome_json"] or {}
        return PublishResult(
            status=status,
            publication_id=existing["publication_id"],
            publication_key=command.publication_key,
            payload_hash=existing["payload_hash"],
            canonical_version=existing["canonical_version"],
            validation=ValidationMetadata.model_validate(outcome.get("validation") or command.validation_json),
            safe_failure=(
                SafeFailure.model_validate(outcome["safe_failure"]) if outcome.get("safe_failure") else None
            ),
            normalized_payload_json=command.normalized_payload_json,
        )
    return PublishResult(
        status=PublicationStatus.CONFLICT,
        publication_id=existing["publication_id"],
        publication_key=command.publication_key,
        payload_hash=command.payload_hash,
        canonical_version=command.canonical_version,
        validation=ValidationMetadata.model_validate(command.validation_json),
        safe_failure=None,
        normalized_payload_json=None,
    )


def _as_rejected(command: PublishCommand) -> PublishCommand:
    outcome = dict(command.outcome_json)
    outcome["publication_id"] = None
    outcome["status"] = PublicationStatus.REJECTED.value
    return PublishCommand(
        source=command.source,
        publication_key=command.publication_key,
        source_record_id=command.source_record_id,
        source_record_identity=command.source_record_identity,
        source_version=command.source_version,
        source_version_identity=command.source_version_identity,
        payload_hash=command.payload_hash,
        canonical_version=command.canonical_version,
        trusted=False,
        record_type=command.record_type,
        contract_status=command.contract_status,
        contract_version=command.contract_version,
        provenance_json=command.provenance_json,
        validation_json=command.validation_json,
        normalized_payload_json=command.normalized_payload_json,
        geometry_json=None,
        geometry_crs=command.geometry_crs,
        raw_response_hash=command.raw_response_hash,
        observed_at=command.observed_at,
        safe_failure_json=command.safe_failure_json,
        outcome_json=outcome,
        health_freshness=command.health_freshness,
        health_data_age_seconds=command.health_data_age_seconds,
    )


def _upsert_success(
    connection: Connection,
    source: SourceKey,
    *,
    successful_at: datetime,
    attempted_at: datetime,
    publication_id: UUID,
    data_age_seconds: int | None,
    freshness_state: str,
) -> SourceHealth:
    connection.execute(
        text(
            """
            INSERT INTO source_health (
                source_key, last_successful_fetch_at, last_attempted_fetch_at, last_failure_json,
                last_successful_publication_id, data_age_seconds, freshness_state, updated_at
            ) VALUES (
                :source_key, :successful_at, :attempted_at, NULL,
                :publication_id, :data_age_seconds, :freshness_state, :updated_at
            )
            ON CONFLICT (source_key) DO UPDATE SET
                last_successful_fetch_at = EXCLUDED.last_successful_fetch_at,
                last_attempted_fetch_at = EXCLUDED.last_attempted_fetch_at,
                last_successful_publication_id = EXCLUDED.last_successful_publication_id,
                data_age_seconds = EXCLUDED.data_age_seconds,
                freshness_state = EXCLUDED.freshness_state,
                updated_at = EXCLUDED.updated_at
            """
        ),
        {
            "source_key": source.value,
            "successful_at": successful_at,
            "attempted_at": attempted_at,
            "publication_id": publication_id,
            "data_age_seconds": data_age_seconds,
            "freshness_state": freshness_state,
            "updated_at": successful_at,
        },
    )
    row = connection.execute(
        text(
            """
            SELECT last_successful_fetch_at, last_attempted_fetch_at, last_failure_json,
                   data_age_seconds, freshness_state, last_successful_publication_id
            FROM source_health
            WHERE source_key = :source_key
            """
        ),
        {"source_key": source.value},
    ).mappings().one()
    failure = row["last_failure_json"]
    return SourceHealth(
        source_key=source,
        last_successful_fetch_at=row["last_successful_fetch_at"],
        last_attempted_fetch_at=row["last_attempted_fetch_at"],
        last_failure=None if failure is None else SafeFailure.model_validate(failure),
        data_age_seconds=row["data_age_seconds"],
        freshness_state=FreshnessState(row["freshness_state"]),
        last_successful_publication_id=row["last_successful_publication_id"],
    )


def _entry(row: Any) -> SourceRegistryEntry:
    policy = row["refresh_policy_json"]
    return SourceRegistryEntry(
        source_key=SourceKey(row["source_key"]),
        source_name=row["source_name"],
        authority=row["authority"],
        base_url=row["base_url"],
        terms_url=row["terms_url"],
        attribution=row["attribution"],
        refresh_policy=RefreshPolicy.model_validate(policy),
        enabled=row["enabled"],
    )


def _stored(row: Any) -> StoredPublication:
    return StoredPublication(
        publication_id=row["publication_id"],
        source_key=SourceKey(row["source_key"]),
        record_type=RecordType(row["record_type"]),
        source_record_id=row["source_record_id"],
        source_record_identity=row["source_record_identity"],
        source_version=row["source_version"],
        source_version_identity=row["source_version_identity"],
        publication_key=row["publication_key"],
        contract_version=row["contract_version"],
        contract_status=row["contract_status"],
        provenance_json=row["provenance_json"],
        validation_json=row["validation_json"],
        normalized_payload_json=row["normalized_payload_json"],
        payload_hash=row["payload_hash"],
        canonical_version=row["canonical_version"],
        raw_response_hash=row["raw_response_hash"],
        geometry_json=row["geometry_json"],
        geometry_crs=row["geometry_crs"],
        published_at=row["published_at"],
    )
