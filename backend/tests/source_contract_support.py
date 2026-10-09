from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.source_contracts.enums import ContractStatus, FreshnessState, OperatingMode, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.geometry import GeometryType, GeometryValue
from app.source_contracts.handoff import AdapterSubmission, FetchMetadata
from app.source_contracts.models import (
    AccessibilityCheck,
    CSDIRouteResult,
    PointValue,
    ProviderIdentity,
    RouteStep,
    SourceRecord,
)
from app.source_contracts.provenance import (
    LiveMetadata,
    OfflineMetadata,
    ProvenanceEnvelope,
    ReplayMetadata,
    SnapshotMetadata,
)
from app.source_contracts.validation import ValidationMetadata

NOW = datetime(2026, 10, 9, 4, 0, tzinfo=timezone.utc)
RECORD_ID = UUID("11111111-1111-4111-8111-111111111111")


def validation(**overrides: object) -> ValidationMetadata:
    payload = {
        "valid": True,
        "findings": [],
        "provider_request_id": "req-1",
        "provider_response_id": "res-1",
        "correlation_id": "corr-1",
    }
    payload.update(overrides)
    return ValidationMetadata.model_validate(payload)


def live_provenance(
    source_name: str = "CSDI 3D Pedestrian Network",
    *,
    fetched_at: datetime | None = None,
    issued_at: datetime | None = None,
    valid_until: datetime | None = None,
    source_record_id: str | None = "route-42",
    source_version: str | None = "network-9",
    freshness: FreshnessState = FreshnessState.UNKNOWN,
) -> ProvenanceEnvelope:
    fetched = NOW if fetched_at is None else fetched_at
    return ProvenanceEnvelope(
        mode=OperatingMode.LIVE,
        source_name=source_name,
        source_record_id=source_record_id,
        fetched_at=fetched,
        issued_at=issued_at,
        valid_until=valid_until,
        source_version=source_version,
        freshness_state=freshness,
        mode_metadata=LiveMetadata(
            mode=OperatingMode.LIVE,
            fetched_at=fetched,
            provider_request_id="req-1",
            provider_response_id="res-1",
        ),
    )


def snapshot_provenance() -> ProvenanceEnvelope:
    return ProvenanceEnvelope(
        mode=OperatingMode.SNAPSHOT,
        source_name="Hong Kong Observatory",
        source_record_id="warning-7",
        fetched_at=NOW,
        issued_at=NOW - timedelta(minutes=5),
        source_version="dataset-2",
        freshness_state=FreshnessState.UNKNOWN,
        mode_metadata=SnapshotMetadata(
            mode=OperatingMode.SNAPSHOT,
            snapshot_version="snapshot-2026-10-09",
            snapshot_at=NOW,
        ),
    )


def replay_provenance() -> ProvenanceEnvelope:
    return ProvenanceEnvelope(
        mode=OperatingMode.REPLAY,
        source_name="CSDI 3D Pedestrian Network",
        source_record_id="demo-route",
        fetched_at=NOW,
        source_version="fixture-3",
        freshness_state=FreshnessState.UNKNOWN,
        mode_metadata=ReplayMetadata(mode=OperatingMode.REPLAY, fixture_id="demo-typhoon-01"),
    )


def offline_provenance(age: int = 120) -> ProvenanceEnvelope:
    return ProvenanceEnvelope(
        mode=OperatingMode.OFFLINE,
        source_name="CSDI 3D Pedestrian Network",
        source_record_id="cached-route",
        fetched_at=NOW - timedelta(seconds=age),
        source_version="cache-1",
        freshness_state=FreshnessState.UNKNOWN,
        mode_metadata=OfflineMetadata(
            mode=OperatingMode.OFFLINE,
            cached_age_seconds=age,
            non_live_limitation="Cached data is not live and may be stale.",
        ),
    )


def point(lon: float = 114.15, lat: float = 22.28) -> PointValue:
    return PointValue(
        geometry=GeometryValue(
            geometry_type=GeometryType.POINT,
            coordinates=[lon, lat],
            crs="EPSG:4326",
            dimensions=2,
        )
    )


def line() -> GeometryValue:
    return GeometryValue(
        geometry_type=GeometryType.LINE_STRING,
        coordinates=[[114.15, 22.28], [114.16, 22.29]],
        crs="EPSG:4326",
        dimensions=2,
    )


def route(
    status: ContractStatus = ContractStatus.ROUTE_RETURNED,
    *,
    provenance: ProvenanceEnvelope | None = None,
    geometry: GeometryValue | None = None,
    include_required: bool = True,
) -> CSDIRouteResult:
    envelope = provenance or live_provenance()
    returned = status is ContractStatus.ROUTE_RETURNED and include_required
    return CSDIRouteResult(
        contract_status=status,
        origin=point() if returned else None,
        destination=point(114.17, 22.30) if returned else None,
        geometry=line() if geometry is None and returned else geometry,
        steps=[RouteStep(order=0, provider_step_id="step-1", instruction="Walk east")] if returned else None,
        distance_meters=180.0 if returned else None,
        duration_seconds=140.0 if returned else None,
        provider_identity=ProviderIdentity(provider_name="CSDI", provider_code="csdi", dataset_name="3d-pedestrian"),
        provider_request_id="req-1",
        provider_response_id="res-1",
        network_version="network-9",
        vertical_information=[],
        accessibility_check=AccessibilityCheck(),
        provenance=envelope,
        validation=validation(),
        explanation="Submitted CSDI route result.",
    )


def source_record(
    source: SourceKey = SourceKey.HKO,
    record_type: str = "official_source_record",
    *,
    provenance: ProvenanceEnvelope | None = None,
    attributes: dict | None = None,
) -> SourceRecord:
    from app.source_contracts.enums import RecordType

    return SourceRecord(
        record_type=RecordType(record_type),
        record_id=RECORD_ID,
        source=source,
        provenance=provenance or live_provenance("Hong Kong Observatory", source_record_id="warning-7"),
        attributes={} if attributes is None else attributes,
        geometry=None,
        validation=validation(),
    )


def fetch(outcome: str = "success") -> FetchMetadata:
    return FetchMetadata(
        attempted_at=NOW,
        completed_at=NOW,
        transport_outcome=outcome,
        latency_ms=25,
        provider_request_id="req-1",
        provider_response_id="res-1",
        network_version="network-9",
        http_status_class="2xx",
        raw_response_hash="a" * 64,
    )


def submission(
    result: object,
    *,
    source: SourceKey = SourceKey.CSDI,
    provenance: ProvenanceEnvelope | None = None,
    failure: SafeFailure | None = None,
    publication_key: str | None = None,
    payload: dict | None = None,
) -> AdapterSubmission:
    envelope = provenance or getattr(result, "provenance", None) or live_provenance()
    return AdapterSubmission(
        source=source,
        fetch_metadata=fetch("error" if failure else "success"),
        provider_payload={"marker": "provider-secret-marker", **(payload or {})},
        normalization_result=result,
        provenance=envelope,
        validation=validation(),
        publication_key=publication_key,
        raw_response_hash="b" * 64,
        failure=failure,
    )
