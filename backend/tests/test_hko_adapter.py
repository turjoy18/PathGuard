from datetime import datetime, timezone

from app.adapters.hko import official_status


NOW = datetime(2026, 10, 9, 4, 0, tzinfo=timezone.utc)


def test_official_warning_text_is_preserved() -> None:
    body = official_status("en", mode="fixture", sample="valid", guest_key="hko-valid", now=NOW)
    official = body["result"]["attributes"]["official"]["warnsum"]["WRAIN"]
    assert official["name"] == "Rainstorm Warning Signal"
    assert body["result"]["attributes"]["pathguard_guidance"] is None
    assert body["result"]["geometry"] is None
    assert body["freshness_state"] == "fresh"


def test_empty_hko_summary_does_not_invent_a_warning() -> None:
    body = official_status("tc", mode="fixture", sample="none", guest_key="hko-none", now=NOW)
    assert body["result"]["attributes"]["official"]["warnsum"] == {}
    assert body["result"]["attributes"]["warning_status"]["state"] == "unavailable"
    assert "Rainstorm" not in str(body["result"]["attributes"]["official"])
