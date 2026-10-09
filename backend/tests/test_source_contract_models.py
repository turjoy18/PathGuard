from __future__ import annotations

from datetime import timedelta, timezone

import pytest
from pydantic import ValidationError

from app.source_contracts.enums import (
    AccessibilityState,
    ContractStatus,
    FailureCategory,
    FreshnessState,
    GeometryType,
    OperatingMode,
    PublicationStatus,
    RecordType,
    SourceKey,
    TimeBasis,
    ValidationClassification,
    ValuePresence,
)
from app.source_contracts.provenance import LiveMetadata, ProvenanceEnvelope
from app.source_contracts.values import ValueState
from app.source_contracts.version import CONTRACT_VERSION
from tests.source_contract_support import NOW, live_provenance, offline_provenance, replay_provenance, snapshot_provenance


def test_contract_version_is_independent_of_source_version() -> None:
    provenance = live_provenance(source_version="provider-payload-v8")
    assert provenance.contract_version == CONTRACT_VERSION
    assert provenance.source_version == "provider-payload-v8"
    assert provenance.contract_version != provenance.source_version


def test_controlled_enums_serialize_stable_strings() -> None:
    assert [item.value for item in OperatingMode] == ["live", "snapshot", "replay", "offline"]
    assert [item.value for item in FreshnessState] == ["fresh", "stale", "expired", "unavailable", "unknown"]
    assert [item.value for item in ContractStatus] == [
        "route_returned",
        "route_rejected",
        "route_unavailable",
        "route_unknown",
    ]
    assert [item.value for item in ValidationClassification] == [
        "error",
        "warning",
        "unknown_value",
        "unavailable_result",
    ]
    assert [item.value for item in SourceKey] == ["csdi", "hko", "marine_department"]
    assert RecordType.HUMAN_SHELTER.value == "human_shelter"
    assert RecordType.TYPHOON_SHELTER_REFERENCE.value == "typhoon_shelter_reference"
    assert FailureCategory.DATABASE_UNAVAILABLE.value == "database_unavailable"
    assert AccessibilityState.NOT_EVALUATED.value == "not_evaluated"
    assert PublicationStatus.IDEMPOTENT_REPLAY.value == "idempotent_replay"
    assert TimeBasis.CACHED_AGE.value == "cached_age"
    assert GeometryType.LINE_STRING.value == "LineString"
    with pytest.raises(ValueError):
        OperatingMode("sometimes")


def test_value_state_rejects_fabricated_unknown_values() -> None:
    known = ValueState[bool](state=ValuePresence.KNOWN, value=False)
    unknown = ValueState[str](state=ValuePresence.UNKNOWN, explanation="not supplied")
    unavailable = ValueState[float](state=ValuePresence.UNAVAILABLE, explanation="not in force")
    assert known.model_dump(mode="json")["value"] is False
    assert "value" not in unknown.model_dump(mode="json")
    assert unavailable.model_dump(mode="json")["state"] == "unavailable"
    with pytest.raises(ValidationError):
        ValueState[bool](state=ValuePresence.KNOWN)
    with pytest.raises(ValidationError):
        ValueState[bool](state=ValuePresence.UNKNOWN, value=False)
    with pytest.raises(ValidationError):
        ValueState[int](state=ValuePresence.UNAVAILABLE, value=0)


def test_operating_modes_keep_optional_times_absent() -> None:
    live = live_provenance()
    snapshot = snapshot_provenance()
    replay = replay_provenance()
    offline = offline_provenance()
    assert live.issued_at is None and live.valid_until is None
    assert live.model_dump()["issued_at"] is None
    assert snapshot.mode_metadata.snapshot_version == "snapshot-2026-10-09"
    assert snapshot.source_version == "dataset-2"
    assert replay.mode_metadata.demo_or_test is True
    assert replay.mode_metadata.fixture_id == "demo-typhoon-01"
    assert offline.mode_metadata.non_live_limitation
    assert offline.mode is OperatingMode.OFFLINE


def test_invalid_mode_metadata_and_time_order_are_rejected() -> None:
    with pytest.raises(ValidationError):
        ProvenanceEnvelope(
            mode=OperatingMode.LIVE,
            source_name="CSDI",
            fetched_at=None,
            freshness_state=FreshnessState.UNKNOWN,
            mode_metadata=LiveMetadata(mode=OperatingMode.LIVE, fetched_at=NOW),
        )
    with pytest.raises(ValidationError):
        live_provenance(fetched_at=NOW.replace(tzinfo=None))
    with pytest.raises(ValidationError):
        live_provenance(issued_at=NOW + timedelta(seconds=1))
    with pytest.raises(ValidationError):
        ProvenanceEnvelope(
            mode=OperatingMode.REPLAY,
            source_name="CSDI",
            fetched_at=NOW,
            freshness_state=FreshnessState.UNKNOWN,
            mode_metadata=LiveMetadata(mode=OperatingMode.LIVE, fetched_at=NOW),
        )


def test_provider_timestamps_are_preserved() -> None:
    issued = NOW - timedelta(minutes=2)
    provenance = live_provenance(issued_at=issued, source_record_id="kept-id", source_version="kept-version")
    assert provenance.fetched_at == NOW
    assert provenance.issued_at == issued
    assert provenance.issued_at != provenance.fetched_at
    assert provenance.source_record_id == "kept-id"
    assert provenance.source_version == "kept-version"
    assert provenance.fetched_at.utcoffset() == timezone.utc.utcoffset(None)
