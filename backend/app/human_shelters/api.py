from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.errors import safe_error
from app.human_shelters.models import ShelterCollection, ShelterDetail
from app.human_shelters.repository import CataloguePersistenceError
from app.human_shelters.service import HumanShelterCatalogue, build_prototype_service
from app.registry import FeatureRegistry


def create_router(resolve_service: Callable[[Request], HumanShelterCatalogue]) -> APIRouter:
    router = APIRouter()

    @router.get("/human", response_model=ShelterCollection)
    def list_human_shelters(request: Request) -> ShelterCollection | JSONResponse:
        try:
            return resolve_service(request).list_shelters()
        except CataloguePersistenceError:
            return _unavailable(request)

    @router.get("/human/{stable_id}", response_model=ShelterDetail)
    def get_human_shelter(stable_id: str, request: Request) -> ShelterDetail | JSONResponse:
        try:
            detail = resolve_service(request).get_shelter(stable_id)
        except CataloguePersistenceError:
            return _unavailable(request)
        if detail is None:
            return _missing(request)
        return detail

    return router


def register_human_shelters(
    registry: FeatureRegistry,
    service: HumanShelterCatalogue | None = None,
) -> None:
    """Register read routes. Pass an explicit service in tests and local wiring."""

    def resolve(request: Request) -> HumanShelterCatalogue:
        if service is not None:
            return service
        bound = getattr(request.app.state, "human_shelter_catalogue", None)
        if bound is None:
            bound = build_prototype_service()
            request.app.state.human_shelter_catalogue = bound
        return bound

    registry.register(create_router(resolve), prefix="/api/v1/shelters", tags=["human-shelters"])


def _missing(request: Request) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content=safe_error(
            "human_shelter_not_found",
            "No human shelter exists for this identifier.",
            request.state.request_id,
        ),
        headers={"X-Request-ID": request.state.request_id},
    )


def _unavailable(request: Request) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content=safe_error(
            "catalogue_unavailable",
            "The human-shelter catalogue could not be read.",
            request.state.request_id,
        ),
        headers={"X-Request-ID": request.state.request_id},
    )
