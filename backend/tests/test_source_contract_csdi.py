from app.source_contracts.enums import RecordType, SourceKey
from app.source_contracts.models import ACCESSIBILITY_FACTS
from app.source_contracts.service import SourceContractService
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository, service_for
from tests.source_contract_support import NOW, live_provenance, route, source_record, submission


def _service() -> SourceContractService:
    return service_for(InMemorySourceContractRepository())


def test_returned_route_does_not_pass_accessibility() -> None:
    handoff = _service().submit(submission(route()), NOW)
    result = handoff.normalized_result
    assert result is not None
    assert result.contract_status.value == "route_returned"
    assert result.accessibility_check.state.value == "not_evaluated"
    for fact in ACCESSIBILITY_FACTS:
        assert result.accessibility_check.attributes[fact].state.value == "unknown"
    dumped = result.model_dump(mode="json")
    assert "value" not in dumped["accessibility_check"]["attributes"]["stairs"]


def test_vertical_and_provider_identifiers_are_preserved() -> None:
    submitted = route()
    handoff = _service().submit(submission(submitted), NOW)
    result = handoff.normalized_result
    assert result.provider_request_id == "req-1"
    assert result.provider_response_id == "res-1"
    assert result.network_version == "network-9"
    assert result.steps[0].provider_step_id == "step-1"


def test_marine_records_cannot_become_human_shelters() -> None:
    contracts = _service()
    provenance = live_provenance("Marine Department", source_record_id="shelter-1", source_version="marine-1")
    rejected = source_record(SourceKey.MARINE_DEPARTMENT, "human_shelter", provenance=provenance)
    handoff = contracts.submit(submission(rejected, source=SourceKey.MARINE_DEPARTMENT, provenance=provenance), NOW)
    assert handoff.publication.status.value == "rejected"
    reference = source_record(SourceKey.MARINE_DEPARTMENT, "official_source_record", provenance=provenance)
    published = contracts.submit(
        submission(reference, source=SourceKey.MARINE_DEPARTMENT, provenance=provenance, publication_key="marine"),
        NOW,
    )
    stored = published.normalized_result
    assert stored.record_type is RecordType.TYPHOON_SHELTER_REFERENCE
    assert stored.attributes["capacity"]["state"] == "unknown"
    candidates = contracts.human_shelter_candidates([stored])
    assert candidates == []
    human = source_record(SourceKey.HKO, "human_shelter", provenance=live_provenance("Hong Kong Observatory"))
    assert contracts.human_shelter_candidates([human, stored]) == [human]
