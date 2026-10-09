"""In-memory hazard reports, trust transitions, and audit records."""

from __future__ import annotations

import base64
import hashlib
import os
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

CONTRACT_VERSION = "hazard-trust.v1"
OPERATOR_TOKEN = os.getenv("PATHGUARD_OPERATOR_TOKEN", "operator-demo")
_TAG = re.compile(r"<[^>]*>")
_UNSAFE = ("traceback", "bearer ", "cookie", "token=")
_EFFECT = {"low": "warn", "medium": "penalty", "high": "invalidate"}
_ACTIONS = {
    "verify": "verified",
    "reject": "rejected",
    "resolve": "resolved",
    "expire": "expired",
    "reconfirm": "reconfirmed",
}
_ALLOWED = {
    "pending": {"verify", "reject", "expire"},
    "verified": {"resolve", "expire", "reconfirm"},
    "reconfirmed": {"resolve", "expire", "verify"},
    "expired": {"reconfirm"},
    "rejected": set(),
    "resolved": set(),
}
_BLOCKING = {"verified", "reconfirmed"}
_REPORTS: dict[str, dict] = {}
_QUEUE: dict[str, str] = {}
_AUDITS: list[dict] = []


class HazardError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def reset_hazards() -> None:
    _REPORTS.clear()
    _QUEUE.clear()
    _AUDITS.clear()


def submit_report(payload: dict, *, now: datetime | None = None, request_id: str | None = None) -> dict:
    observed = _utc(now)
    queue_id = str(payload.get("client_queue_id") or "").strip()
    if queue_id and queue_id in _QUEUE:
        report = _touch(_REPORTS[_QUEUE[queue_id]], observed)
        return _envelope(report, accepted=True, replay=True)
    report = _build(payload, observed, request_id or uuid4().hex)
    _REPORTS[report["report_id"]] = report
    if queue_id:
        _QUEUE[queue_id] = report["report_id"]
    _audit(report, "submit", "guest", request_id, None, report["trust_state"], observed)
    return _envelope(report, accepted=True, replay=False)


def review_report(report_id: str, action: str, *, actor: str, token: str, reason: str, now: datetime | None = None, request_id: str | None = None) -> dict:
    observed = _utc(now)
    if token != OPERATOR_TOKEN or not actor.strip():
        raise HazardError("unauthorized", "Review actions require an operator.")
    report = _REPORTS.get(report_id)
    if report is None:
        raise HazardError("not_found", "The hazard report does not exist.")
    _touch(report, observed)
    if action not in _ALLOWED.get(report["trust_state"], set()):
        raise HazardError("invalid_transition", f"{report['trust_state']} cannot {action}.")
    before = report["trust_state"]
    report["trust_state"] = _ACTIONS[action]
    report["effect"] = _effect(report)
    report["blocking"] = report["trust_state"] in _BLOCKING and report["effect"] == "invalidate"
    report["overrides_official_facts"] = False
    if action == "reconfirm":
        report["reconfirmed_at"] = observed.isoformat()
        report["expires_at"] = (observed + timedelta(hours=24)).isoformat()
    if action == "verify":
        report["expires_at"] = (observed + timedelta(hours=24)).isoformat()
    report["review_history"].append({"action": action, "actor": actor, "reason": reason.strip(), "at": observed.isoformat(), "before": before, "after": report["trust_state"]})
    _audit(report, action, actor, request_id, before, report["trust_state"], observed, reason.strip())
    return _envelope(report, accepted=True, replay=False)


def get_report(report_id: str, *, now: datetime | None = None) -> dict:
    report = _REPORTS.get(report_id)
    if report is None:
        raise HazardError("not_found", "The hazard report does not exist.")
    return _envelope(_touch(report, _utc(now)), accepted=True, replay=False)


def audits_for(report_id: str) -> list[dict]:
    return [item for item in _AUDITS if item["entity_id"] == report_id]


