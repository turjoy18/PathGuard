from app.source_contracts.canonical import canonical_hash
from app.source_contracts.enums import FreshnessState, SourceKey, ValuePresence
from app.source_contracts.registry import initial_registry_entries
from app.source_contracts.values import ValueState
from tests.fakes.source_contract_repositories import InMemorySourceContractRepository
from tests.source_contract_support import route


def test_registry_keeps_three_distinct_sources() -> None:
    entries = initial_registry_entries()
    assert [entry.source_key for entry in entries] == [
        SourceKey.CSDI,
        SourceKey.HKO,
        SourceKey.MARINE_DEPARTMENT,
    ]
    assert len({entry.source_name for entry in entries}) == 3
    assert all(entry.base_url and entry.terms_url and entry.attribution and entry.enabled for entry in entries)


def test_seed_does_not_overwrite_operator_settings() -> None:
    repository = InMemorySourceContractRepository()
    current = repository.get_entry(SourceKey.CSDI)
    assert current is not None
    repository.replace_entry(current.model_copy(update={"enabled": False}))
    repository.seed_missing()
    assert repository.get_entry(SourceKey.CSDI) is not None
    assert repository.get_entry(SourceKey.CSDI).enabled is False


def test_unknown_and_unavailable_health_transitions() -> None:
    repository = InMemorySourceContractRepository()
    assert repository.get_health(SourceKey.HKO).freshness_state is FreshnessState.UNKNOWN
    from app.source_contracts.enums import FailureCategory
    from app.source_contracts.failures import SafeFailure
    from tests.source_contract_support import NOW

    repository.record_failure(
        SourceKey.HKO,
        SafeFailure(
            source=SourceKey.HKO,
            category=FailureCategory.TRANSPORT,
            outcome_code="source_fetch_transport",
            observed_at=NOW,
            message="The source could not be contacted.",
        ),
        NOW,
    )
    assert repository.get_health(SourceKey.HKO).freshness_state is FreshnessState.UNAVAILABLE
    assert repository.get_health(SourceKey.CSDI).freshness_state is FreshnessState.UNKNOWN


def test_canonical_hash_changes_when_unknown_state_changes() -> None:
    left = route()
    right = route()
    left_hash = canonical_hash(left, source="csdi", publication_key="same")
    assert left_hash == canonical_hash(right, source="csdi", publication_key="same")
    changed = left.model_copy(update={"distance_meters": 181.0})
    assert canonical_hash(changed, source="csdi", publication_key="same") != left_hash
    unknown = ValueState(state=ValuePresence.UNKNOWN, explanation="missing")
    unavailable = ValueState(state=ValuePresence.UNAVAILABLE, explanation="missing")
    assert unknown.model_dump(mode="json") != unavailable.model_dump(mode="json")
    assert canonical_hash(
        left.model_copy(update={"explanation": unknown.model_dump_json()}),
        source="csdi",
        publication_key="same",
    ) != canonical_hash(
        left.model_copy(update={"explanation": unavailable.model_dump_json()}),
        source="csdi",
        publication_key="same",
    )
