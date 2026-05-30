"""add vendors table

Revision ID: 6a7b8c9d0e1f
Revises: 5f6a7b8c9d0e
Create Date: 2026-05-17 00:00:00.000000+00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '6a7b8c9d0e1f'
down_revision: str | None = '5f6a7b8c9d0e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'vendors',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )


def downgrade() -> None:
    op.drop_table('vendors')
