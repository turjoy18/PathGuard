from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.errors import safe_error
from app.registry import FeatureRegistry
from app.source_contracts.enums import FreshnessState, SourceKey
from app.source_contracts.failures import SafeFailure
from app.source_contracts.health import SourceHealth
from app.source_contracts.models import CSDIRouteResult, SourceRecord
from app.source_contracts.persistence import SqlSourceContractRepository, build_sql_service
from app.source_contracts.provenance import ProvenanceEnvelope
from app.source_contracts.registry import SourceRegistryEntry
from app.source_contracts.repository import PersistenceUnavailableError
from app.source_contracts.service import SourceContractService
from app.source_contracts.validation import ValidationMetadata
from app.source_contracts.version import CONTRACT_VERSION


class SourceView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_key: SourceKey
    source_name: str
    authority: str
    base_url: str
    terms_url: str
    attribution: str
    enabled: bool
    refresh_policy: dict
    health: SourceHealth


class ConsumerEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: str
    outcome_code: str
    explanation: str
    source_key: SourceKey | None = None
    source_name: str | None = None
    attribution: str | None = None
    terms_url: str | None = None
    source_record_id: str | None = None
    provenance: ProvenanceEnvelope | None = None
    freshness_state: FreshnessState
    validation: ValidationMetadata
    safe_failure: SafeFailure | None = None
    request_id: str
    result: SourceRecord | CSDIRouteResult | None = None
    sources: list[SourceView] | None = None
    health: SourceHealth | None = None


def create_router(resolve_service: Callable[[Request], SourceContractService]) -> APIRouter:
    router = APIRouter()
    examples = _fixture_examples()

    @router.get("/sources", response_model=ConsumerEnvelope)
    def list_sources(request: Request) -> ConsumerEnvelope | JSONResponse:
        try:
            service = resolve_service(request)
            sources = []
            for entry in service.get_registry():
                health = service.get_source_health(entry.source_key, _now(service, request))
                sources.append(_source_view(entry, health))
            return _envelope(
                request,
                outcome_code="registry_listed",
                explanation="Configured official sources and their health.",
                freshness_state=FreshnessState.UNKNOWN,
                sources=sources,
            )
        except PersistenceUnavailableError:
            return _unavailable(request)

    @router.get("/sources/{source_key}/health", response_model=ConsumerEnvelope)
    def source_health(source_key: SourceKey, request: Request) -> ConsumerEnvelope | JSONResponse:
        try:
            service = resolve_service(request)
            entry = next((item for item in service.get_registry() if item.source_key is source_key), None)
            if entry is None:
                return _missing(request, "source_not_found", "The official source is not configured.")
            health = service.get_source_health(source_key, _now(service, request))
            return _envelope(
                request,
                outcome_code="source_health",
                explanation="Official-source health is separate from database readiness.",
                source_key=source_key,
                source_name=entry.source_name,
                attribution=entry.attribution,
                terms_url=str(entry.terms_url),
                freshness_state=health.freshness_state,
                health=health,
            )
        except PersistenceUnavailableError:
            return _unavailable(request)

    @router.get("/publications/{publication_id}", response_model=ConsumerEnvelope, responses=_example_response(examples))
    def publication(publication_id: UUID, request: Request) -> ConsumerEnvelope | JSONResponse:
        return _read_publication(publication_id, request, resolve_service, csdi_only=False)

    @router.get("/routes/csdi/{publication_id}", response_model=ConsumerEnvelope)
    def csdi_route(publication_id: UUID, request: Request) -> ConsumerEnvelope | JSONResponse:
        return _read_publication(publication_id, request, resolve_service, csdi_only=True)

    return router


def register_source_contracts(
    registry: FeatureRegistry,
    service: SourceContractService | None = None,
) -> None:
    def resolve(request: Request) -> SourceContractService:
        if service is not None:
            return service
        bound = getattr(request.app.state, "source_contract_service", None)
        if bound is not None:
            return bound
        repository = SqlSourceContractRepository(request.app.state.settings.database_url)
        return build_sql_service(repository)

    registry.register(
        create_router(resolve),
        prefix="/api/v1/source-contracts",
        tags=["source-contracts"],
    )


