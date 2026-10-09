"""Marine Department typhoon-shelter reference adapter. Not a human-shelter source."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid5

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.adapters.http import AdapterHTTPError, GuestLimiter, TtlCache, fetch_json
from app.source_contracts.checks import normalize_safety_attributes
from app.source_contracts.enums import (
    FailureCategory,
    FreshnessState,
    GeometryType,
    OperatingMode,
    RecordType,
    SourceKey,
)
from app.source_contracts.failures import SafeFailure
from app.source_contracts.geometry import GeometryValue
from app.source_contracts.models import SAFETY_FACTS, SourceRecord
from app.source_contracts.provenance import (
    LiveMetadata,
    OfflineMetadata,
    ProvenanceEnvelope,
    ReplayMetadata,
    SnapshotMetadata,
)
from app.source_contracts.validation import ValidationMetadata
from app.source_contracts.version import CONTRACT_VERSION

MARINE_TERMS = "https://www.mardep.gov.hk/en/home.html"
MARINE_ATTRIBUTION = "© Marine Department, Hong Kong SAR Government."
NOT_HUMAN = "A Marine Department typhoon shelter is a vessel refuge. It is not a human evacuation shelter."
_NAMESPACE = UUID("6f0b1c2a-8d4e-5f61-9a70-b1c2d3e4f506")
_LIMITER = GuestLimiter(limit=30, window_seconds=60)
_CACHE = TtlCache(ttl_seconds=60)
_REFERENCES = (
    {"id": "causeway-bay", "name": "Causeway Bay Typhoon Shelter", "lon": 114.184, "lat": 22.283},
    {"id": "aberdeen", "name": "Aberdeen Typhoon Shelter", "lon": 114.152, "lat": 22.247},
)


def marine_mode() -> str:
    return os.getenv("PATHGUARD_MARINE_MODE", "fixture")


def typhoon_reference(*, mode: str | None = None, guest_key: str = "guest", now: datetime | None = None) -> dict:
    observed = now or datetime.now(timezone.utc)
    if not _LIMITER.allow(guest_key):
        return _envelope("source_rate_limited", "unavailable", OperatingMode.OFFLINE, [], observed, "The guest request rate limit was reached.")
    selected = mode or marine_mode()
    cached = _CACHE.get(selected)
    if isinstance(cached, dict):
        return cached
    public = _load(selected, observed)
    if public["results"]:
        _CACHE.put(selected, public)
    return public


def router() -> APIRouter:
    route = APIRouter()

    @route.get("/shelters/typhoon-reference")
    def reference(request: Request, mode: str | None = None) -> JSONResponse:
        guest = request.client.host if request.client else "guest"
        return JSONResponse(typhoon_reference(mode=mode, guest_key=guest))

    return route


def _load(mode: str, now: datetime) -> dict:
    if mode == "unavailable":
        return _envelope("source_unavailable", "unavailable", OperatingMode.OFFLINE, [], now, "The Marine Department reference is unavailable.")
    if mode == "live":
        url = os.getenv("PATHGUARD_MARINE_URL") or os.getenv("MARINE_SHELTER_GEOJSON_URL")
        if not url:
            return _envelope("source_unavailable", "unavailable", OperatingMode.LIVE, [], now, "No live Marine Department dataset URL is configured.")
        try:
            fetched = fetch_json(url, timeout_seconds=8, retries=2)
        except AdapterHTTPError as exc:
            return _envelope("source_unavailable", "unavailable", OperatingMode.LIVE, [], now, exc.args[0])
        features = fetched.payload.get("features") if isinstance(fetched.payload, dict) else None
        if not isinstance(features, list):
            return _envelope("source_response_invalid", "unavailable", OperatingMode.LIVE, [], now, "The Marine Department response failed validation.")
        records = [_record(_feature_fields(feature), now, "live") for feature in features if isinstance(feature, dict)]
        return _envelope("published", "fresh", OperatingMode.LIVE, records, now, NOT_HUMAN)
    records = [_record(item, now, mode) for item in _REFERENCES]
    freshness = "stale" if mode == "stale" else "fresh"
    operating = {"snapshot": OperatingMode.SNAPSHOT, "replay": OperatingMode.REPLAY}.get(mode, OperatingMode.REPLAY)
    return _envelope("published", freshness, operating, records, now, NOT_HUMAN)


def _feature_fields(feature: dict) -> dict:
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    raw = geometry.get("coordinates")
    coords = raw[:2] if isinstance(raw, list) and len(raw) >= 2 and all(isinstance(item, (int, float)) for item in raw[:2]) else []
    official_id = str(props.get("id") or feature.get("id") or "")
    return {
        "id": official_id,
        "name": props.get("name"),
        "lon": float(coords[0]) if coords else None,
        "lat": float(coords[1]) if coords else None,
    }


def _record(item: dict, now: datetime, mode: str) -> SourceRecord:
    official_id = str(item.get("id") or "")
    issued = now - timedelta(days=2 if mode == "stale" else 0)
    geometry = None
    if isinstance(item.get("lon"), (int, float)) and isinstance(item.get("lat"), (int, float)):
        geometry = GeometryValue(
            geometry_type=GeometryType.POINT,
            coordinates=[item["lon"], item["lat"]],
            crs="EPSG:4326",
            dimensions=2,
        )
    attributes = {
        "official_id": official_id or None,
        "name": item.get("name"),
        "reference_kind": "typhoon_shelter_reference",
        "human_evacuation_shelter": False,
        "limitation": NOT_HUMAN,
    }
    record = SourceRecord(
        record_type=RecordType.TYPHOON_SHELTER_REFERENCE,
        record_id=uuid5(_NAMESPACE, official_id or "missing-id"),
        source=SourceKey.MARINE_DEPARTMENT,
        provenance=_provenance(now, issued, mode, official_id),
        attributes=attributes,
        geometry=geometry,
        validation=ValidationMetadata(valid=True, findings=[], correlation_id=official_id or None),
    )
    return normalize_safety_attributes(record)


def _provenance(now: datetime, issued: datetime, mode: str, official_id: str) -> ProvenanceEnvelope:
    freshness = FreshnessState.STALE if mode == "stale" else FreshnessState.FRESH
    if mode == "live":
        operating = OperatingMode.LIVE
        metadata = LiveMetadata(mode=OperatingMode.LIVE, fetched_at=now)
    elif mode == "snapshot":
        operating = OperatingMode.SNAPSHOT
        metadata = SnapshotMetadata(mode=OperatingMode.SNAPSHOT, snapshot_version="marine-typhoon-shelters", snapshot_at=now)
    elif mode == "unavailable":
        operating = OperatingMode.OFFLINE
        metadata = OfflineMetadata(mode=OperatingMode.OFFLINE, cached_age_seconds=0, non_live_limitation=NOT_HUMAN)
        freshness = FreshnessState.UNAVAILABLE
    else:
        operating = OperatingMode.REPLAY
        metadata = ReplayMetadata(mode=OperatingMode.REPLAY, fixture_id="marine-typhoon-shelters", demo_or_test=True)
    return ProvenanceEnvelope(
        mode=operating,
        source_name="Marine Department",
        source_record_id=official_id or None,
        fetched_at=now,
        issued_at=issued,
        source_version="typhoon-shelter-reference",
        freshness_state=freshness,
        mode_metadata=metadata,
    )


def _envelope(outcome: str, freshness: str, mode: OperatingMode, records: list[SourceRecord], now: datetime, explanation: str) -> dict:
    failure = None
    if outcome != "published":
        failure = SafeFailure(
            source=SourceKey.MARINE_DEPARTMENT,
            category=FailureCategory.RATE_LIMITED if outcome == "source_rate_limited" else FailureCategory.SOURCE_UNAVAILABLE,
            outcome_code=outcome,
            observed_at=now,
            message=explanation,
        ).model_dump(mode="json")
    return {
        "contract_version": CONTRACT_VERSION,
        "outcome_code": outcome,
        "explanation": explanation,
        "attribution": MARINE_ATTRIBUTION,
        "terms_url": MARINE_TERMS,
        "limitation": NOT_HUMAN,
        "mode": mode.value,
        "freshness_state": freshness,
        "results": [record.model_dump(mode="json") for record in records],
        "safe_failure": failure,
    }
