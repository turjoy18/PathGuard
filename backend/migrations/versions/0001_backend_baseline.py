"""Create the empty backend baseline.

Revision ID: 0001_backend_baseline
Revises:
Create Date: 2026-10-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001_backend_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
