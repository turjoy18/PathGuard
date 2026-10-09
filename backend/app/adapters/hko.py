"""Hong Kong Observatory warning and warning-info adapter. Server-side only."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.adapters.http import AdapterHTTPError, GuestLimiter, TtlCache, fetch_json
from app.source_contracts.enums import FailureCategory, FreshnessState, OperatingMode, RecordType, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.models import SourceRecord
from app.source_contracts.provenance import LiveMetadata, ProvenanceEnvelope
from app.source_contracts.validation import ValidationMetadata
from app.source_contracts.version import CONTRACT_VERSION

HKO_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php"
HKO_TERMS = "https://www.hko.gov.hk/en/abouthko/disclaimer.htm"
HKO_LINK = "https://www.hko.gov.hk/en/wxinfo/currwx/warning.htm"
HKO_ATTRIBUTION = "© Hong Kong Observatory, Hong Kong SAR Government."
NOT_AN_ORDER = "An HKO warning is not a PathGuard evacuation instruction. Missing map polygons are not inferred."
_LIMITER = GuestLimiter(limit=30, window_seconds=60)
_CACHE = TtlCache(ttl_seconds=60)


def hko_mode() -> str:
    return os.getenv("PATHGUARD_HKO_MODE", "fixture")


def official_status(language: str = "en", *, mode: str | None = None, sample: str = "valid", guest_key: str = "guest", now: datetime | None = None) -> dict:
    observed = now or datetime.now(timezone.utc)
    if language not in {"en", "tc", "sc"}:
        return _error("validation_failed", "language must be en, tc, or sc.", observed)
    if not _LIMITER.allow(guest_key):
        return _error("source_rate_limited", "The guest request rate limit was reached.", observed)
    selected = mode or hko_mode()
    cache_key = f"{selected}:{language}:{sample}"
    cached = _CACHE.get(cache_key)
    if isinstance(cached, dict):
        return cached
    if selected == "fixture":
        payload = _fixture(sample, observed)
        body = json.dumps(payload).encode("utf-8")
        record = _normalize(language, payload, observed, hashlib.sha256(body).hexdigest())
    else:
        record = _live(language, observed)
    public = _public(record)
    _CACHE.put(cache_key, public)
    return public


def router() -> APIRouter:
    route = APIRouter()

    @route.get("/official-status")
    def status(request: Request, language: str = "en", sample: str = "valid") -> JSONResponse:
        guest = request.client.host if request.client else "guest"
        return JSONResponse(official_status(language, sample=sample, guest_key=guest))

    return route


def _live(language: str, now: datetime) -> SourceRecord:
    base = os.getenv("PATHGUARD_HKO_URL", HKO_URL)
    combined: dict = {"warnsum": None, "warningInfo": None}
    raw = b""
    try:
        for product in ("warnsum", "warningInfo"):
            fetched = fetch_json(base + "?" + urlencode({"dataType": product, "lang": language}), timeout_seconds=8, retries=2)
            combined[product] = fetched.payload
            raw += fetched.body
    except AdapterHTTPError as exc:
        return _failed(language, now, exc.category, exc.args[0])
    return _normalize(language, combined, now, hashlib.sha256(raw).hexdigest())


def _fixture(sample: str, now: datetime) -> dict:
    issued = (now - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
    if sample == "none":
        return {"warnsum": {}, "warningInfo": {"details": []}}
    if sample == "malformed":
        return {"warnsum": "not-an-object"}
    if sample == "stale":
        issued = (now - timedelta(hours=6)).isoformat().replace("+00:00", "Z")
    return {
        "warnsum": {
            "WRAIN": {
                "name": "Rainstorm Warning Signal",
                "code": "WRAINA",
                "actionCode": "ISSUE",
                "issueTime": issued,
                "updateTime": issued,
            }
        },
        "warningInfo": {"details": [{"contents": ["Amber Rainstorm Warning Signal is in force."], "warningStatementCode": "WRAIN", "updateTime": issued}]},
    }


def _normalize(language: str, payload: dict, now: datetime, digest: str) -> SourceRecord:
    warnsum = payload.get("warnsum")
    info = payload.get("warningInfo")
    if not isinstance(warnsum, dict) or not isinstance(info, dict):
        return _failed(language, now, "malformed_response", "The HKO response failed validation.")
    issued = _latest_time(warnsum, info)
    freshness = FreshnessState.UNKNOWN
    if issued is not None:
        age = (now - issued).total_seconds()
        freshness = FreshnessState.STALE if age > 600 else FreshnessState.FRESH
    warnings = [item for item in warnsum.values() if isinstance(item, dict)]
    details = info.get("details") if isinstance(info.get("details"), list) else []
    status = "unavailable" if not warnings and not details else "known"
    attributes = {
        "product": "warnsum+warningInfo",
        "language": language,
        "official": payload,
        "links": [HKO_LINK],
        "pathguard_guidance": None,
        "warning_status": {"state": status, "explanation": "HKO did not list a warning." if status == "unavailable" else "Official warning fields are preserved."},
        "polygons": None,
    }
    return SourceRecord(
        record_type=RecordType.OFFICIAL_SOURCE_RECORD,
        record_id=uuid4(),
        source=SourceKey.HKO,
        provenance=_provenance(now, issued, freshness, "hko-opendata"),
        attributes=attributes,
        geometry=None,
        validation=ValidationMetadata(valid=True, findings=[], correlation_id=digest),
    )


def _latest_time(warnsum: dict, info: dict) -> datetime | None:
    stamps = []
    for item in list(warnsum.values()) + list(info.get("details") or []):
        if not isinstance(item, dict):
            continue
        for key in ("updateTime", "issueTime"):
            parsed = _parse_time(item.get(key))
            if parsed is not None:
                stamps.append(parsed)
    return max(stamps) if stamps else None


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _provenance(now: datetime, issued: datetime | None, freshness: FreshnessState, source_version: str) -> ProvenanceEnvelope:
    return ProvenanceEnvelope(
        mode=OperatingMode.LIVE,
        source_name="Hong Kong Observatory",
        source_record_id="hko-official-status",
        fetched_at=now,
        issued_at=issued,
        source_version=source_version,
        freshness_state=freshness,
        mode_metadata=LiveMetadata(mode=OperatingMode.LIVE, fetched_at=now),
    )


def _failed(language: str, now: datetime, category: str, message: str) -> SourceRecord:
    failure = SafeFailure(source=SourceKey.HKO, category=FailureCategory(category) if category in FailureCategory._value2member_map_ else FailureCategory.SOURCE_UNAVAILABLE, outcome_code="source_unavailable" if category != "malformed_response" else "source_response_invalid", observed_at=now, message=message, retryable=category != "malformed_response")
    return SourceRecord(
        record_type=RecordType.OFFICIAL_SOURCE_RECORD,
        record_id=uuid4(),
        source=SourceKey.HKO,
        provenance=_provenance(now, None, FreshnessState.UNAVAILABLE, "hko-opendata"),
        attributes={"product": "warnsum+warningInfo", "language": language, "official": None, "links": [HKO_LINK], "pathguard_guidance": None, "warning_status": {"state": "unavailable", "explanation": message}, "polygons": None},
        geometry=None,
        validation=ValidationMetadata(valid=False, findings=[], correlation_id=None),
        # SourceRecord has no safe_failure field; the public envelope carries it via attributes.
    )


def _public(record: SourceRecord) -> dict:
    status = record.attributes.get("warning_status") or {}
    outcome = "published" if record.validation.valid and status.get("state") == "known" else "source_unavailable"
    if record.validation.valid and status.get("state") == "unavailable":
        outcome = "source_unavailable"
    if not record.validation.valid:
        outcome = "source_response_invalid"
    return {
        "contract_version": CONTRACT_VERSION,
        "outcome_code": outcome,
        "explanation": NOT_AN_ORDER,
        "attribution": HKO_ATTRIBUTION,
        "terms_url": HKO_TERMS,
        "freshness_state": record.provenance.freshness_state.value,
        "source_name": record.provenance.source_name,
        "mode": record.provenance.mode.value,
        "result": record.model_dump(mode="json"),
    }


def _error(code: str, message: str, now: datetime) -> dict:
    failure = SafeFailure(source=SourceKey.HKO, category=FailureCategory.RATE_LIMITED if code == "source_rate_limited" else FailureCategory.VALIDATION_FAILED, outcome_code=code, observed_at=now, message=message)
    return {"contract_version": CONTRACT_VERSION, "outcome_code": code, "explanation": failure.message, "attribution": HKO_ATTRIBUTION, "terms_url": HKO_TERMS, "freshness_state": "unavailable", "result": None}
