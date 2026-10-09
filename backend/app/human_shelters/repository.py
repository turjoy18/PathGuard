from __future__ import annotations

import json
from typing import Protocol
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import create_db_engine
from app.human_shelters.constants import CATALOGUE_SRID
from app.human_shelters.models import (
    CataloguePublication,
    Entrance,
    FacilityEvidence,
    ShelterRecord,
)
from app.source_contracts.enums import FreshnessState, OperatingMode
from app.source_contracts.provenance import ProvenanceEnvelope


class CataloguePersistenceError(Exception):
    """Persistence failed. Callers must not expose database details."""


class CatalogueRepository(Protocol):
    def current(self) -> CataloguePublication | None: ...

    def publish(self, publication: CataloguePublication) -> None: ...

    def set_available(self, available: bool) -> None: ...


class MemoryCatalogueRepository:
    def __init__(self) -> None:
        self._current: CataloguePublication | None = None

    def current(self) -> CataloguePublication | None:
        return self._current

    def publish(self, publication: CataloguePublication) -> None:
        self._current = publication

    def set_available(self, available: bool) -> None:
        if self._current is None:
            return
        self._current = self._current.model_copy(update={"available": available})


class PostgresCatalogueRepository:
    """PostGIS store for human shelters. Typhoon references are not readable here."""

    def __init__(self, database_url: str) -> None:
        self._engine = create_db_engine(database_url)

    def current(self) -> CataloguePublication | None:
        try:
            with self._engine.connect() as connection:
                rows = connection.execute(text(_CURRENT_SQL)).mappings().all()
        except SQLAlchemyError as exc:
            raise CataloguePersistenceError("catalogue persistence failed") from exc
        if not rows:
            return None
        return _publication_from_rows(rows)

    def publish(self, publication: CataloguePublication) -> None:
        try:
            with self._engine.begin() as connection:
                connection.execute(text("UPDATE human_shelter_publications SET is_current = false WHERE is_current"))
                connection.execute(
                    text(_INSERT_PUBLICATION),
                    {
                        "publication_id": str(publication.publication_id),
                        "schema_version": publication.schema_version,
                        "fixture_name": publication.fixture_name,
                        "fixture_version": publication.fixture_version,
                        "label": publication.label,
                        "pilot_area": publication.pilot_area,
                        "owner": publication.owner,
                        "source_url": publication.source_url,
                        "attribution": publication.attribution,
                        "coverage": publication.coverage,
                        "limitations": publication.limitations,
                        "verification_method": publication.verification_method,
                        "data_classification": publication.data_classification,
                        "official_citywide": publication.official_citywide,
                        "data_mode": publication.data_mode.value,
                        "publication_date": publication.publication_date,
                        "available": publication.available,
                        "created_at": publication.created_at,
                    },
                )
                for record in publication.records:
                    connection.execute(text(_INSERT_SHELTER), _shelter_params(publication.publication_id, record))
                    for facility in record.facilities:
                        connection.execute(
                            text(_INSERT_FACILITY),
                            _facility_params(record.shelter_id, facility),
                        )
        except SQLAlchemyError as exc:
            raise CataloguePersistenceError("catalogue persistence failed") from exc

    def set_available(self, available: bool) -> None:
        try:
            with self._engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE human_shelter_publications SET available = :available WHERE is_current"
                    ),
                    {"available": available},
                )
        except SQLAlchemyError as exc:
            raise CataloguePersistenceError("catalogue persistence failed") from exc


_CURRENT_SQL = """
SELECT
    p.publication_id, p.schema_version, p.fixture_name, p.fixture_version, p.label,
    p.pilot_area, p.owner, p.source_url, p.attribution, p.coverage, p.limitations,
    p.verification_method, p.data_classification, p.official_citywide, p.data_mode,
    p.publication_date, p.available, p.created_at,
    s.shelter_id, s.stable_id, s.record_type, s.name, s.address, s.authority,
    s.source_crs, ST_X(s.geom) AS longitude, ST_Y(s.geom) AS latitude, ST_SRID(s.geom) AS srid,
    s.operating_status, s.capacity_state, s.capacity_source, s.last_verified_at,
    s.freshness_state, s.provenance_json, s.entrances_json,
    f.facility_key, f.state AS facility_state, f.evidence_source, f.verified_at, f.note,
    f.evidence_freshness_state
FROM human_shelter_publications AS p
JOIN human_shelters AS s ON s.publication_id = p.publication_id
LEFT JOIN human_shelter_facilities AS f ON f.shelter_id = s.shelter_id
WHERE p.is_current
ORDER BY s.stable_id, f.facility_key
"""

_INSERT_PUBLICATION = """
INSERT INTO human_shelter_publications (
    publication_id, schema_version, fixture_name, fixture_version, label, pilot_area, owner,
    source_url, attribution, coverage, limitations, verification_method, data_classification,
    official_citywide, data_mode, publication_date, available, is_current, created_at
) VALUES (
    CAST(:publication_id AS uuid), :schema_version, :fixture_name, :fixture_version, :label,
    :pilot_area, :owner, :source_url, :attribution, :coverage, :limitations, :verification_method,
    :data_classification, :official_citywide, :data_mode, :publication_date, :available, true, :created_at
)
"""

