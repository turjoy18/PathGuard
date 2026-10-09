from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def validation_error_response(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "The request could not be validated.",
                "details": exc.errors(),
            },
            "request_id": request.state.request_id,
        },
    )


def internal_error_response(request: Request, _exc: Exception) -> JSONResponse:
    # Do not serialize exception text: it can contain credentials or provider details.
    return JSONResponse(
        status_code=500,
        content={
            "error": {"code": "internal_error", "message": "An unexpected error occurred."},
            "request_id": request.state.request_id,
        },
    )


def safe_error(code: str, message: str, request_id: str, details: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error, "request_id": request_id}
