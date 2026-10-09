from fastapi.testclient import TestClient

from app.db.health import DatabaseStatus
from app.main import create_app
from app.source_contracts.api import register_source_contracts
from app.source_contracts.enums import ContractStatus
from app.source_contracts.service import SourceContractService
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository, service_for
from tests.source_contract_support import NOW, route, submission
from tests.test_health import FakeProbe, settings


def test_handoff_reaches_the_consumer_api_without_provider_payloads() -> None:
    repository = InMemorySourceContractRepository()
    contracts = service_for(repository)
    unavailable = route(ContractStatus.ROUTE_UNAVAILABLE, include_required=False)
    handoff = contracts.submit(
        submission(unavailable, publication_key="integration-unavailable"),
        NOW,
    )
    assert handoff.safe_failure is not None
    assert handoff.safe_failure.success is False
    assert handoff.normalized_result.contract_status is ContractStatus.ROUTE_UNAVAILABLE
    application = create_app(
        settings(),
        database_probe=FakeProbe(DatabaseStatus(ready=True, postgis_version="3.4.0")),
        register_features=lambda registry: register_source_contracts(registry, contracts),
    )
    client = TestClient(application)
    response = client.get(f"/api/v1/source-contracts/routes/csdi/{handoff.publication.publication_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["outcome_code"] == "route_not_returned"
    assert body["result"]["geometry"] is None
    assert body["attribution"]
    assert body["terms_url"]
    assert body["provenance"]["source_name"]
    assert body["freshness_state"] in {"fresh", "stale", "expired", "unavailable", "unknown"}
    assert "provider_payload" not in response.text
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert "postgis_version" in health.text
