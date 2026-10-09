from datetime import datetime, timedelta, timezone

from app.hazards.lifecycle import HazardError, audits_for, reset_hazards, review_report, submit_report


NOW = datetime(2026, 10, 9, 4, 0, tzinfo=timezone.utc)


def setup_function() -> None:
    reset_hazards()


def test_queue_replay_stays_pending_and_strips_note() -> None:
    payload = {
        "hazard_type": "blocked_segment",
        "longitude": 114.15,
        "latitude": 22.28,
        "severity": "high",
        "note": "<b>blocked</b> footbridge",
        "client_queue_id": "queue-1",
        "source_type": "community",
    }
    first = submit_report(payload, now=NOW)
    second = submit_report(payload, now=NOW)
    report = first["report"]
    assert first["server_accepted"] is True
    assert first["acceptance"] == "accepted"
    assert second["idempotent_replay"] is True
    assert second["report"]["report_id"] == report["report_id"]
    assert report["trust_state"] == "pending"
    assert report["effect"] == "none"
    assert report["blocking"] is False
    assert report["note"] == "blocked footbridge"
    assert report["overrides_official_facts"] is False


def test_operator_verify_and_expiry_are_audited() -> None:
    created = submit_report({"hazard_type": "flood", "longitude": 114.2, "latitude": 22.3, "severity": "high", "client_queue_id": "queue-2"}, now=NOW)
    report_id = created["report"]["report_id"]
    try:
        review_report(report_id, "verify", actor="", token="nope", reason="x", now=NOW)
    except HazardError as exc:
        assert exc.code == "unauthorized"
    else:
        raise AssertionError("guest review was accepted")
    verified = review_report(report_id, "verify", actor="op-1", token="operator-demo", reason="seen", now=NOW)
    assert verified["report"]["trust_state"] == "verified"
    assert verified["report"]["effect"] == "invalidate"
    assert verified["report"]["blocking"] is True
    expired = review_report(report_id, "expire", actor="op-1", token="operator-demo", reason="ended", now=NOW + timedelta(hours=1))
    assert expired["report"]["trust_state"] == "expired"
    assert expired["report"]["effect"] == "none"
    assert expired["report"]["blocking"] is False
    actions = [item["action"] for item in audits_for(report_id)]
    assert actions == ["submit", "verify", "expire"]
