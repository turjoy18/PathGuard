"""Add the verified human-shelter catalogue.

Revision ID: 0003_human_shelter_catalogue
Revises: 0002_official_source_contracts
Create Date: 2026-10-09

Human shelters are stored separately from typhoon-shelter references. This
revision does not create a combined destination table or a typhoon-shelter table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_human_shelter_catalogue"
down_revision: str | None = "0002_official_source_contracts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FACILITY_KEYS = (
    "step_free_entry",
    "lift",
    "ramp",
    "accessible_toilet",
    "stairs_only_entry",
)
FRESHNESS_STATES = ("fresh", "stale", "expired", "unavailable", "unknown")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "human_shelter_publications",
        sa.Column("publication_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("schema_version", sa.Text(), nullable=False),
        sa.Column("fixture_name", sa.Text(), nullable=False),
        sa.Column("fixture_version", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("pilot_area", sa.Text(), nullable=False),
        sa.Column("owner", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("coverage", sa.Text(), nullable=False),
        sa.Column("limitations", sa.Text(), nullable=False),
        sa.Column("verification_method", sa.Text(), nullable=False),
        sa.Column("data_classification", sa.Text(), nullable=False),
        sa.Column("official_citywide", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("data_mode", sa.String(length=32), nullable=False),
        sa.Column("publication_date", sa.Date(), nullable=False),
        sa.Column("available", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "label = 'PathGuard verified prototype/demo catalogue'",
            name="ck_human_shelter_publications_label",
        ),
        sa.CheckConstraint(
            "pilot_area = 'Central Hong Kong'",
            name="ck_human_shelter_publications_pilot_area",
        ),
        sa.CheckConstraint(
            "data_classification = 'mock_demo'",
            name="ck_human_shelter_publications_classification",
        ),
        sa.CheckConstraint(
            "official_citywide = false",
            name="ck_human_shelter_publications_not_citywide",
        ),
        sa.CheckConstraint(
            "data_mode IN ('snapshot', 'replay')",
            name="ck_human_shelter_publications_mode",
        ),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_human_shelter_publications_current "
        "ON human_shelter_publications (is_current) WHERE is_current"
    )
    op.create_table(
        "human_shelters",
        sa.Column("shelter_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("publication_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stable_id", sa.String(length=128), nullable=False),
        sa.Column("record_type", sa.String(length=64), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("authority", sa.Text(), nullable=False),
        sa.Column("pilot_area", sa.Text(), nullable=False),
        sa.Column("source_crs", sa.Text(), nullable=False),
        sa.Column("operating_status", sa.String(length=32), nullable=False),
        sa.Column("capacity_state", sa.String(length=32), nullable=False),
        sa.Column("capacity_source", sa.Text(), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("freshness_state", sa.String(length=32), nullable=False),
        sa.Column("data_mode", sa.String(length=32), nullable=False),
        sa.Column("provenance_json", postgresql.JSONB(), nullable=False),
        sa.Column("entrances_json", postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(
            ["publication_id"],
            ["human_shelter_publications.publication_id"],
            name="fk_human_shelters_publication",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "publication_id",
            "stable_id",
            name="uq_human_shelters_publication_stable_id",
        ),
        sa.CheckConstraint(
            "record_type = 'human_shelter'",
            name="ck_human_shelters_record_type",
        ),
        sa.CheckConstraint(
            "char_length(stable_id) BETWEEN 1 AND 128",
            name="ck_human_shelters_stable_id",
        ),
        sa.CheckConstraint(
            "pilot_area = 'Central Hong Kong'",
            name="ck_human_shelters_pilot_area",
        ),
        sa.CheckConstraint(
            "operating_status IN ('open', 'closed', 'unknown')",
            name="ck_human_shelters_status",
        ),
        sa.CheckConstraint(
            "capacity_state IN ('available', 'unavailable', 'unknown')",
            name="ck_human_shelters_capacity",
        ),
        sa.CheckConstraint(
            "data_mode IN ('snapshot', 'replay')",
            name="ck_human_shelters_mode",
        ),
        sa.CheckConstraint(
            "freshness_state IN ('fresh', 'stale', 'expired', 'unavailable', 'unknown')",
            name="ck_human_shelters_freshness",
        ),
    )
    op.execute("ALTER TABLE human_shelters ADD COLUMN geom geometry(Point, 4326) NOT NULL")
    op.create_index("ix_human_shelters_stable_id", "human_shelters", ["stable_id"])
    op.execute("CREATE INDEX ix_human_shelters_geom ON human_shelters USING GIST (geom)")
    op.create_table(
        "human_shelter_facilities",
        sa.Column("shelter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("facility_key", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("evidence_source", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("evidence_freshness_state", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(
            ["shelter_id"],
            ["human_shelters.shelter_id"],
            name="fk_human_shelter_facilities_shelter",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("shelter_id", "facility_key", name="pk_human_shelter_facilities"),
        sa.CheckConstraint(
            "facility_key IN ("
            "'step_free_entry', 'lift', 'ramp', 'accessible_toilet', 'stairs_only_entry')",
            name="ck_human_shelter_facilities_key",
        ),
        sa.CheckConstraint(
            "state IN ('yes', 'no', 'unknown')",
            name="ck_human_shelter_facilities_state",
        ),
        sa.CheckConstraint(
            "evidence_freshness_state IN ('fresh', 'stale', 'expired', 'unavailable', 'unknown')",
            name="ck_human_shelter_facilities_freshness",
        ),
    )


def downgrade() -> None:
    op.drop_table("human_shelter_facilities")
    op.execute("DROP INDEX IF EXISTS ix_human_shelters_geom")
    op.drop_index("ix_human_shelters_stable_id", table_name="human_shelters")
    op.drop_table("human_shelters")
    op.execute("DROP INDEX IF EXISTS uq_human_shelter_publications_current")
    op.drop_table("human_shelter_publications")
