"""Add official source contract registry, health, publications, and receipts.

Revision ID: 0002_official_source_contracts
Revises: 0001_backend_baseline
Create Date: 2026-10-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_official_source_contracts"
down_revision: str | None = "0001_backend_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SOURCE_KEYS = ("csdi", "hko", "marine_department")
FRESHNESS_STATES = ("fresh", "stale", "expired", "unavailable", "unknown")
RECORD_TYPES = (
    "csdi_route_result",
    "official_source_record",
    "typhoon_shelter_reference",
    "human_shelter",
)
OUTCOME_STATUSES = ("published", "idempotent_replay", "rejected", "conflict")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "source_registry",
        sa.Column("source_key", sa.String(length=64), primary_key=True),
        sa.Column("source_name", sa.Text(), nullable=False),
        sa.Column("authority", sa.Text(), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("terms_url", sa.Text(), nullable=False),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("refresh_policy_json", postgresql.JSONB(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source_key IN ('csdi', 'hko', 'marine_department')",
            name="ck_source_registry_source_key",
        ),
        sa.CheckConstraint("char_length(source_name) > 0", name="ck_source_registry_source_name"),
        sa.CheckConstraint("char_length(authority) > 0", name="ck_source_registry_authority"),
        sa.CheckConstraint("char_length(attribution) > 0", name="ck_source_registry_attribution"),
    )
    op.create_table(
        "source_publications",
        sa.Column("publication_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_key", sa.String(length=64), nullable=False),
        sa.Column("record_type", sa.String(length=64), nullable=False),
        sa.Column("source_record_id", sa.Text(), nullable=True),
        sa.Column("source_record_identity", sa.Text(), nullable=False),
        sa.Column("source_version", sa.Text(), nullable=True),
        sa.Column("source_version_identity", sa.Text(), nullable=False),
        sa.Column("publication_key", sa.Text(), nullable=False),
        sa.Column("contract_version", sa.Text(), nullable=False),
        sa.Column("contract_status", sa.String(length=64), nullable=True),
        sa.Column("provenance_json", postgresql.JSONB(), nullable=False),
        sa.Column("validation_json", postgresql.JSONB(), nullable=False),
        sa.Column("normalized_payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("canonical_version", sa.Text(), nullable=False),
        sa.Column("raw_response_hash", sa.String(length=64), nullable=True),
        sa.Column("geometry_json", postgresql.JSONB(), nullable=True),
        sa.Column("geometry_crs", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_key"], ["source_registry.source_key"], name="fk_source_publications_source"),
        sa.UniqueConstraint(
            "source_key",
            "source_record_identity",
            "source_version_identity",
            "publication_key",
            name="uq_source_publications_identity",
        ),
        sa.CheckConstraint(
            "record_type IN ('csdi_route_result', 'official_source_record', "
            "'typhoon_shelter_reference', 'human_shelter')",
            name="ck_source_publications_record_type",
        ),
        sa.CheckConstraint("char_length(payload_hash) = 64", name="ck_source_publications_payload_hash"),
    )
    op.execute("ALTER TABLE source_publications ADD COLUMN geometry geometry")
    op.create_index("ix_source_publications_source_key", "source_publications", ["source_key"])
    op.create_table(
        "source_health",
        sa.Column("source_key", sa.String(length=64), primary_key=True),
        sa.Column("last_successful_fetch_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_attempted_fetch_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_json", postgresql.JSONB(), nullable=True),
        sa.Column("last_successful_publication_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("data_age_seconds", sa.Integer(), nullable=True),
        sa.Column("freshness_state", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_key"], ["source_registry.source_key"], name="fk_source_health_source"),
        sa.ForeignKeyConstraint(
            ["last_successful_publication_id"],
            ["source_publications.publication_id"],
            name="fk_source_health_publication",
        ),
        sa.CheckConstraint(
            "freshness_state IN ('fresh', 'stale', 'expired', 'unavailable', 'unknown')",
            name="ck_source_health_freshness",
        ),
        sa.CheckConstraint(
            "data_age_seconds IS NULL OR data_age_seconds >= 0",
            name="ck_source_health_age",
        ),
    )
    op.create_table(
        "publication_receipts",
        sa.Column("receipt_id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("source_key", sa.String(length=64), nullable=False),
        sa.Column("source_record_identity", sa.Text(), nullable=False),
        sa.Column("source_version", sa.Text(), nullable=True),
        sa.Column("source_version_identity", sa.Text(), nullable=False),
        sa.Column("publication_key", sa.Text(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("canonical_version", sa.Text(), nullable=False),
        sa.Column("outcome_status", sa.String(length=32), nullable=False),
        sa.Column("outcome_json", postgresql.JSONB(), nullable=False),
        sa.Column("publication_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_key"], ["source_registry.source_key"], name="fk_publication_receipts_source"),
        sa.ForeignKeyConstraint(
            ["publication_id"],
            ["source_publications.publication_id"],
            name="fk_publication_receipts_publication",
        ),
        sa.UniqueConstraint(
            "source_key",
            "source_record_identity",
            "source_version_identity",
            "publication_key",
            name="uq_publication_receipts_identity",
        ),
        sa.CheckConstraint(
            "outcome_status IN ('published', 'idempotent_replay', 'rejected', 'conflict')",
            name="ck_publication_receipts_status",
        ),
    )
    op.create_index(
        "ix_publication_receipts_source_key",
        "publication_receipts",
        ["source_key", "publication_key"],
    )
    from app.source_contracts.seed import seed_registry

    seed_registry(op.get_bind())


def downgrade() -> None:
    op.drop_index("ix_publication_receipts_source_key", table_name="publication_receipts")
    op.drop_table("publication_receipts")
    op.drop_table("source_health")
    op.drop_index("ix_source_publications_source_key", table_name="source_publications")
    op.drop_table("source_publications")
    op.drop_table("source_registry")
