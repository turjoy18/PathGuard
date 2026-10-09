import importlib
import inspect
import os

import pytest

revision = importlib.import_module("migrations.versions.0003_human_shelter_catalogue")


def test_revision_is_separate_from_typhoon_references() -> None:
    source = inspect.getsource(revision.upgrade)
    downgrade = inspect.getsource(revision.downgrade)
    assert revision.down_revision == "0002_official_source_contracts"
    for name in ("human_shelter_publications", "human_shelters", "human_shelter_facilities"):
        assert name in source
        assert name in downgrade
    assert "geometry(Point, 4326)" in source
    assert "USING GIST" in source
    assert "uq_human_shelters_publication_stable_id" in source
    assert "DateTime(timezone=True)" in source
    assert "record_type = 'human_shelter'" in source
    assert "advisory_typhoon_shelters" not in source
    assert "destinations" not in source
    assert downgrade.index("human_shelter_facilities") < downgrade.index("human_shelters")
    assert downgrade.index("human_shelters") < downgrade.index("human_shelter_publications")


def postgres_available() -> str | None:
    url = os.getenv("DATABASE_URL", "postgresql://pathguard:pathguard@localhost:5432/pathguard")
    try:
        import psycopg

        with psycopg.connect(url, connect_timeout=2) as connection:
            connection.execute("SELECT 1")
    except Exception:
        return None
    return url


@pytest.mark.skipif(postgres_available() is None, reason="PostgreSQL/PostGIS is not available")
def test_postgis_publication_round_trip_and_typhoon_insert_is_rejected() -> None:
    import psycopg
    from alembic import command
    from alembic.config import Config

    from app.human_shelters.service import build_postgres_service
    from tests.human_shelter_support import NOW

    admin_url = postgres_available()
    assert admin_url is not None
    database = "pathguard_human_shelter_test"
    with psycopg.connect(admin_url, autocommit=True) as connection:
        connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
        connection.execute(f'CREATE DATABASE "{database}"')
    test_url = admin_url.rsplit("/", 1)[0] + f"/{database}"
    config = Config("alembic.ini")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = test_url
    try:
        command.upgrade(config, "head")
        service = build_postgres_service(test_url, clock=lambda: NOW)
        listed = service.list_shelters()
        assert listed.publication_current is True
        assert len(listed.records) == 4
        assert listed.records[0].location.srid == 4326
        with psycopg.connect(test_url) as connection:
            srid = connection.execute("SELECT ST_SRID(geom) FROM human_shelters LIMIT 1").fetchone()
            assert srid is not None and srid[0] == 4326
            with pytest.raises(psycopg.errors.CheckViolation):
                connection.execute(
                    """
                    INSERT INTO human_shelters (
                        shelter_id, publication_id, stable_id, record_type, name, address,
                        authority, pilot_area, source_crs, geom, operating_status, capacity_state,
                        freshness_state, data_mode, provenance_json, entrances_json
                    )
                    SELECT gen_random_uuid(), publication_id, 'typhoon-row',
                           'typhoon_shelter_reference', 'n', 'a', 'Marine Department',
                           'Central Hong Kong', 'EPSG:4326',
                           ST_SetSRID(ST_MakePoint(114.15, 22.28), 4326),
                           'unknown', 'unknown', 'unknown', 'snapshot', '{}'::jsonb, '[]'::jsonb
                    FROM human_shelter_publications
                    WHERE is_current
                    """
                )
            connection.rollback()
        service._repository._engine.dispose()
        command.downgrade(config, "0002_official_source_contracts")
        with psycopg.connect(test_url) as connection:
            remaining = connection.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN (
                    'human_shelters', 'human_shelter_facilities', 'human_shelter_publications'
                  )
                """
            ).fetchall()
            official = connection.execute(
                "SELECT source_key FROM source_registry ORDER BY source_key"
            ).fetchall()
        assert remaining == []
        assert [row[0] for row in official] == ["csdi", "hko", "marine_department"]
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        with psycopg.connect(admin_url, autocommit=True) as connection:
            connection.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                (database,),
            )
            connection.execute(f'DROP DATABASE IF EXISTS "{database}"')
