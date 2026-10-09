import ast
import inspect
import json

from app.human_shelters import service as service_module
from app.human_shelters.service import FIXTURE_PATH
from app.source_contracts.enums import RecordType
from tests.human_shelter_support import (
    NOW,
    catalogue,
    codes,
    facility,
    load_json,
    point,
    prototype_fixture,
    record,
    replay_provenance,
    build_service,
)
from pyproj import Transformer


def test_prototype_fixture_publishes_pilot_records() -> None:
    service, report, _clock = build_service(prototype_fixture(), NOW)

    assert report.published
    assert report.accepted_records == 4
    assert report.rejected_records == 0
    assert report.errors == []
    view = service.list_shelters()
    assert 3 <= len(view.records) <= 100
    assert view.label == "PathGuard verified prototype/demo catalogue"
    assert view.pilot_area == "Central Hong Kong"
    assert view.official_citywide is False
    assert view.data_mode == "snapshot"
    assert "citywide" in view.coverage.lower()
    assert "not " in view.coverage.lower()
    assert "typhoon" in view.limitations.lower()
    assert [item.stable_id for item in view.records] == [
        "pg-proto-central-001",
        "pg-proto-central-002",
        "pg-proto-central-003",
        "pg-proto-central-004",
    ]


def test_import_rejects_typhoon_reference_and_preserves_previous_catalogue() -> None:
    service, report, _clock = build_service(catalogue([record()], fixture_version="kept"))
    assert report.published
    typhoon = load_json(
        FIXTURE_PATH.parent / "negative" / "typhoon-reference.json"
    )

    rejected = service.import_fixture(typhoon)

    assert not rejected.published
    assert rejected.accepted_records == 0
    assert "import_discriminator" in codes(rejected)
    assert service.list_shelters().fixture_version == "kept"
    assert service.get_shelter("md-typhoon-causeway-bay") is None
    assert RecordType.TYPHOON_SHELTER_REFERENCE.value == "typhoon_shelter_reference"


def test_shared_location_does_not_turn_a_typhoon_reference_into_a_human_shelter() -> None:
    human = record(stable_id="pg-shared-point")
    typhoon = record(stable_id="md-shared-point", record_type="typhoon_shelter_reference")
    service, human_report, _clock = build_service(catalogue([human]))
    assert human_report.published

    rejected = service.import_fixture(catalogue([typhoon], fixture_version="typhoon-copy"))

    assert not rejected.published
    assert service.get_shelter("pg-shared-point") is not None
    assert service.get_shelter("md-shared-point") is None


def test_malformed_geometry_and_live_mode_are_rejected() -> None:
    service, _report, _clock = build_service()
    malformed = load_json(FIXTURE_PATH.parent / "negative" / "malformed-geometry.json")
    live = load_json(FIXTURE_PATH.parent / "negative" / "live-mode.json")

    malformed_report = service.import_fixture(malformed)
    live_report = service.import_fixture(live)

    assert not malformed_report.published
    assert any(code.startswith("geometry_") for code in codes(malformed_report))
    assert not live_report.published
    assert "unsupported_data_mode" in codes(live_report)
    blob = json.dumps([error.model_dump() for error in malformed_report.errors + live_report.errors])
    assert "postgresql://" not in blob
    assert "password" not in blob.lower()


def test_duplicate_identifier_rejects_the_whole_version() -> None:
    service, first, _clock = build_service(catalogue([record(stable_id="pg-a")], fixture_version="v1"))
    assert first.published
    duplicate = catalogue(
        [record(stable_id="pg-a"), record(stable_id="pg-a", name="Copy")],
        fixture_version="v2",
    )

    report = service.import_fixture(duplicate)

    assert not report.published
    assert report.accepted_records == 0
    assert report.rejected_records == 1
    assert "duplicate_identifier" in codes(report)
    assert "pg-a" in report.errors[0].detail
    assert service.list_shelters().fixture_version == "v1"


def test_missing_provenance_names_the_field() -> None:
    payload = catalogue([record()])
    payload["records"][0]["provenance"]["source_record_id"] = None

    _service, report, _clock = build_service(payload)

    assert not report.published
    assert "required_field" in codes(report)
    assert any(error.path.endswith("source_record_id") for error in report.errors)


