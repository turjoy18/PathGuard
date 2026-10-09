from datetime import timedelta
from uuid import UUID

from app.source_contracts.enums import (
    ContractStatus,
    FailureCategory,
    FreshnessState,
    PublicationStatus,
    RecordType,
    SourceKey,
    TimeBasis,
    ValuePresence,
)
from app.source_contracts.service import SourceContractService
from app.source_contracts.values import ValueState
from app.source_contracts.failures import SafeFailure
from app.source_contracts.models import CSDIRouteResult
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository, service_for
from tests.source_contract_support import NOW, live_provenance, route, source_record, submission


def service() -> tuple[SourceContractService, InMemorySourceContractRepository]:
    repository = InMemorySourceContractRepository()
    return service_for(repository), repository


def test_publication_updates_only_the_selected_source() -> None:
    contracts, repository = service()
    handoff = contracts.submit(submission(route(), source=SourceKey.CSDI), NOW)
    assert handoff.publication is not None
    assert handoff.publication.status is PublicationStatus.PUBLISHED
    assert handoff.contract_version == "official-source-contracts.v1"
    csdi = contracts.get_source_health(SourceKey.CSDI, NOW)
    hko = contracts.get_source_health(SourceKey.HKO, NOW)
    assert csdi.last_successful_publication_id == handoff.publication.publication_id
    assert csdi.freshness_state is FreshnessState.FRESH
    assert hko.freshness_state is FreshnessState.UNKNOWN
    assert hko.last_successful_fetch_at is None


def test_failure_retains_prior_success() -> None:
    contracts, _repository = service()
    published = contracts.submit(submission(route(), source=SourceKey.CSDI), NOW)
    success_at = contracts.get_source_health(SourceKey.CSDI, NOW).last_successful_fetch_at
    failure = SafeFailure(
        source=SourceKey.CSDI,
        category=FailureCategory.TIMEOUT,
        outcome_code="source_fetch_timeout",
        observed_at=NOW + timedelta(minutes=5),
        message="The source could not be reached before the configured timeout.",
        retryable=True,
    )
    handoff = contracts.submit(
        submission(None, source=SourceKey.CSDI, failure=failure, provenance=live_provenance()),
        NOW + timedelta(minutes=5),
    )
    health = contracts.get_source_health(SourceKey.CSDI, NOW + timedelta(minutes=5))
    assert handoff.safe_failure is not None
    assert handoff.safe_failure.success is False
    assert health.last_successful_fetch_at == success_at
    assert health.last_failure is not None
    assert health.last_failure.category is FailureCategory.TIMEOUT
    assert published.publication is not None
    assert health.last_successful_publication_id == published.publication.publication_id


def test_retry_is_idempotent_and_conflict_preserves_the_row() -> None:
    contracts, repository = service()
    first = contracts.submit(submission(route(), publication_key="route-key"), NOW)
    second = contracts.submit(submission(route(), publication_key="route-key"), NOW)
    assert first.publication is not None and second.publication is not None
    assert second.publication.status is PublicationStatus.IDEMPOTENT_REPLAY
    assert second.publication.publication_id == first.publication.publication_id
    assert len(repository._publications) == 1
    changed = route()
    changed = changed.model_copy(update={"distance_meters": 999.0})
    conflict = contracts.submit(submission(changed, publication_key="route-key"), NOW)
    assert conflict.publication is not None
    assert conflict.publication.status is PublicationStatus.CONFLICT
    assert conflict.safe_failure is not None
    assert conflict.safe_failure.outcome_code == "publication_conflict"
    stored = repository.get_publication(first.publication.publication_id)
    assert stored is not None
    assert stored.normalized_payload_json["distance_meters"] == 180.0


def test_new_version_publishes_without_replacing_the_prior_record() -> None:
    contracts, repository = service()
    original = contracts.submit(submission(route(), publication_key="route-key"), NOW)
    revised_provenance = live_provenance(source_version="network-10")
    revised = route(provenance=revised_provenance)
    second = contracts.submit(
        submission(revised, provenance=revised_provenance, publication_key="route-key"),
        NOW,
    )
    assert original.publication is not None and second.publication is not None
    assert second.publication.status is PublicationStatus.PUBLISHED
    assert second.publication.publication_id != original.publication.publication_id
    prior = repository.get_publication(original.publication.publication_id)
    assert prior is not None
    assert prior.source_version == "network-9"


