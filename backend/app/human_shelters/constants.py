from __future__ import annotations

from datetime import timedelta

SCHEMA_VERSION = "human-shelter-catalogue.v1"
CATALOGUE_LABEL = "PathGuard verified prototype/demo catalogue"
PILOT_AREA = "Central Hong Kong"
CATALOGUE_SRID = 4326
DATA_CLASSIFICATION = "mock_demo"
FRESHNESS_WINDOW = timedelta(days=30)
MAX_RECORDS = 100
MAX_TEXT_LENGTH = 500

FACILITY_KEYS = (
    "step_free_entry",
    "lift",
    "ramp",
    "accessible_toilet",
    "stairs_only_entry",
)
FACILITY_STATES = ("yes", "no", "unknown")
OPERATING_STATUSES = ("open", "closed", "unknown")
CAPACITY_STATES = ("available", "unavailable", "unknown")
PROTOTYPE_MODES = ("snapshot", "replay")

FIXTURE_FIELDS = {
    "schema_version",
    "fixture_name",
    "fixture_version",
    "label",
    "pilot_area",
    "owner",
    "source_url",
    "attribution",
    "coverage",
    "limitations",
    "verification_method",
    "data_classification",
    "official_citywide",
    "data_mode",
    "publication_date",
    "records",
}
RECORD_FIELDS = {
    "stable_id",
    "record_type",
    "name",
    "address",
    "authority",
    "pilot_area",
    "geometry",
    "operating_status",
    "capacity_state",
    "capacity_source",
    "last_verified_at",
    "entrances",
    "provenance",
    "facilities",
}
FACILITY_FIELDS = {"key", "state", "evidence_source", "verified_at", "note"}
ENTRANCE_FIELDS = {"name", "geometry"}
GEOMETRY_FIELDS = {"geometry_type", "coordinates", "crs", "dimensions"}
