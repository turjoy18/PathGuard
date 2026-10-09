from datetime import datetime, timedelta, timezone

from app.human_shelters.freshness import evaluate_facility_freshness, evaluate_record_freshness
from app.source_contracts.enums import FreshnessState
from tests.human_shelter_support import NOW, build_service, catalogue, facility, prototype_service, record


def test_freshness_window_and_valid_until_precedence() -> None:
    fresh_at = NOW - timedelta(days=30)
    stale_at = fresh_at - timedelta(seconds=1)

    assert (
        evaluate_record_freshness(
            fetched_at=fresh_at,
            issued_at=None,
            valid_until=None,
            last_verified_at=None,
            now=NOW,
        )
        is FreshnessState.FRESH
    )
    assert (
        evaluate_record_freshness(
            fetched_at=stale_at,
            issued_at=None,
            valid_until=None,
            last_verified_at=None,
            now=NOW,
        )
        is FreshnessState.STALE
    )
    assert (
        evaluate_record_freshness(
            fetched_at=NOW,
            issued_at=None,
            valid_until=NOW,
            last_verified_at=NOW,
            now=NOW,
        )
        is FreshnessState.FRESH
    )
    assert (
        evaluate_record_freshness(
            fetched_at=NOW,
            issued_at=None,
            valid_until=NOW - timedelta(seconds=1),
            last_verified_at=NOW,
            now=NOW,
        )
        is FreshnessState.STALE
    )
    assert (
        evaluate_record_freshness(
            fetched_at=None,
            issued_at=None,
            valid_until=NOW + timedelta(days=1),
            last_verified_at=None,
            now=NOW,
        )
        is FreshnessState.UNKNOWN
    )


def test_newest_verification_time_keeps_a_record_fresh() -> None:
    state = evaluate_record_freshness(
        fetched_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        issued_at=None,
        valid_until=None,
        last_verified_at=datetime(2026, 10, 8, tzinfo=timezone.utc),
        now=NOW,
    )
    assert state is FreshnessState.FRESH


def test_source_provided_freshness_does_not_override_the_catalogue_policy() -> None:
    raw = record(last_verified_at="2026-08-01T00:00:00Z")
    raw["provenance"]["fetched_at"] = "2026-08-01T00:00:00Z"
    raw["provenance"]["issued_at"] = "2026-08-01T00:00:00Z"
    raw["provenance"]["freshness_state"] = "fresh"
    raw["provenance"]["source_provided_freshness"] = "fresh"

    service, report, _clock = build_service(catalogue([raw]))

    assert report.published
    shelter = service.list_shelters().records[0]
    assert shelter.freshness_state == "stale"
    assert shelter.provenance.freshness_state == "stale"
    assert shelter.provenance.source_provided_freshness == "fresh"


def test_facility_evidence_age_is_independent_of_the_record() -> None:
    raw = record(
        facilities=[facility("lift", "yes", "2026-07-01T00:00:00Z")],
    )
    service, report, _clock = build_service(catalogue([raw]))
    assert report.published
    shelter = service.list_shelters().records[0]
    lift = next(item for item in shelter.facilities if item.key == "lift")

    assert shelter.freshness_state == "fresh"
    assert shelter.last_verified_at == datetime(2026, 10, 1, tzinfo=timezone.utc)
    assert lift.state == "yes"
    assert lift.verified_at == datetime(2026, 7, 1, tzinfo=timezone.utc)
    assert lift.evidence_freshness_state == "stale"
    assert (
        evaluate_facility_freshness(datetime(2026, 7, 1, tzinfo=timezone.utc), NOW)
        is FreshnessState.STALE
    )


def test_unavailable_publication_retains_records_without_claiming_current() -> None:
    service = prototype_service()
    before = service.list_shelters()
    assert before.source_state == "available"
    assert before.records[0].freshness_state == "fresh"

    service.set_publication_available(False)
    service._clock = lambda: NOW + timedelta(days=400)
    retained = service.list_shelters()

    assert retained.source_state == "unavailable"
    assert retained.publication_current is False
    assert [item.stable_id for item in retained.records] == [item.stable_id for item in before.records]
    assert retained.records[0].freshness_state == before.records[0].freshness_state
    assert retained.records[0].last_verified_at == before.records[0].last_verified_at
    assert retained.records[0].provenance.fetched_at == before.records[0].provenance.fetched_at


def test_prototype_fixture_covers_stale_unknown_and_closed_states() -> None:
    shelters = {item.stable_id: item for item in prototype_service().list_shelters().records}

    assert shelters["pg-proto-central-001"].freshness_state == "fresh"
    assert shelters["pg-proto-central-001"].operating_status == "open"
    assert shelters["pg-proto-central-002"].freshness_state == "stale"
    assert shelters["pg-proto-central-002"].operating_status == "closed"
    assert shelters["pg-proto-central-002"].capacity_state == "unavailable"
    assert shelters["pg-proto-central-003"].freshness_state == "unknown"
    assert shelters["pg-proto-central-003"].operating_status == "unknown"
    assert shelters["pg-proto-central-004"].freshness_state == "stale"
    assert shelters["pg-proto-central-004"].provenance.valid_until is not None