def test_invalid_route_is_not_a_trusted_publication() -> None:
    contracts, repository = service()
    rejected = route(include_required=False, status=ContractStatus.ROUTE_RETURNED)
    handoff = contracts.submit(submission(rejected), NOW)
    assert handoff.publication is not None
    assert handoff.publication.status is PublicationStatus.REJECTED
    assert handoff.publication.publication_id is None
    assert repository._publications == {}
    result = handoff.normalized_result
    assert isinstance(result, CSDIRouteResult)
    assert result.contract_status is ContractStatus.ROUTE_REJECTED
    assert result.geometry is None
    assert handoff.safe_failure is not None
    assert handoff.safe_failure.success is False


def test_unavailable_and_unknown_routes_do_not_fabricate_geometry() -> None:
    contracts, _repository = service()
    unavailable = route(ContractStatus.ROUTE_UNAVAILABLE, geometry=None, include_required=False)
    unknown = route(ContractStatus.ROUTE_UNKNOWN, geometry=None, include_required=False)
    unavailable_handoff = contracts.submit(submission(unavailable, publication_key="none"), NOW)
    unknown_handoff = contracts.submit(
        submission(unknown, provenance=live_provenance(source_record_id="other"), publication_key="unknown"),
        NOW,
    )
    for handoff, code in (
        (unavailable_handoff, "route_not_returned"),
        (unknown_handoff, "route_status_unknown"),
    ):
        assert isinstance(handoff.normalized_result, CSDIRouteResult)
        assert handoff.normalized_result.geometry is None
        assert handoff.normalized_result.steps is None
        assert handoff.normalized_result.distance_meters is None
        assert handoff.normalized_result.duration_seconds is None
        assert handoff.safe_failure is not None
        assert handoff.safe_failure.outcome_code == code
        assert "provider-secret-marker" not in handoff.model_dump_json()


def test_negative_age_does_not_publish_as_fresh() -> None:
    contracts, repository = service()
    provenance = live_provenance(fetched_at=NOW + timedelta(minutes=1))
    handoff = contracts.submit(submission(route(provenance=provenance), provenance=provenance), NOW)
    assert handoff.publication is not None
    assert handoff.publication.status is PublicationStatus.REJECTED
    assert handoff.provenance is not None
    assert handoff.provenance.freshness_state is not FreshnessState.FRESH
    assert repository._publications == {}


def test_hko_record_preserves_explicit_unavailable_warning() -> None:
    contracts, _repository = service()
    provenance = live_provenance(
        "Hong Kong Observatory",
        source_record_id="bulletin-1",
        source_version="hko-1",
        issued_at=NOW,
    )
    record = source_record(
        SourceKey.HKO,
        provenance=provenance,
        attributes={
            "warning_status": ValueState(
                state=ValuePresence.UNAVAILABLE,
                explanation="No warning is in force.",
            ).model_dump(mode="json")
        },
    )
    entry = contracts.get_registry()
    hko = next(item for item in entry if item.source_key is SourceKey.HKO)
    assert hko.refresh_policy.required_time_basis is TimeBasis.ISSUED_AT
    handoff = contracts.submit(submission(record, source=SourceKey.HKO, provenance=provenance), NOW)
    assert handoff.publication is not None
    assert handoff.publication.status is PublicationStatus.PUBLISHED
    stored = contracts.get_publication(handoff.publication.publication_id or UUID(int=0))
    assert stored is not None
    assert stored.normalized_payload_json["attributes"]["warning_status"]["state"] == "unavailable"
    assert "value" not in stored.normalized_payload_json["attributes"]["warning_status"]


def test_raw_response_hash_is_preserved() -> None:
    contracts, repository = service()
    handoff = contracts.submit(submission(route()), NOW)
    assert handoff.publication is not None and handoff.publication.publication_id is not None
    stored = repository.get_publication(handoff.publication.publication_id)
    assert stored is not None
    assert stored.raw_response_hash == "b" * 64
    assert stored.record_type is RecordType.CSDI_ROUTE_RESULT
