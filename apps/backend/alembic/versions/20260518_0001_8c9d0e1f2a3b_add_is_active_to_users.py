"""add is_active to users

Revision ID: 8c9d0e1f2a3b
Revises: 7b8c9d0e1f2g
Create Date: 2026-05-18 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '8c9d0e1f2a3b'
down_revision = '7b8c9d0e1f2g'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1'))
    )


def downgrade() -> None:
    op.drop_column('users', 'is_active')