def _read_publication(
    publication_id: UUID,
    request: Request,
    resolve_service: Callable[[Request], SourceContractService],
    *,
    csdi_only: bool,
) -> ConsumerEnvelope | JSONResponse:
    try:
        service = resolve_service(request)
        stored = service.get_publication(publication_id)
    except PersistenceUnavailableError:
        return _unavailable(request)
    if stored is None:
        return _missing(request, "publication_not_found", "The publication does not exist.")
    if csdi_only and stored.record_type.value != "csdi_route_result":
        return _missing(request, "route_not_found", "The publication is not a CSDI route result.")
    result: SourceRecord | CSDIRouteResult
    if stored.record_type.value == "csdi_route_result":
        result = CSDIRouteResult.model_validate(stored.normalized_payload_json)
        outcome_code = result.safe_failure.outcome_code if result.safe_failure else "published"
        explanation = result.explanation
        freshness = result.provenance.freshness_state
        provenance = result.provenance
        validation = result.validation
        failure = result.safe_failure
        source_name = result.provenance.source_name
        source_record_id = result.provenance.source_record_id
    else:
        result = SourceRecord.model_validate(stored.normalized_payload_json)
        outcome_code = "published"
        explanation = "Normalized official-source record."
        freshness = result.provenance.freshness_state
        provenance = result.provenance
        validation = result.validation
        failure = None
        source_name = result.provenance.source_name
        source_record_id = result.provenance.source_record_id
    if "provider_payload" in stored.normalized_payload_json:
        return _missing(request, "publication_not_found", "The publication does not exist.")
    entry = next((item for item in service.get_registry() if item.source_key is stored.source_key), None)
    return _envelope(
        request,
        outcome_code=outcome_code,
        explanation=explanation,
        source_key=stored.source_key,
        source_name=source_name,
        attribution=None if entry is None else entry.attribution,
        terms_url=None if entry is None else str(entry.terms_url),
        source_record_id=source_record_id,
        provenance=provenance,
        freshness_state=freshness,
        validation=validation,
        safe_failure=failure,
        result=result,
    )


def _example_response(examples: dict[str, object]) -> dict[int, dict[str, object]]:
    return {200: {"content": {"application/json": {"examples": examples}}}}


def _fixture_examples() -> dict[str, dict[str, object]]:
    root = Path(__file__).parent / "fixtures"
    names = {
        "valid": "valid_route.json",
        "stale": "stale_route.json",
        "unavailable": "unavailable_route.json",
        "malformed": "rejected_route_input.json",
        "partial": "partial_shelter_record.json",
    }
    return {
        key: {"summary": key, "value": json.loads((root / name).read_text(encoding="utf-8"))}
        for key, name in names.items()
    }


def _source_view(entry: SourceRegistryEntry, health: SourceHealth) -> SourceView:
    return SourceView(
        source_key=entry.source_key,
        source_name=entry.source_name,
        authority=entry.authority,
        base_url=str(entry.base_url),
        terms_url=str(entry.terms_url),
        attribution=entry.attribution,
        enabled=entry.enabled,
        refresh_policy=entry.refresh_policy.model_dump(mode="json"),
        health=health,
    )


def _envelope(request: Request, **kwargs: object) -> ConsumerEnvelope:
    validation = kwargs.pop("validation", None)
    return ConsumerEnvelope(
        contract_version=CONTRACT_VERSION,
        validation=validation
        if isinstance(validation, ValidationMetadata)
        else ValidationMetadata(valid=True, findings=[], correlation_id=request.state.request_id),
        request_id=request.state.request_id,
        **kwargs,
    )


def _missing(request: Request, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content=safe_error(code, message, request.state.request_id),
        headers={"X-Request-ID": request.state.request_id},
    )


def _unavailable(request: Request) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content=safe_error(
            "database_unavailable",
            "Official-source storage is unavailable.",
            request.state.request_id,
        ),
        headers={"X-Request-ID": request.state.request_id},
    )


def _now(service: SourceContractService, request: Request):
    from datetime import datetime, timezone

    clock = getattr(request.app.state, "source_contract_now", None)
    if clock is not None:
        return clock
    return datetime.now(timezone.utc)
