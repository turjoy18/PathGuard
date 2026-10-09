from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.health import DatabaseStatus
from app.main import create_app
from app.source_contracts.api import register_source_contracts
from app.source_contracts.enums import SourceKey
from app.source_contracts.repository import PersistenceUnavailableError
from app.source_contracts.service import SourceContractService
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository, service_for
from tests.source_contract_support import NOW, route, submission
from tests.test_health import FakeProbe, settings


def _client(repository: InMemorySourceContractRepository | None = None, broken: bool = False) -> tuple[TestClient, SourceContractService | None]:
    store = repository or InMemorySourceContractRepository()
    contracts = None if broken else service_for(store)

    def register(registry):
        if broken:
            register_source_contracts(registry, _BrokenService())
        else:
            register_source_contracts(registry, contracts)

    application = create_app(
        settings(),
        database_probe=FakeProbe(DatabaseStatus(ready=True, postgis_version="3.4.0")),
        register_features=register,
    )
    application.state.source_contract_now = NOW
    return TestClient(application), contracts


class _BrokenService:
    def get_registry(self):
        raise PersistenceUnavailableError("down")


def test_sources_health_and_existing_readiness_endpoint() -> None:
    client, _contracts = _client()
    sources = client.get("/api/v1/source-contracts/sources", headers={"X-Request-ID": "req-sources"})
    assert sources.status_code == 200
    assert sources.headers["x-request-id"] == "req-sources"
    body = sources.json()
    assert body["contract_version"] == "official-source-contracts.v1"
    assert {item["source_key"] for item in body["sources"]} == {"csdi", "hko", "marine_department"}
    assert body["sources"][0]["health"]["freshness_state"] == "unknown"
    health = client.get("/api/v1/source-contracts/sources/hko/health")
    assert health.status_code == 200
    assert health.json()["health"]["freshness_state"] == "unknown"
    ready = client.get("/api/v1/health")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"


def test_publication_and_csdi_views_hide_provider_payloads() -> None:
    client, contracts = _client()
    assert contracts is not None
    handoff = contracts.submit(submission(route(), payload={"raw": "PROVIDER_PAYLOAD_SENTINEL"}), NOW)
    publication_id = handoff.publication.publication_id
    response = client.get(f"/api/v1/source-contracts/publications/{publication_id}")
    route_view = client.get(f"/api/v1/source-contracts/routes/csdi/{publication_id}")
    assert response.status_code == 200
    assert route_view.status_code == 200
    assert "PROVIDER_PAYLOAD_SENTINEL" not in response.text
    assert "provider_payload" not in response.text
    assert route_view.json()["result"]["contract_status"] == "route_returned"
    assert route_view.json()["result"]["accessibility_check"]["state"] == "not_evaluated"
    assert route_view.json()["freshness_state"] == "fresh"


def test_missing_source_and_publication_are_safe_404s() -> None:
    repository = InMemorySourceContractRepository()
    current = repository.get_entry(SourceKey.HKO)
    repository._entries.pop(SourceKey.HKO)
    client, _contracts = _client(repository)
    assert current is not None
    missing_source = client.get("/api/v1/source-contracts/sources/hko/health")
    missing_publication = client.get(f"/api/v1/source-contracts/publications/{uuid4()}")
    invalid = client.get("/api/v1/source-contracts/sources/not-a-source/health")
    assert missing_source.status_code == 404
    assert missing_publication.status_code == 404
    assert invalid.status_code == 422
    assert "database_url" not in missing_source.text


def test_database_outage_is_503_without_connection_details() -> None:
    client, _contracts = _client(broken=True)
    response = client.get("/api/v1/source-contracts/sources", headers={"X-Request-ID": "db-down"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert response.json()["request_id"] == "db-down"
    assert "password" not in response.text


def test_settings_helper_accepts_explicit_test_settings() -> None:
    configured = Settings(app_env="test", database_url="postgresql://test:test@localhost:5432/test", trusted_hosts=())
    assert configured.app_env == "test"
