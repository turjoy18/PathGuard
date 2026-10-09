from datetime import datetime, timezone

from app.adapters.marine import typhoon_reference
from app.source_contracts.models import SourceRecord
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository, service_for


NOW = datetime(2026, 10, 9, 4, 0, tzinfo=timezone.utc)


def test_typhoon_reference_is_not_a_human_shelter() -> None:
    first = typhoon_reference(mode="fixture", guest_key="marine-a", now=NOW)
    second = typhoon_reference(mode="fixture", guest_key="marine-b", now=NOW)
    records = [SourceRecord.model_validate(item) for item in first["results"]]
    assert first["limitation"].startswith("A Marine Department typhoon shelter")
    assert [record.record_id for record in records] == [SourceRecord.model_validate(item).record_id for item in second["results"]]
    assert {record.record_type.value for record in records} == {"typhoon_shelter_reference"}
    assert records[0].attributes["capacity"]["state"] == "unknown"
    assert service_for(InMemorySourceContractRepository()).human_shelter_candidates(records) == []


def test_unavailable_marine_source_returns_no_shelters() -> None:
    body = typhoon_reference(mode="unavailable", guest_key="marine-down", now=NOW)
    assert body["results"] == []
    assert body["outcome_code"] == "source_unavailable"
    assert "Causeway Bay" not in str(body)
