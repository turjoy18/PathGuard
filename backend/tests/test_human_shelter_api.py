from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.health import DatabaseStatus
from app.human_shelters.api import register_human_shelters
from app.main import create_app
from tests.human_shelter_support import NOW, build_service, catalogue, prototype_service, record


@dataclass
class FakeProbe:
    result: DatabaseStatus

    def check(self) -> DatabaseStatus:
        return self.result


def settings() -> Settings:
    return Settings(
        app_env="test",
        database_url="postgresql://test:test@localhost:5432/test",
        trusted_hosts=(),
    )


def client_for(service: object) -> TestClient:
    application = create_app(
        settings(),
        database_probe=FakeProbe(DatabaseStatus(ready=True, postgis_version="3.4.0")),
        register_features=lambda registry: register_human_shelters(registry, service),
    )
    return TestClient(application)


def test_collection_is_labelled_ordered_and_not_ranked() -> None:
    response = client_for(prototype_service(NOW)).get("/api/v1/shelters/human")

    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "human-shelter-catalogue.v1"
    assert body["label"] == "PathGuard verified prototype/demo catalogue"
    assert body["pilot_area"] == "Central Hong Kong"
    assert body["official_citywide"] is False
    assert body["source_state"] == "available"
    assert body["data_mode"] == "snapshot"
    assert [item["stable_id"] for item in body["records"]] == [
        "pg-proto-central-001",
        "pg-proto-central-002",
        "pg-proto-central-003",
        "pg-proto-central-004",
    ]
    states = {item["state"] for record in body["records"] for item in record["facilities"]}
    assert states == {"yes", "no", "unknown"}
    first = body["records"][0]
    provenance = first["provenance"]
    for field in (
        "source_name",
        "source_version",
        "source_record_id",
        "fetched_at",
        "issued_at",
        "valid_until",
        "freshness_state",
        "mode",
    ):
        assert field in provenance
    assert first["last_verified_at"]
    assert first["freshness_state"] == "fresh"
    assert first["record_type"] == "human_shelter"
    assert _keys(body).isdisjoint({"score", "rank", "route", "recommendation"})


def test_detail_returns_provenance_and_unknown_typhoon_identifier_is_not_found() -> None:
    client = client_for(prototype_service(NOW))

    found = client.get("/api/v1/shelters/human/pg-proto-central-003")
    missing = client.get(
        "/api/v1/shelters/human/md-typhoon-causeway-bay",
        headers={"X-Request-ID": "typhoon-lookup"},
    )

    assert found.status_code == 200
    record = found.json()["record"]
    assert record["freshness_state"] == "unknown"
    assert record["operating_status"] == "unknown"
    assert record["capacity_state"] == "unknown"
    assert all(item["state"] == "unknown" for item in record["facilities"])
    assert found.json()["official_citywide"] is False
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "human_shelter_not_found"
    assert missing.json()["request_id"] == "typhoon-lookup"
    assert "typhoon_shelter_reference" not in missing.text
    assert "Causeway Bay" not in missing.text


def test_reads_keep_ascending_identifier_order_for_unsorted_input() -> None:
    payload = catalogue(
        [
            record(stable_id="pg-proto-z"),
            record(stable_id="pg-proto-a"),
            record(stable_id="pg-proto-m"),
        ],
        fixture_version="order-1",
    )
    service, report, _clock = build_service(payload)
    assert report.published

    body = client_for(service).get("/api/v1/shelters/human").json()

    assert [item["stable_id"] for item in body["records"]] == [
        "pg-proto-a",
        "pg-proto-m",
        "pg-proto-z",
    ]


def test_source_and_api_documents_state_the_catalogue_contract() -> None:
    root = __import__("pathlib").Path(__file__).resolve().parents[2]
    source = (root / "docs" / "data-sources" / "human-shelters.md").read_text(encoding="utf-8")
    api = (root / "docs" / "api" / "human-shelters-v1.md").read_text(encoding="utf-8")
    combined = source + api

    assert "PathGuard verified prototype/demo catalogue" in source
    assert "Central Hong Kong" in source
    assert "114.1450" in source and "114.1750" in source
    assert "22.2750" in source and "22.2900" in source
    assert "30" in source
    assert "valid_until" in source
    assert "UTC" in source
    assert "unavailable" in source
    assert "typhoon" in source.lower()
    assert "Marine Department" in source
    assert "snapshot" in source and "replay" in source
    assert "/api/v1/shelters/human" in api
    assert "human-shelter-catalogue.v1" in combined


def _keys(value: object) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        found.update(value)
        for item in value.values():
            found.update(_keys(item))
    elif isinstance(value, list):
        for item in value:
            found.update(_keys(item))
    return found
