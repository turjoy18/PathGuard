from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.health import DatabaseStatus
from app.main import create_app


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


def test_health_reports_ready_database_and_request_id() -> None:
    client = TestClient(
        create_app(
            settings(),
            database_probe=FakeProbe(DatabaseStatus(ready=True, postgis_version="3.4.0")),
        )
    )

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["database"]["postgis_version"] == "3.4.0"
    assert response.headers["x-request-id"] == response.json()["request_id"]


def test_health_returns_service_unavailable_without_database() -> None:
    client = TestClient(
        create_app(
            settings(),
            database_probe=FakeProbe(DatabaseStatus(ready=False, error_code="database_unavailable")),
        )
    )

    response = client.get("/api/v1/health", headers={"X-Request-ID": "test-request"})

    assert response.status_code == 503
    assert response.json()["database"] == {
        "ready": False,
        "postgis_version": None,
        "error_code": "database_unavailable",
    }
    assert response.json()["request_id"] == "test-request"


def test_oversized_request_is_rejected_without_calling_a_feature() -> None:
    client = TestClient(
        create_app(
            Settings(
                app_env="test",
                database_url="postgresql://test:test@localhost:5432/test",
                trusted_hosts=(),
                max_request_body_bytes=10,
            ),
            database_probe=FakeProbe(DatabaseStatus(ready=True)),
        )
    )

    response = client.post("/api/v1/health", content="01234567890")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"
