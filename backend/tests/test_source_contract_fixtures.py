import json
from pathlib import Path

from app.source_contracts.models import CSDIRouteResult, SourceRecord

FIXTURES = Path(__file__).parents[1] / "app" / "source_contracts" / "fixtures"


def test_committed_fixtures_match_the_contract_models() -> None:
    routes = {
        "valid_route.json": "route_returned",
        "stale_route.json": "route_returned",
        "unavailable_route.json": "route_unavailable",
        "unknown_route.json": "route_unknown",
        "rejected_route_input.json": "route_returned",
        "offline_route.json": "route_unavailable",
        "replay_route.json": "route_returned",
    }
    for name, status in routes.items():
        payload = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
        model = CSDIRouteResult.model_validate(payload)
        assert model.contract_status.value == status
        assert model.contract_version == "official-source-contracts.v1"
        assert "provider_payload" not in payload
    partial = json.loads((FIXTURES / "partial_shelter_record.json").read_text(encoding="utf-8"))
    record = SourceRecord.model_validate(partial)
    assert record.record_type.value == "typhoon_shelter_reference"
    assert record.provenance.source_record_id is None
    assert partial["attributes"]["capacity"]["state"] == "unknown"
    assert "value" not in partial["attributes"]["capacity"]
    stale = json.loads((FIXTURES / "stale_route.json").read_text(encoding="utf-8"))
    assert stale["provenance"]["freshness_state"] == "stale"
