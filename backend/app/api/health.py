from __future__ import annotations

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field

from app.db.health import DatabaseStatus

router = APIRouter()


class DatabaseHealth(BaseModel):
    ready: bool
    postgis_version: str | None = None
    error_code: str | None = None


class HealthResponse(BaseModel):
    service: str
    environment: str
    status: str = Field(pattern="^(ready|not_ready)$")
    database: DatabaseHealth
    request_id: str


@router.get("/health", response_model=HealthResponse)
def health(request: Request, response: Response) -> HealthResponse:
    settings = request.app.state.settings
    database_status: DatabaseStatus = request.app.state.database_probe.check()
    ready = database_status.ready
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        service=settings.app_name,
        environment=settings.app_env,
        status="ready" if ready else "not_ready",
        database=DatabaseHealth(
            ready=ready,
            postgis_version=database_status.postgis_version,
            error_code=database_status.error_code,
        ),
        request_id=request.state.request_id,
    )
