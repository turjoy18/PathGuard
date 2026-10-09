from datetime import timedelta

import pytest

from app.source_contracts.enums import FreshnessState, TimeBasis
from app.source_contracts.freshness import DeterministicFreshnessPolicy, FreshnessInputError, RefreshPolicy
from tests.source_contract_support import NOW, live_provenance, offline_provenance

policy = RefreshPolicy(
    fresh_after_seconds=60,
    stale_after_seconds=120,
    expired_after_seconds=180,
    allow_source_provided_freshness=False,
    required_time_basis=TimeBasis.FETCHED_AT,
)
evaluator = DeterministicFreshnessPolicy()


def _at(seconds: int) -> FreshnessState:
    provenance = live_provenance(fetched_at=NOW - timedelta(seconds=seconds))
    return evaluator.evaluate(now=NOW, provenance=provenance, policy=policy)


def test_threshold_boundaries() -> None:
    assert _at(60) is FreshnessState.FRESH
    assert _at(61) is FreshnessState.STALE
    assert _at(180) is FreshnessState.STALE
    assert _at(181) is FreshnessState.EXPIRED


def test_missing_time_is_unknown_and_future_time_is_rejected() -> None:
    missing = live_provenance().model_copy(update={"issued_at": None})
    issued_policy = policy.model_copy(update={"required_time_basis": TimeBasis.ISSUED_AT})
    assert evaluator.evaluate(now=NOW, provenance=missing, policy=issued_policy) is FreshnessState.UNKNOWN
    future = live_provenance(fetched_at=NOW + timedelta(seconds=5))
    with pytest.raises(FreshnessInputError) as caught:
        evaluator.evaluate(now=NOW, provenance=future, policy=policy)
    assert caught.value.code == "negative_age"


def test_offline_age_and_source_provided_state() -> None:
    cached = RefreshPolicy(
        fresh_after_seconds=60,
        stale_after_seconds=120,
        expired_after_seconds=None,
        allow_source_provided_freshness=False,
        required_time_basis=TimeBasis.CACHED_AGE,
    )
    offline = offline_provenance(200)
    assert evaluator.evaluate(now=NOW, provenance=offline, policy=cached) is FreshnessState.STALE
    allowed = policy.model_copy(update={"allow_source_provided_freshness": True})
    provided = live_provenance().model_copy(update={"source_provided_freshness": FreshnessState.EXPIRED})
    assert evaluator.evaluate(now=NOW, provenance=provided, policy=allowed) is FreshnessState.EXPIRED
    assert evaluator.evaluate(now=NOW, provenance=provided, policy=policy) is FreshnessState.FRESH


def test_same_inputs_are_deterministic() -> None:
    provenance = live_provenance(fetched_at=NOW - timedelta(seconds=90))
    assert evaluator.evaluate(now=NOW, provenance=provenance, policy=policy) == evaluator.evaluate(
        now=NOW, provenance=provenance, policy=policy
    )
