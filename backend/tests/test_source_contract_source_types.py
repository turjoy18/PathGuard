from tests.test_source_contract_csdi import (
    test_marine_records_cannot_become_human_shelters as marine_records_stay_distinct,
)


def test_source_type_exclusion_matches_the_contract_boundary() -> None:
    marine_records_stay_distinct()