_INSERT_SHELTER = """
INSERT INTO human_shelters (
    shelter_id, publication_id, stable_id, record_type, name, address, authority, pilot_area,
    source_crs, geom, operating_status, capacity_state, capacity_source, last_verified_at,
    freshness_state, data_mode, provenance_json, entrances_json
) VALUES (
    CAST(:shelter_id AS uuid), CAST(:publication_id AS uuid), :stable_id, 'human_shelter',
    :name, :address, :authority, :pilot_area, :source_crs,
    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
    :operating_status, :capacity_state, :capacity_source, :last_verified_at,
    :freshness_state, :data_mode, CAST(:provenance_json AS jsonb), CAST(:entrances_json AS jsonb)
)
"""

_INSERT_FACILITY = """
INSERT INTO human_shelter_facilities (
    shelter_id, facility_key, state, evidence_source, verified_at, note, evidence_freshness_state
) VALUES (
    CAST(:shelter_id AS uuid), :facility_key, :state, :evidence_source, :verified_at, :note,
    :evidence_freshness_state
)
"""


def _shelter_params(publication_id: UUID, record: ShelterRecord) -> dict[str, object]:
    if record.srid != CATALOGUE_SRID or record.record_type != "human_shelter":
        raise CataloguePersistenceError("catalogue persistence failed")
    return {
        "shelter_id": str(record.shelter_id),
        "publication_id": str(publication_id),
        "stable_id": record.stable_id,
        "name": record.name,
        "address": record.address,
        "authority": record.authority,
        "pilot_area": record.pilot_area,
        "source_crs": record.source_crs,
        "longitude": record.longitude,
        "latitude": record.latitude,
        "operating_status": record.operating_status,
        "capacity_state": record.capacity_state,
        "capacity_source": record.capacity_source,
        "last_verified_at": record.last_verified_at,
        "freshness_state": record.freshness_state.value,
        "data_mode": record.provenance.mode.value,
        "provenance_json": json.dumps(record.provenance.model_dump(mode="json")),
        "entrances_json": json.dumps([item.model_dump(mode="json") for item in record.entrances]),
    }


def _facility_params(shelter_id: UUID, facility: FacilityEvidence) -> dict[str, object]:
    return {
        "shelter_id": str(shelter_id),
        "facility_key": facility.key,
        "state": facility.state,
        "evidence_source": facility.evidence_source,
        "verified_at": facility.verified_at,
        "note": facility.note,
        "evidence_freshness_state": facility.evidence_freshness_state.value,
    }


def _publication_from_rows(rows: list[object]) -> CataloguePublication:
    first = rows[0]
    shelters: dict[UUID, ShelterRecord] = {}
    facilities: dict[UUID, list[FacilityEvidence]] = {}
    for row in rows:
        shelter_id = row["shelter_id"]
        if row["record_type"] != "human_shelter" or row["srid"] != CATALOGUE_SRID:
            raise CataloguePersistenceError("catalogue persistence failed")
        if shelter_id not in shelters:
            provenance = row["provenance_json"]
            if isinstance(provenance, str):
                provenance = json.loads(provenance)
            entrances = row["entrances_json"] or []
            if isinstance(entrances, str):
                entrances = json.loads(entrances)
            shelters[shelter_id] = ShelterRecord(
                shelter_id=shelter_id,
                stable_id=row["stable_id"],
                record_type="human_shelter",
                name=row["name"],
                address=row["address"],
                authority=row["authority"],
                pilot_area=row["pilot_area"],
                longitude=row["longitude"],
                latitude=row["latitude"],
                srid=row["srid"],
                source_crs=row["source_crs"],
                operating_status=row["operating_status"],
                capacity_state=row["capacity_state"],
                capacity_source=row["capacity_source"],
                last_verified_at=row["last_verified_at"],
                freshness_state=FreshnessState(row["freshness_state"]),
                entrances=[Entrance.model_validate(item) for item in entrances],
                provenance=ProvenanceEnvelope.model_validate(provenance),
                facilities=[],
            )
            facilities[shelter_id] = []
        if row["facility_key"] is not None:
            facilities[shelter_id].append(
                FacilityEvidence(
                    key=row["facility_key"],
                    state=row["facility_state"],
                    evidence_source=row["evidence_source"],
                    verified_at=row["verified_at"],
                    note=row["note"],
                    evidence_freshness_state=FreshnessState(row["evidence_freshness_state"]),
                )
            )
    records = []
    for shelter_id, record in shelters.items():
        records.append(record.model_copy(update={"facilities": facilities[shelter_id]}))
    return CataloguePublication(
        publication_id=first["publication_id"],
        schema_version=first["schema_version"],
        fixture_name=first["fixture_name"],
        fixture_version=first["fixture_version"],
        label=first["label"],
        pilot_area=first["pilot_area"],
        owner=first["owner"],
        source_url=first["source_url"],
        attribution=first["attribution"],
        coverage=first["coverage"],
        limitations=first["limitations"],
        verification_method=first["verification_method"],
        data_classification=first["data_classification"],
        official_citywide=False,
        data_mode=OperatingMode(first["data_mode"]),
        publication_date=first["publication_date"],
        available=first["available"],
        created_at=first["created_at"],
        records=records,
    )
