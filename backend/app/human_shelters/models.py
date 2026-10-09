from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.human_shelters.constants import CATALOGUE_LABEL, PILOT_AREA, SCHEMA_VERSION
from app.source_contracts.enums import FreshnessState, OperatingMode
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.validation import ValidationFinding


class FacilityEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: Literal[
        "step_free_entry",
        "lift",
        "ramp",
        "accessible_toilet",
        "stairs_only_entry",
    ]
    state: Literal["yes", "no", "unknown"]
    evidence_source: str | None = None
    verified_at: datetime | None = None
    note: str | None = None
    evidence_freshness_state: FreshnessState = FreshnessState.UNKNOWN


class Entrance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    longitude: float
    latitude: float
    srid: int
    source_crs: str


class ShelterRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shelter_id: UUID
    stable_id: str = Field(min_length=1, max_length=128)
    record_type: Literal["human_shelter"] = "human_shelter"
    name: str
    address: str
    authority: str
    pilot_area: Literal["Central Hong Kong"] = PILOT_AREA
    longitude: float
    latitude: float
    srid: Literal[4326] = 4326
    source_crs: str
    operating_status: Literal["open", "closed", "unknown"]
    capacity_state: Literal["available", "unavailable", "unknown"]
    capacity_source: str | None = None
    last_verified_at: datetime | None = None
    freshness_state: FreshnessState
    entrances: list[Entrance] = Field(default_factory=list)
    provenance: ProvenanceEnvelope
    facilities: list[FacilityEvidence]


class CataloguePublication(BaseModel):
    model_config = ConfigDict(extra="forbid")

    publication_id: UUID
    schema_version: str
    fixture_name: str
    fixture_version: str
    label: Literal["PathGuard verified prototype/demo catalogue"] = CATALOGUE_LABEL
    pilot_area: Literal["Central Hong Kong"] = PILOT_AREA
    owner: str
    source_url: str
    attribution: str
    coverage: str
    limitations: str
    verification_method: str
    data_classification: Literal["mock_demo"]
    official_citywide: Literal[False] = False
    data_mode: OperatingMode
    publication_date: date
    available: bool = True
    created_at: datetime
    records: list[ShelterRecord]


class ImportReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fixture_version: str | None
    accepted_records: int = Field(ge=0)
    rejected_records: int = Field(ge=0)
    published: bool
    errors: list[ValidationFinding]


class PointLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    longitude: float
    latitude: float
    srid: int
    source_crs: str


class FacilityView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    state: str
    evidence_source: str | None
    verified_at: datetime | None
    note: str | None
    evidence_freshness_state: FreshnessState


class EntranceView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    longitude: float
    latitude: float
    srid: int
    source_crs: str


class ShelterRecordView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stable_id: str
    record_type: Literal["human_shelter"]
    name: str
    address: str
    authority: str
    pilot_area: str
    location: PointLocation
    entrances: list[EntranceView]
    operating_status: str
    capacity_state: str
    capacity_source: str | None
    facilities: list[FacilityView]
    last_verified_at: datetime | None
    freshness_state: FreshnessState
    provenance: ProvenanceEnvelope


class ShelterCollection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = SCHEMA_VERSION
    label: str = CATALOGUE_LABEL
    pilot_area: str = PILOT_AREA
    coverage: str
    limitations: str
    verification_method: str
    official_citywide: bool = False
    fixture_name: str | None = None
    fixture_version: str | None = None
    owner: str | None = None
    source_url: str | None = None
    attribution: str | None = None
    data_mode: OperatingMode | None = None
    publication_date: date | None = None
    source_state: Literal["available", "unavailable"]
    publication_current: bool
    records: list[ShelterRecordView]


class ShelterDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = SCHEMA_VERSION
    label: str = CATALOGUE_LABEL
    pilot_area: str = PILOT_AREA
    coverage: str
    limitations: str
    verification_method: str
    official_citywide: bool = False
    fixture_name: str
    fixture_version: str
    data_mode: OperatingMode
    source_state: Literal["available", "unavailable"]
    publication_current: bool
    record: ShelterRecordView


def empty_collection() -> ShelterCollection:
    return ShelterCollection(
        coverage="No human-shelter publication is available.",
        limitations=(
            "No prototype publication is loaded. This is not official citywide "
            "Hong Kong shelter coverage."
        ),
        verification_method="No publication is available to verify.",
        source_state="unavailable",
        publication_current=False,
        records=[],
    )
