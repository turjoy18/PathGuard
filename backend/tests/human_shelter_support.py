from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from app.human_shelters.constants import CATALOGUE_LABEL, PILOT_AREA, SCHEMA_VERSION
from app.human_shelters.repository import MemoryCatalogueRepository
from app.human_shelters.service import FIXTURE_PATH, HumanShelterCatalogue
from app.source_contracts.enums import FreshnessState, OperatingMode
from app.source_contracts.provenance import ProvenanceEnvelope, ReplayMetadata, SnapshotMetadata

NOW = datetime(2026, 10, 9, 12, tzinfo=timezone.utc)
NEGATIVE = Path(__file__).resolve().parents[1] / "app" / "human_shelters" / "fixtures" / "negative"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def point(longitude: float, latitude: float, crs: str = "EPSG:4326") -> dict:
    return {
        "geometry_type": "Point",
        "coordinates": [longitude, latitude],
        "crs": crs,
        "dimensions": 2,
    }


def provenance(stable_id: str = "pg-proto-central-001", **overrides: object) -> dict:
    envelope = ProvenanceEnvelope(
        mode=OperatingMode.SNAPSHOT,
        source_name=CATALOGUE_LABEL,
        source_record_id=stable_id,
        fetched_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        issued_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        source_version="2026-10-09.1",
        freshness_state=FreshnessState.UNKNOWN,
        mode_metadata=SnapshotMetadata(
            mode=OperatingMode.SNAPSHOT,
            snapshot_version="2026-10-09.1",
            snapshot_at=datetime(2026, 10, 9, tzinfo=timezone.utc),
        ),
    )
    payload = envelope.model_dump(mode="json")
    payload.update(overrides)
    return payload


def replay_provenance(stable_id: str) -> dict:
    envelope = ProvenanceEnvelope(
        mode=OperatingMode.REPLAY,
        source_name=CATALOGUE_LABEL,
        source_record_id=stable_id,
        fetched_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        issued_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        source_version="replay-1",
        freshness_state=FreshnessState.UNKNOWN,
        mode_metadata=ReplayMetadata(
            mode=OperatingMode.REPLAY,
            fixture_id="prototype-v1",
            demo_or_test=True,
        ),
    )
    return envelope.model_dump(mode="json")


def facility(key: str, state: str, verified_at: str = "2026-10-01T00:00:00Z") -> dict:
    if state == "unknown":
        return {"key": key, "state": "unknown"}
    return {
        "key": key,
        "state": state,
        "evidence_source": "PathGuard prototype verification note",
        "verified_at": verified_at,
        "note": f"Prototype fixture records {key} as {state}.",
    }


def record(stable_id: str = "pg-proto-central-001", **overrides: object) -> dict:
    payload = {
        "stable_id": stable_id,
        "record_type": "human_shelter",
        "name": "Prototype Shelter",
        "address": "10 Ice House Street, Central, Hong Kong",
        "authority": "PathGuard prototype catalogue",
        "pilot_area": PILOT_AREA,
        "geometry": point(114.157, 22.281),
        "operating_status": "open",
        "last_verified_at": "2026-10-01T00:00:00Z",
        "provenance": provenance(stable_id),
    }
    payload.update(overrides)
    return payload


def catalogue(records: list[dict], **overrides: object) -> dict:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "fixture_name": "central-hong-kong-human-shelters",
        "fixture_version": "test-1",
        "label": CATALOGUE_LABEL,
        "pilot_area": PILOT_AREA,
        "owner": "PathGuard",
        "source_url": "backend/app/human_shelters/fixtures/prototype-v1.json",
        "attribution": "PathGuard prototype/demo data. Not an official Hong Kong shelter catalogue.",
        "coverage": (
            "Documented Central Hong Kong pilot area only. "
            "This is not official citywide Hong Kong coverage."
        ),
        "limitations": (
            "Mock/demo data for the Central Hong Kong pilot. "
            "Not official citywide coverage. Typhoon shelters are not human shelters."
        ),
        "verification_method": "Prototype coordinate check against the documented pilot bounding box.",
        "data_classification": "mock_demo",
        "official_citywide": False,
        "data_mode": "snapshot",
        "publication_date": "2026-10-09",
        "records": records,
    }
    payload.update(overrides)
    return payload


def build_service(
    payload: dict | None = None,
    now: datetime = NOW,
) -> tuple[HumanShelterCatalogue, object, dict[str, datetime]]:
    clock = {"now": now}
    service = HumanShelterCatalogue(MemoryCatalogueRepository(), clock=lambda: clock["now"])
    report = service.import_fixture(payload if payload is not None else catalogue([record()]))
    return service, report, clock


def prototype_service(now: datetime = NOW) -> HumanShelterCatalogue:
    from app.human_shelters.service import build_prototype_service

    return build_prototype_service(clock=lambda: now)


def codes(report: object) -> set[str]:
    return {error.code for error in report.errors}


def clock_at(moment: datetime) -> Callable[[], datetime]:
    return lambda: moment


def prototype_fixture() -> dict:
    return load_json(FIXTURE_PATH)