def _build(payload: dict, now: datetime, request_id: str) -> dict:
    hazard_type = str(payload.get("hazard_type") or "").strip()
    source_type = str(payload.get("source_type") or "community")
    if hazard_type not in {"flood", "blocked_segment", "lift_out", "debris"}:
        raise HazardError("validation_failed", "hazard_type is not supported.")
    if source_type not in {"community", "operator"}:
        raise HazardError("validation_failed", "source_type must be community or operator.")
    longitude = _coord(payload.get("longitude"), -180, 180, "longitude")
    latitude = _coord(payload.get("latitude"), -90, 90, "latitude")
    severity = str(payload.get("severity") or "low")
    if severity not in _EFFECT:
        raise HazardError("validation_failed", "severity must be low, medium, or high.")
    report_id = uuid4().hex
    return {
        "report_id": report_id,
        "contract_version": CONTRACT_VERSION,
        "hazard_type": hazard_type,
        "geometry": {"geometry_type": "Point", "coordinates": [longitude, latitude], "crs": "EPSG:4326"},
        "note": _note(payload.get("note")),
        "photo": _photo(payload.get("photo")),
        "client_queue_id": str(payload.get("client_queue_id") or "") or None,
        "source_type": source_type,
        "source_id": f"{source_type}:{report_id}",
        "trust_state": "pending",
        "severity": severity,
        "effect": "none",
        "blocking": False,
        "overrides_official_facts": False,
        "server_accepted": True,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=6)).isoformat(),
        "reconfirmed_at": None,
        "mode": "live",
        "review_history": [],
        "request_id": request_id,
    }


def _touch(report: dict, now: datetime) -> dict:
    expires = datetime.fromisoformat(report["expires_at"])
    if report["trust_state"] in {"pending", "verified", "reconfirmed"} and now >= expires:
        before = report["trust_state"]
        report["trust_state"] = "expired"
        report["effect"] = "none"
        report["blocking"] = False
        report["review_history"].append({"action": "expire", "actor": "system", "reason": "expiry boundary", "at": now.isoformat(), "before": before, "after": "expired"})
        _audit(report, "expire", "system", report.get("request_id"), before, "expired", now, "expiry boundary")
    return report


def _effect(report: dict) -> str:
    if report["trust_state"] not in _BLOCKING:
        return "none"
    return _EFFECT[report["severity"]]


def _note(value: object) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise HazardError("validation_failed", "note must be text.")
    cleaned = " ".join(_TAG.sub("", value).split())
    cleaned = "".join(ch for ch in cleaned if ch.isprintable())
    lowered = cleaned.lower()
    if any(token in lowered for token in _UNSAFE):
        raise HazardError("validation_failed", "note contains unsafe text.")
    if len(cleaned) > 280:
        raise HazardError("validation_failed", "note is too long.")
    return cleaned or None


def _photo(value: object) -> dict | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise HazardError("validation_failed", "photo must be an object.")
    content_type = value.get("content_type")
    if content_type not in {"image/jpeg", "image/png"}:
        raise HazardError("validation_failed", "photo type must be jpeg or png.")
    try:
        size = int(value.get("size_bytes") or 0)
    except (TypeError, ValueError):
        raise HazardError("validation_failed", "photo size is invalid.") from None
    if size <= 0 or size > 1_000_000:
        raise HazardError("validation_failed", "photo size is outside the allowed range.")
    raw = base64.b64decode(str(value.get("content_base64") or ""), validate=False)
    filename = os.path.basename(str(value.get("filename") or "upload")).replace("..", "")
    return {
        "filename": filename,
        "content_type": content_type,
        "size_bytes": size,
        "content_sha256": hashlib.sha256(raw).hexdigest() if raw else None,
        "exif_removed": b"Exif" in raw or b"exif" in raw,
        "stored_bytes": False,
    }


def _coord(value: object, low: float, high: float, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HazardError("validation_failed", f"{name} is required.") from None
    if not low <= number <= high:
        raise HazardError("validation_failed", f"{name} is out of range.")
    return number


def _audit(report: dict, action: str, actor: str, request_id: str | None, before: str | None, after: str, now: datetime, reason: str = "") -> None:
    _AUDITS.append({
        "actor": actor,
        "action": action,
        "entity_id": report["report_id"],
        "request_id": request_id,
        "mode": report["mode"],
        "at": now.isoformat(),
        "before": before,
        "after": after,
        "reason": reason,
    })


def _envelope(report: dict, *, accepted: bool, replay: bool) -> dict:
    public = dict(report)
    public["server_accepted"] = accepted
    return {
        "contract_version": CONTRACT_VERSION,
        "server_accepted": accepted,
        "idempotent_replay": replay,
        "acceptance": "idempotent_replay" if replay else "accepted",
        "queued_is_not_accepted": True,
        "report": public,
    }


def _utc(now: datetime | None) -> datetime:
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
