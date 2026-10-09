from __future__ import annotations

from collections.abc import Callable
from uuid import uuid4

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.health import router as health_router
from app.core.config import Settings
from app.db.health import DatabaseProbe, PostgresDatabaseProbe
from app.errors import internal_error_response, validation_error_response
from app.registry import FeatureRegistry


def create_app(
    settings: Settings | None = None,
    *,
    database_probe: DatabaseProbe | None = None,
    register_features: Callable[[FeatureRegistry], None] | None = None,
) -> FastAPI:
    app_settings = settings or Settings.from_env()
    app_settings.validate()
    application = FastAPI(title=app_settings.app_name, version="0.1.0")
    application.state.settings = app_settings
    application.state.database_probe = database_probe or PostgresDatabaseProbe(app_settings)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    )
    if app_settings.trusted_hosts:
        application.add_middleware(TrustedHostMiddleware, allowed_hosts=list(app_settings.trusted_hosts))

    @application.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        request.state.request_id = request_id
        if request.headers.get("content-length"):
            try:
                content_length = int(request.headers["content-length"])
            except ValueError:
                content_length = app_settings.max_request_body_bytes + 1
            if content_length > app_settings.max_request_body_bytes:
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "request_too_large",
                            "message": "The request body exceeds the configured limit.",
                        },
                        "request_id": request_id,
                    },
                    headers={"X-Request-ID": request_id},
                )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    application.add_exception_handler(RequestValidationError, validation_error_response)
    application.add_exception_handler(Exception, internal_error_response)

    api_router = APIRouter(prefix="/api/v1")
    api_router.include_router(health_router)
    application.include_router(api_router)

    registry = FeatureRegistry()
    if register_features is not None:
        register_features(registry)
    registry.include_in(application)
    return application


app = create_app()
