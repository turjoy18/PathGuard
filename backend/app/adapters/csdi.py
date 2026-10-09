"""Lands Department CSDI 3D Pedestrian Route Search adapter. Server-side only."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.adapters.http import AdapterHTTPError, GuestLimiter, TtlCache, fetch_json
from app.source_contracts.enums import (
    ContractStatus,
    FailureCategory,
    FreshnessState,
    GeometryType,
    OperatingMode,
    SourceKey,
    ValidationClassification,
)
from app.source_contracts.failures import SafeFailure
from app.source_contracts.geometry import GeometryValue
from app.source_contracts.handoff import AdapterSubmission, FetchMetadata
from app.source_contracts.models import (
    AccessibilityCheck,
    CSDIRouteResult,
    PointValue,
    ProviderIdentity,
    RouteStep,
    VerticalTransition,
)
from app.source_contracts.provenance import LiveMetadata, ProvenanceEnvelope
from app.source_contracts.validation import ValidationMetadata, finding
from app.source_contracts.values import ValueState
from app.source_contracts.enums import ValuePresence
from app.source_contracts.version import CONTRACT_VERSION

CSDI_SOLVE_URL = "https://mapapi.hkmapservice.gov.hk/PedRoute/NAServer/route/solve"
CSDI_TERMS_URL = "https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-pedestrian-route-search"
CSDI_ATTRIBUTION = "© Lands Department, Hong Kong SAR Government. Common Spatial Data Infrastructure (CSDI)."
NOT_ACCESSIBLE = "A CSDI pedestrian route is not an accessibility approval and is not a hazard assessment."

_LIMITER = GuestLimiter(limit=30, window_seconds=60)
_CACHE = TtlCache(ttl_seconds=60)
_IDENTITY = ProviderIdentity(provider_name="CSDI", provider_code="csdi", dataset_name="3d-pedestrian-network")


class RoutePoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class CSDIRouteQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: RoutePoint
    destination: RoutePoint
    language: str = Field(default="en", pattern="^(en|zh-HK|zh-CN)$")


def csdi_mode() -> str:
    return os.getenv("PATHGUARD_CSDI_MODE", "fixture")


def plan_csdi(query: CSDIRouteQuery, *, mode: str | None = None, guest_key: str = "guest", now: datetime | None = None) -> dict:
    observed = now or datetime.now(timezone.utc)
    if not _LIMITER.allow(guest_key):
        return _public(_failure_result(query, FailureCategory.RATE_LIMITED, "source_rate_limited", "The guest request rate limit was reached.", observed))
    selected = mode or csdi_mode()
    cache_key = f"{selected}:{query.language}:{query.origin.longitude:.5f}:{query.origin.latitude:.5f}:{query.destination.longitude:.5f}:{query.destination.latitude:.5f}"
    cached = _CACHE.get(cache_key)
    if isinstance(cached, dict):
        return cached
    if selected == "fixture":
        payload, raw = _fixture_payload(query)
        result = _normalize(query, payload, raw, observed, transport="fixture")
    else:
        result = _live(query, observed)
    public = _public(result)
    if result.contract_status is ContractStatus.ROUTE_RETURNED:
        _CACHE.put(cache_key, public)
    return public


def router() -> APIRouter:
    route = APIRouter()

    @route.post("/routes/csdi")
    def csdi_route(body: CSDIRouteQuery, request: Request) -> JSONResponse:
        guest = request.client.host if request.client else "guest"
        return JSONResponse(plan_csdi(body, guest_key=guest))

    return route


def _live(query: CSDIRouteQuery, now: datetime) -> CSDIRouteResult:
    stops = {
        "features": [
            {"geometry": {"x": query.origin.longitude, "y": query.origin.latitude, "spatialReference": {"wkid": 4326}}},
            {"geometry": {"x": query.destination.longitude, "y": query.destination.latitude, "spatialReference": {"wkid": 4326}}},
        ]
    }
    url = os.getenv("PATHGUARD_CSDI_URL", CSDI_SOLVE_URL) + "?" + urlencode(
        {
            "stops": json.dumps(stops, separators=(",", ":")),
            "travelMode": "1",
            "directionsLanguage": query.language,
            "outSR": "4326",
            "f": "json",
            "returnZ": "true",
            "directionStyleName": "NA Campus",
        }
    )
    try:
        fetched = fetch_json(url, timeout_seconds=8, retries=2)
    except AdapterHTTPError as exc:
        category = FailureCategory(exc.category)
        return _failure_result(query, category, _code(category), exc.args[0], now)
    return _normalize(query, fetched.payload, fetched.body, now, transport="success", status=fetched.status, digest=fetched.sha256)


def _fixture_payload(query: CSDIRouteQuery) -> tuple[dict, bytes]:
    if abs(query.origin.longitude - query.destination.longitude) < 0.00001 and abs(query.origin.latitude - query.destination.latitude) < 0.00001:
        payload = {"routes": {"features": []}, "messages": [{"type": 50, "description": "No route"}]}
    else:
        payload = {
            "routes": {
                "features": [
                    {
                        "attributes": {
                            "ObjectID": 1,
                            "Total_Meters": 28.0,
                            "Total_TravelTime": 0.6,
                            "NetworkVersion": "fixture-3d-pedestrian",
                        },
                        "geometry": {
                            "paths": [[
                                [query.origin.longitude, query.origin.latitude, 0],
                                [(query.origin.longitude + query.destination.longitude) / 2, (query.origin.latitude + query.destination.latitude) / 2, 1],
                                [query.destination.longitude, query.destination.latitude, 0],
                            ]]
                        },
                    }
                ]
            },
            "directions": [{"features": [{"attributes": {"text": "Continue", "maneuverType": "esriDMTStraight"}}]}],
        }
    raw = json.dumps(payload).encode("utf-8")
    return payload, raw


def _normalize(query: CSDIRouteQuery, payload: dict, raw: bytes, now: datetime, *, transport: str, status: int = 200, digest: str | None = None) -> CSDIRouteResult:
    digest = digest or hashlib.sha256(raw).hexdigest()
    provenance = _provenance(now, "fixture-3d-pedestrian" if transport == "fixture" else str(payload.get("routes", {}).get("features", [{}])[0].get("attributes", {}).get("NetworkVersion") or "csdi-pedestrian"))
    validation = ValidationMetadata(valid=True, findings=[], correlation_id=None)
    if "error" in payload:
        return _failure_result(query, FailureCategory.MALFORMED_RESPONSE, "source_response_invalid", "The route response failed shared contract validation.", now)
    features = (payload.get("routes") or {}).get("features") or []
    if not features:
        return _empty(query, ContractStatus.ROUTE_UNAVAILABLE, FailureCategory.NO_ROUTE, "route_not_returned", "The provider established that no pedestrian route is available.", now, provenance)
    feature = features[0]
    path = ((feature.get("geometry") or {}).get("paths") or [[]])[0]
    if len(path) < 2:
        return _empty(query, ContractStatus.ROUTE_REJECTED, FailureCategory.GEOMETRY_INVALID, "source_response_invalid", "The route response failed shared contract validation.", now, provenance)
    dimensions = 3 if any(len(position) > 2 for position in path) else 2
    coordinates = [[float(position[0]), float(position[1])] + ([float(position[2])] if dimensions == 3 else []) for position in path]
    attributes = feature.get("attributes") or {}
    meters = attributes.get("Total_Meters")
    minutes = attributes.get("Total_TravelTime")
    steps = []
    vertical: list[VerticalTransition] = []
    for index, item in enumerate(((payload.get("directions") or [{}])[0].get("features") or [])):
        text = (item.get("attributes") or {}).get("text")
        maneuver = str((item.get("attributes") or {}).get("maneuverType") or "")
        steps.append(RouteStep(order=index, instruction=text))
        if any(token in maneuver.lower() for token in ("stair", "lift", "ramp", "escalator")):
            vertical.append(VerticalTransition(kind=maneuver, from_level=ValueState(state=ValuePresence.UNKNOWN, explanation="Level was not supplied.")))
    if not steps:
        steps = [RouteStep(order=0, instruction=None)]
    return CSDIRouteResult(
        contract_status=ContractStatus.ROUTE_RETURNED,
        origin=_point(query.origin, "origin"),
        destination=_point(query.destination, "destination"),
        geometry=GeometryValue(geometry_type=GeometryType.LINE_STRING, coordinates=coordinates, crs="EPSG:4326", dimensions=dimensions),
        steps=steps,
        distance_meters=float(meters) if isinstance(meters, (int, float)) else None,
        duration_seconds=float(minutes) * 60 if isinstance(minutes, (int, float)) else None,
        provider_identity=_IDENTITY,
        provider_request_id=None,
        provider_response_id=str(attributes.get("ObjectID") or ""),
        network_version=str(attributes.get("NetworkVersion") or ""),
        vertical_information=vertical,
        accessibility_check=AccessibilityCheck(),
        provenance=provenance,
        validation=validation,
        explanation=NOT_ACCESSIBLE,
    )


def _public(result: CSDIRouteResult) -> dict:
    failure = result.safe_failure
    return {
        "contract_version": CONTRACT_VERSION,
        "outcome_code": failure.outcome_code if failure else "published",
        "explanation": result.explanation,
        "attribution": CSDI_ATTRIBUTION,
        "terms_url": CSDI_TERMS_URL,
        "limitation": NOT_ACCESSIBLE,
        "mode": result.provenance.mode.value,
        "freshness_state": result.provenance.freshness_state.value,
        "result": result.model_dump(mode="json"),
    }


def _failure_result(query: CSDIRouteQuery, category: FailureCategory, code: str, message: str, now: datetime) -> CSDIRouteResult:
    status = ContractStatus.ROUTE_UNAVAILABLE if category in {FailureCategory.TIMEOUT, FailureCategory.TRANSPORT, FailureCategory.RATE_LIMITED, FailureCategory.SOURCE_UNAVAILABLE} else ContractStatus.ROUTE_REJECTED
    if category is FailureCategory.NO_ROUTE:
        status = ContractStatus.ROUTE_UNAVAILABLE
    provenance = _provenance(now, None)
    failure = SafeFailure(source=SourceKey.CSDI, category=category, outcome_code=code, observed_at=now, message=message, retryable=category in {FailureCategory.TIMEOUT, FailureCategory.TRANSPORT, FailureCategory.RATE_LIMITED})
    return _empty(query, status, category, code, message, now, provenance, failure)


def _empty(query: CSDIRouteQuery, status: ContractStatus, category: FailureCategory, code: str, message: str, now: datetime, provenance: ProvenanceEnvelope, failure: SafeFailure | None = None) -> CSDIRouteResult:
    failure = failure or SafeFailure(source=SourceKey.CSDI, category=category, outcome_code=code, observed_at=now, message=message, retryable=False)
    return CSDIRouteResult(
        contract_status=status,
        provider_identity=_IDENTITY,
        provenance=provenance,
        validation=ValidationMetadata(valid=status is ContractStatus.ROUTE_UNAVAILABLE, findings=[finding("source_response_invalid", "geometry", ValidationClassification.ERROR, message)] if status is ContractStatus.ROUTE_REJECTED else []),
        safe_failure=failure,
        explanation=message,
    )


def _point(point: RoutePoint, label: str) -> PointValue:
    return PointValue(label=label, geometry=GeometryValue(geometry_type=GeometryType.POINT, coordinates=[point.longitude, point.latitude], crs="EPSG:4326", dimensions=2))


def _provenance(now: datetime, source_version: str | None) -> ProvenanceEnvelope:
    return ProvenanceEnvelope(
        mode=OperatingMode.LIVE,
        source_name="CSDI 3D Pedestrian Network",
        source_record_id=str(uuid4()),
        fetched_at=now,
        source_version=source_version,
        freshness_state=FreshnessState.FRESH,
        mode_metadata=LiveMetadata(mode=OperatingMode.LIVE, fetched_at=now),
    )


def _code(category: FailureCategory) -> str:
    return {
        FailureCategory.TIMEOUT: "source_fetch_timeout",
        FailureCategory.RATE_LIMITED: "source_rate_limited",
        FailureCategory.MALFORMED_RESPONSE: "source_response_invalid",
    }.get(category, "source_fetch_transport")


def submission_for(result: CSDIRouteResult, raw_hash: str, now: datetime) -> AdapterSubmission:
    return AdapterSubmission(
        source=SourceKey.CSDI,
        fetch_metadata=FetchMetadata(attempted_at=now, completed_at=now, transport_outcome="fixture", raw_response_hash=raw_hash),
        provider_payload={"redacted": True},
        normalization_result=result,
        provenance=result.provenance,
        validation=result.validation,
        publication_key=result.provenance.source_record_id,
        raw_response_hash=raw_hash,
        failure=result.safe_failure if result.contract_status is not ContractStatus.ROUTE_RETURNED else None,
    )