def test_invalid_enums_unsupported_fields_and_facility_rules() -> None:
    bad_status = catalogue([record(operating_status="opening")])
    bad_capacity = catalogue([record(capacity_state="available")])
    ranked = catalogue([record(score=1)])
    bad_facility = catalogue([record(facilities=[facility("lift", "maybe")])])
    duplicate_facility = catalogue(
        [record(facilities=[facility("lift", "yes"), facility("lift", "no")])]
    )
    missing_evidence = catalogue(
        [record(facilities=[{"key": "ramp", "state": "yes"}])]
    )
    outside = catalogue(
        [record(stable_id="pg-outside", geometry=point(114.3, 22.3))]
    )

    assert "enum_invalid" in codes(build_service(bad_status)[1])
    assert "required_field" in codes(build_service(bad_capacity)[1])
    assert "unsupported_field" in codes(build_service(ranked)[1])
    assert "facility_state_invalid" in codes(build_service(bad_facility)[1])
    assert "duplicate_facility" in codes(build_service(duplicate_facility)[1])
    assert "facility_evidence_required" in codes(build_service(missing_evidence)[1])
    outside_report = build_service(outside)[1]
    assert "boundary_violation" in codes(outside_report)
    assert "pg-outside" in outside_report.errors[0].detail


def test_missing_facility_stays_unknown_and_explicit_no_stays_no() -> None:
    payload = catalogue(
        [
            record(
                facilities=[facility("stairs_only_entry", "no")],
            )
        ]
    )
    service, report, _clock = build_service(payload)
    assert report.published
    facilities = {item.key: item for item in service.list_shelters().records[0].facilities}

    assert facilities["stairs_only_entry"].state == "no"
    assert facilities["lift"].state == "unknown"
    assert facilities["lift"].evidence_source is None
    assert facilities["lift"].note is None
    serialized = facilities["lift"].model_dump()
    assert serialized["state"] == "unknown"
    assert serialized["evidence_source"] is None
    assert serialized["verified_at"] is None
    assert serialized["note"] is None
    assert serialized["evidence_freshness_state"] == "unknown"


def test_missing_status_and_capacity_stay_unknown() -> None:
    raw = record()
    del raw["operating_status"]
    del raw["last_verified_at"]
    raw["provenance"]["fetched_at"] = None
    raw["provenance"]["issued_at"] = None
    raw["provenance"]["valid_until"] = None
    service, report, _clock = build_service(catalogue([raw]))

    assert report.published
    shelter = service.list_shelters().records[0]
    assert shelter.operating_status == "unknown"
    assert shelter.capacity_state == "unknown"
    assert shelter.capacity_source is None
    assert shelter.freshness_state == "unknown"


def test_epsg_2326_normalizes_to_catalogue_srid() -> None:
    longitude, latitude = 114.157, 22.281
    easting, northing = Transformer.from_crs("EPSG:4326", "EPSG:2326", always_xy=True).transform(
        longitude,
        latitude,
    )
    service, report, _clock = build_service(
        catalogue([record(geometry=point(easting, northing, "EPSG:2326"))])
    )

    assert report.published, codes(report)
    location = service.list_shelters().records[0].location
    assert location.srid == 4326
    assert location.source_crs == "EPSG:2326"
    assert location.longitude == pytest_approx(longitude)
    assert location.latitude == pytest_approx(latitude)


def test_replay_mode_is_accepted_and_live_metadata_is_not() -> None:
    payload = catalogue(
        [record(provenance=replay_provenance("pg-replay"))],
        data_mode="replay",
        fixture_version="replay-1",
    )
    service, report, _clock = build_service(payload)

    assert report.published
    assert service.list_shelters().data_mode == "replay"


def test_non_point_geometry_is_rejected() -> None:
    raw = record()
    raw["geometry"] = {
        "geometry_type": "LineString",
        "coordinates": [[114.157, 22.281], [114.158, 22.282]],
        "crs": "EPSG:4326",
        "dimensions": 2,
    }
    _service, report, _clock = build_service(catalogue([raw]))
    assert "geometry_not_point" in codes(report)


def test_catalogue_modules_do_not_import_providers_or_ranking() -> None:
    modules = [
        service_module,
        __import__("app.human_shelters.api", fromlist=["api"]),
        __import__("app.human_shelters.validation", fromlist=["validation"]),
    ]
    forbidden = {"httpx", "requests", "urllib", "socket"}
    for module in modules:
        tree = ast.parse(inspect.getsource(module))
        imported: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.append(node.module)
        assert not any(name.split(".")[0] in forbidden for name in imported)
        assert not any("ranking" in name or name.endswith(".route") for name in imported)


def pytest_approx(expected: float, tolerance: float = 1e-5) -> float:
    import pytest

    return pytest.approx(expected, abs=tolerance)
