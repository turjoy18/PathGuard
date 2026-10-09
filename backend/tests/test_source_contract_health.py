from datetime import timedelta

from app.source_contracts.enums import FreshnessState, SourceKey
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository, service_for
from tests.source_contract_support import NOW, route, submission


def test_health_view_does_not_downgrade_stale_data_to_fresh() -> None:
    repository = InMemorySourceContractRepository()
    contracts = service_for(repository)
    contracts.submit(submission(route()), NOW)
    later = NOW + timedelta(seconds=1000)
    health = contracts.get_source_health(SourceKey.CSDI, later)
    assert health.freshness_state is FreshnessState.STALE
    assert health.data_age_seconds == 1000
    stored = next(iter(repository._publications.values()))
    assert stored.provenance_json["freshness_state"] == "fresh"
