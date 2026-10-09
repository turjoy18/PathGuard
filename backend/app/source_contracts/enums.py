from __future__ import annotations

from enum import StrEnum


class OperatingMode(StrEnum):
    LIVE = "live"
    SNAPSHOT = "snapshot"
    REPLAY = "replay"
    OFFLINE = "offline"


class FreshnessState(StrEnum):
    FRESH = "fresh"
    STALE = "stale"
    EXPIRED = "expired"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


class ContractStatus(StrEnum):
    ROUTE_RETURNED = "route_returned"
    ROUTE_REJECTED = "route_rejected"
    ROUTE_UNAVAILABLE = "route_unavailable"
    ROUTE_UNKNOWN = "route_unknown"


class ValidationClassification(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    UNKNOWN_VALUE = "unknown_value"
    UNAVAILABLE_RESULT = "unavailable_result"


class SourceKey(StrEnum):
    CSDI = "csdi"
    HKO = "hko"
    MARINE_DEPARTMENT = "marine_department"


class RecordType(StrEnum):
    CSDI_ROUTE_RESULT = "csdi_route_result"
    OFFICIAL_SOURCE_RECORD = "official_source_record"
    TYPHOON_SHELTER_REFERENCE = "typhoon_shelter_reference"
    HUMAN_SHELTER = "human_shelter"


class FailureCategory(StrEnum):
    TRANSPORT = "transport"
    TIMEOUT = "timeout"
    RATE_LIMITED = "rate_limited"
    MALFORMED_RESPONSE = "malformed_response"
    VALIDATION_FAILED = "validation_failed"
    GEOMETRY_INVALID = "geometry_invalid"
    NO_ROUTE = "no_route"
    UNKNOWN_STATUS = "unknown_status"
    SOURCE_UNAVAILABLE = "source_unavailable"
    PUBLICATION_CONFLICT = "publication_conflict"
    CONTRACT_INVALID = "contract_invalid"
    DATABASE_UNAVAILABLE = "database_unavailable"


class AccessibilityState(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    UNKNOWN = "unknown"
    NOT_EVALUATED = "not_evaluated"


class PublicationStatus(StrEnum):
    PUBLISHED = "published"
    IDEMPOTENT_REPLAY = "idempotent_replay"
    REJECTED = "rejected"
    CONFLICT = "conflict"


class ValuePresence(StrEnum):
    KNOWN = "known"
    UNKNOWN = "unknown"
    UNAVAILABLE = "unavailable"


class TimeBasis(StrEnum):
    FETCHED_AT = "fetched_at"
    ISSUED_AT = "issued_at"
    VALID_UNTIL = "valid_until"
    CACHED_AGE = "cached_age"


class GeometryType(StrEnum):
    POINT = "Point"
    LINE_STRING = "LineString"
    MULTI_LINE_STRING = "MultiLineString"
    POLYGON = "Polygon"
    MULTI_POLYGON = "MultiPolygon"
