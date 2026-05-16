"""add office_locations table

Revision ID: 5f6a7b8c9d0e
Revises: 4e5f6a7b8c9d
Create Date: 2026-05-16 00:02:00.000000+00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '5f6a7b8c9d0e'
down_revision: str | None = '4e5f6a7b8c9d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'office_locations',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )


def downgrade() -> None:
    op.drop_table('office_locations')
