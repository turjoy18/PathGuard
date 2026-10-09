import os

import pytest

from app.source_contracts.enums import PublicationStatus, SourceKey
from app.source_contracts.persistence import SqlSourceContractRepository, build_sql_service
from tests.source_contract_support import NOW, route, submission
from tests.test_source_contract_migration import postgres_available


@pytest.mark.skipif(postgres_available() is None, reason="PostgreSQL/PostGIS is not available")
def test_sql_publication_replay_conflict_and_failure_retention() -> None:
    from alembic import command
    from alembic.config import Config

    admin_url = postgres_available()
    assert admin_url is not None
    database = "pathguard_source_contract_persistence"
    import psycopg

    with psycopg.connect(admin_url, autocommit=True) as connection:
        connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
        connection.execute(f'CREATE DATABASE "{database}"')
    test_url = admin_url.rsplit("/", 1)[0] + f"/{database}"
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = test_url
    try:
        command.upgrade(Config("alembic.ini"), "head")
        repository = SqlSourceContractRepository(test_url)
        contracts = build_sql_service(repository)
        first = contracts.submit(submission(route(), publication_key="sql-route"), NOW)
        replay = contracts.submit(submission(route(), publication_key="sql-route"), NOW)
        assert first.publication is not None and replay.publication is not None
        assert replay.publication.status is PublicationStatus.IDEMPOTENT_REPLAY
        changed = route().model_copy(update={"distance_meters": 50.0})
        conflict = contracts.submit(submission(changed, publication_key="sql-route"), NOW)
        assert conflict.publication is not None
        assert conflict.publication.status is PublicationStatus.CONFLICT
        stored = repository.get_publication(first.publication.publication_id)
        assert stored is not None
        assert stored.normalized_payload_json["distance_meters"] == 180.0
        health_before = repository.get_health(SourceKey.CSDI).last_successful_fetch_at
        from app.source_contracts.enums import FailureCategory
        from app.source_contracts.failures import SafeFailure
        from datetime import timedelta

        contracts.record_failure(
            SourceKey.CSDI,
            SafeFailure(
                source=SourceKey.CSDI,
                category=FailureCategory.RATE_LIMITED,
                outcome_code="source_rate_limited",
                observed_at=NOW + timedelta(minutes=1),
                message="The source rate limit was reached.",
            ),
            NOW + timedelta(minutes=1),
        )
        health = repository.get_health(SourceKey.CSDI)
        assert health.last_successful_fetch_at == health_before
        assert health.last_failure is not None
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        with psycopg.connect(admin_url, autocommit=True) as connection:
            connection.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                (database,),
            )
            connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
