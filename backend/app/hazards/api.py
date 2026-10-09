"""Hazard report HTTP API."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.hazards.lifecycle import HazardError, get_report, review_report, submit_report


class ReportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hazard_type: str
    longitude: float
    latitude: float
    severity: str = "low"
    note: str | None = None
    photo: dict | None = None
    client_queue_id: str | None = None
    source_type: str = "community"


class ReviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str
    reason: str = ""


def router() -> APIRouter:
    route = APIRouter()

    @route.post("/hazards/reports")
    def create(body: ReportBody, request: Request) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(submit_report(body.model_dump(), request_id=request_id))

    @route.get("/hazards/reports/{report_id}")
    def read(report_id: str) -> JSONResponse:
        try:
            return JSONResponse(get_report(report_id))
        except HazardError as exc:
            return JSONResponse({"outcome_code": exc.code, "message": exc.args[0]}, status_code=404)

    @route.post("/hazards/reports/{report_id}/review")
    def review(report_id: str, body: ReviewBody, request: Request) -> JSONResponse:
        try:
            result = review_report(
                report_id,
                body.action,
                actor=request.headers.get("X-Operator-Actor", ""),
                token=request.headers.get("X-Operator-Token", ""),
                reason=body.reason,
                request_id=getattr(request.state, "request_id", None),
            )
        except HazardError as exc:
            status = 403 if exc.code == "unauthorized" else 404 if exc.code == "not_found" else 409
            return JSONResponse({"outcome_code": exc.code, "message": exc.args[0]}, status_code=status)
        return JSONResponse(result)

    return route
