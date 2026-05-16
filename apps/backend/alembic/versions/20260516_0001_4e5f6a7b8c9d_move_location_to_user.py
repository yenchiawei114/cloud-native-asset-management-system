"""move location from department to user

Revision ID: 4e5f6a7b8c9d
Revises: c1d2e3f4a5b6
Create Date: 2026-05-16 00:01:00.000000+00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '4e5f6a7b8c9d'
down_revision: str | None = 'c1d2e3f4a5b6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('location', sa.String(255), nullable=True))
    op.drop_column('departments', 'location')


def downgrade() -> None:
    op.add_column('departments', sa.Column('location', sa.String(255), nullable=False, server_default=''))
    op.drop_column('users', 'location')
