from app.adapters.csdi import CSDIRouteQuery, plan_csdi
from app.source_contracts.enums import ContractStatus


def test_fixture_route_is_not_an_accessibility_approval() -> None:
    body = plan_csdi(CSDIRouteQuery(origin={"longitude": 114.19133, "latitude": 22.32587}, destination={"longitude": 114.19156, "latitude": 22.32593}), mode="fixture", guest_key="csdi-test")
    assert body["outcome_code"] == "published"
    assert body["result"]["contract_status"] == ContractStatus.ROUTE_RETURNED.value
    assert body["result"]["accessibility_check"]["state"] == "not_evaluated"
    assert body["result"]["geometry"]["coordinates"][0] != body["result"]["geometry"]["coordinates"][-1]
    assert "mapapi.hkmapservice.gov.hk" not in str(body["result"])


def test_identical_fixture_points_do_not_invent_a_line() -> None:
    body = plan_csdi(CSDIRouteQuery(origin={"longitude": 114.15, "latitude": 22.28}, destination={"longitude": 114.15, "latitude": 22.28}), mode="fixture", guest_key="csdi-empty")
    assert body["outcome_code"] == "route_not_returned"
    assert body["result"]["geometry"] is None
    assert body["result"]["distance_meters"] is None
