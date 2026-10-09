from __future__ import annotations

import json
import re
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from app.human_shelters.constants import (
    CATALOGUE_LABEL,
    PILOT_AREA,
    SCHEMA_VERSION,
)
from app.human_shelters.models import (
    CataloguePublication,
    EntranceView,
    FacilityView,
    ImportReport,
    PointLocation,
    ShelterCollection,
    ShelterDetail,
    ShelterRecord,
    ShelterRecordView,
    empty_collection,
)
from app.human_shelters.repository import CataloguePersistenceError, CatalogueRepository
from app.human_shelters.validation import stamp_freshness, validate_fixture
from app.source_contracts.enums import ValidationClassification
from app.source_contracts.validation import finding

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "prototype-v1.json"
_RECORD_INDEX = re.compile(r"records\[(\d+)\]")


class HumanShelterCatalogue:
    """Import and read the prototype human-shelter catalogue.

    Reads return catalogue records only. They do not rank shelters, request
    routes, or call external providers.
    """

    def __init__(
        self,
        repository: CatalogueRepository,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def now(self) -> datetime:
        return self._clock()

    def import_fixture(self, payload: object) -> ImportReport:
        version = payload.get("fixture_version") if isinstance(payload, dict) else None
        if not isinstance(version, str):
            version = None
        publication, errors = validate_fixture(payload, self.now())
        if publication is None or errors:
            return ImportReport(
                fixture_version=version,
                accepted_records=0,
                rejected_records=_rejected_count(errors),
                published=False,
                errors=errors,
            )
        try:
            self._repository.publish(publication)
        except CataloguePersistenceError:
            return ImportReport(
                fixture_version=version,
                accepted_records=0,
                rejected_records=0,
                published=False,
                errors=[
                    finding(
                        "persistence_failed",
                        "publication",
                        ValidationClassification.ERROR,
                        "The catalogue could not be saved.",
                    )
                ],
            )
        return ImportReport(
            fixture_version=publication.fixture_version,
            accepted_records=len(publication.records),
            rejected_records=0,
            published=True,
            errors=[],
        )

    def list_shelters(self) -> ShelterCollection:
        publication = self._repository.current()
        if publication is None:
            return empty_collection()
        return _collection(publication, self.now())

    def get_shelter(self, stable_id: str) -> ShelterDetail | None:
        publication = self._repository.current()
        if publication is None:
            return None
        match = next((record for record in publication.records if record.stable_id == stable_id), None)
        if match is None:
            return None
        collection = _collection(publication, self.now())
        record = next(item for item in collection.records if item.stable_id == stable_id)
        return ShelterDetail(
            schema_version=SCHEMA_VERSION,
            label=publication.label,
            pilot_area=publication.pilot_area,
            coverage=publication.coverage,
            limitations=publication.limitations,
            verification_method=publication.verification_method,
            official_citywide=False,
            fixture_name=publication.fixture_name,
            fixture_version=publication.fixture_version,
            data_mode=publication.data_mode,
            source_state=collection.source_state,
            publication_current=collection.publication_current,
            record=record,
        )

    def set_publication_available(self, available: bool) -> None:
        self._repository.set_available(available)


def build_prototype_service(
    clock: Callable[[], datetime] | None = None,
) -> HumanShelterCatalogue:
    from app.human_shelters.repository import MemoryCatalogueRepository

    service = HumanShelterCatalogue(MemoryCatalogueRepository(), clock=clock)
    report = service.import_fixture(json.loads(FIXTURE_PATH.read_text(encoding="utf-8")))
    if not report.published:
        codes = ",".join(error.code for error in report.errors)
        raise RuntimeError(f"prototype fixture was rejected: {codes}")
    return service


def build_postgres_service(
    database_url: str,
    clock: Callable[[], datetime] | None = None,
) -> HumanShelterCatalogue:
    from app.human_shelters.repository import PostgresCatalogueRepository

    service = HumanShelterCatalogue(PostgresCatalogueRepository(database_url), clock=clock)
    report = service.import_fixture(json.loads(FIXTURE_PATH.read_text(encoding="utf-8")))
    if not report.published:
        codes = ",".join(error.code for error in report.errors)
        raise RuntimeError(f"prototype fixture was rejected: {codes}")
    return service


def _collection(publication: CataloguePublication, now: datetime) -> ShelterCollection:
    available = publication.available
    source_state = "available" if available else "unavailable"
    records = []
    for record in sorted(publication.records, key=lambda item: item.stable_id):
        current = stamp_freshness(record, now) if available else record
        records.append(_view(current))
    return ShelterCollection(
        schema_version=SCHEMA_VERSION,
        label=publication.label or CATALOGUE_LABEL,
        pilot_area=publication.pilot_area or PILOT_AREA,
        coverage=publication.coverage,
        limitations=publication.limitations,
        verification_method=publication.verification_method,
        official_citywide=False,
        fixture_name=publication.fixture_name,
        fixture_version=publication.fixture_version,
        owner=publication.owner,
        source_url=publication.source_url,
        attribution=publication.attribution,
        data_mode=publication.data_mode,
        publication_date=publication.publication_date,
        source_state=source_state,
        publication_current=available,
        records=records,
    )


def _view(record: ShelterRecord) -> ShelterRecordView:
    return ShelterRecordView(
        stable_id=record.stable_id,
        record_type="human_shelter",
        name=record.name,
        address=record.address,
        authority=record.authority,
        pilot_area=record.pilot_area,
        location=PointLocation(
            longitude=record.longitude,
            latitude=record.latitude,
            srid=record.srid,
            source_crs=record.source_crs,
        ),
        entrances=[
            EntranceView(
                name=entrance.name,
                longitude=entrance.longitude,
                latitude=entrance.latitude,
                srid=entrance.srid,
                source_crs=entrance.source_crs,
            )
            for entrance in record.entrances
        ],
        operating_status=record.operating_status,
        capacity_state=record.capacity_state,
        capacity_source=record.capacity_source,
        facilities=[
            FacilityView(
                key=facility.key,
                state=facility.state,
                evidence_source=facility.evidence_source,
                verified_at=facility.verified_at,
                note=facility.note,
                evidence_freshness_state=facility.evidence_freshness_state,
            )
            for facility in record.facilities
        ],
        last_verified_at=record.last_verified_at,
        freshness_state=record.freshness_state,
        provenance=record.provenance,
    )


def _rejected_count(errors: list[object]) -> int:
    indexes: set[int] = set()
    for error in errors:
        match = _RECORD_INDEX.search(getattr(error, "path", ""))
        if match:
            indexes.add(int(match.group(1)))
    return len(indexes)
