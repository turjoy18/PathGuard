from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from app.source_contracts.version import CANONICAL_VERSION, UNKNOWN_RECORD_IDENTITY_PREFIX, UNKNOWN_VERSION_IDENTITY


def canonical_payload(model: BaseModel) -> dict[str, Any]:
    return json.loads(
        json.dumps(model.model_dump(mode="json"), default=_json_default, sort_keys=True, separators=(",", ":"))
    )


def canonical_hash(
    model: BaseModel,
    *,
    source: str,
    publication_key: str,
) -> str:
    document = {
        "canonical_version": CANONICAL_VERSION,
        "publication_key": publication_key,
        "source": source,
        "payload": canonical_payload(model),
    }
    encoded = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def record_identity(source_record_id: str | None, publication_key: str) -> str:
    if source_record_id:
        return source_record_id
    return f"{UNKNOWN_RECORD_IDENTITY_PREFIX}{publication_key}"


def version_identity(source_version: str | None) -> str:
    return source_version if source_version else UNKNOWN_VERSION_IDENTITY


def default_publication_key(source: str, source_record_id: str | None, source_version: str | None) -> str:
    record = source_record_id or "unknown"
    version = source_version or UNKNOWN_VERSION_IDENTITY
    return f"{source}:{record}:{version}"


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(None):
            raise ValueError("canonical timestamps must be UTC")
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    raise TypeError(f"unsupported canonical value {type(value)!r}")
