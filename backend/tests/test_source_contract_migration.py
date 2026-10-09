import importlib
import inspect
import os

import pytest

revision = importlib.import_module("migrations.versions.0002_official_source_contracts")


def test_revision_is_additive_and_reversible() -> None:
    source = inspect.getsource(revision.upgrade)
    downgrade = inspect.getsource(revision.downgrade)
    assert revision.down_revision == "0001_backend_baseline"
    for name in ("source_registry", "source_health", "source_publications", "publication_receipts"):
        assert name in source
        assert name in downgrade
    assert "ON CONFLICT (source_key) DO NOTHING" in inspect.getsource(
        importlib.import_module("app.source_contracts.seed").seed_registry
    )
    assert downgrade.index("publication_receipts") < downgrade.index("source_health")
    assert downgrade.index("source_health") < downgrade.index("source_publications")
    assert downgrade.index("source_publications") < downgrade.index("source_registry")
    assert "csdi" in source and "hko" in source and "marine_department" in source


def test_seed_entries_are_the_three_official_sources() -> None:
    from app.source_contracts.registry import initial_registry_entries

    keys = [entry.source_key.value for entry in initial_registry_entries()]
    assert keys == ["csdi", "hko", "marine_department"]


def postgres_available() -> str | None:
    url = os.getenv("DATABASE_URL", "postgresql://pathguard:pathguard@localhost:5432/pathguard")
    try:
        import psycopg

        with psycopg.connect(url, connect_timeout=2) as connection:
            connection.execute("SELECT 1")
        return url
    except Exception:
        return None


@pytest.mark.skipif(postgres_available() is None, reason="PostgreSQL/PostGIS is not available")
def test_upgrade_seed_and_downgrade_against_postgres() -> None:
    import psycopg
    from alembic import command
    from alembic.config import Config

    admin_url = postgres_available()
    assert admin_url is not None
    database = "pathguard_source_contract_test"
    with psycopg.connect(admin_url, autocommit=True) as connection:
        connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
        connection.execute(f'CREATE DATABASE "{database}"')
    test_url = admin_url.rsplit("/", 1)[0] + f"/{database}"
    config = Config("alembic.ini")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = test_url
    try:
        command.upgrade(config, "head")
        with psycopg.connect(test_url) as connection:
            rows = connection.execute("SELECT source_key, enabled FROM source_registry ORDER BY source_key").fetchall()
            assert [row[0] for row in rows] == ["csdi", "hko", "marine_department"]
            connection.execute("UPDATE source_registry SET enabled = false WHERE source_key = 'csdi'")
            connection.commit()
        from app.db.session import create_db_engine
        from app.source_contracts.seed import seed_registry

        engine = create_db_engine(test_url)
        with engine.begin() as connection:
            seed_registry(connection)
        with psycopg.connect(test_url) as connection:
            enabled = connection.execute(
                "SELECT enabled FROM source_registry WHERE source_key = 'csdi'"
            ).fetchone()
            assert enabled is not None and enabled[0] is False
            tables = connection.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            ).fetchall()
        command.downgrade(config, "0001_backend_baseline")
        with psycopg.connect(test_url) as connection:
            remaining = connection.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN (
                    'source_registry', 'source_health', 'source_publications', 'publication_receipts'
                  )
                """
            ).fetchall()
            assert remaining == []
        assert tables
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        with psycopg.connect(admin_url, autocommit=True) as connection:
            connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
