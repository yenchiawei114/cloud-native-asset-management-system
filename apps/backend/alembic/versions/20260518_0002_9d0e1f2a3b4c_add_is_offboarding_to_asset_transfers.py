"""add is_offboarding_transfer to asset_transfers

Revision ID: 9d0e1f2a3b4c
Revises: 8c9d0e1f2a3b
Create Date: 2026-05-18 00:02:00.000000
"""
import sqlalchemy as sa

from alembic import op

revision = '9d0e1f2a3b4c'
down_revision = '8c9d0e1f2a3b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'asset_transfers',
        sa.Column('is_offboarding_transfer', sa.Boolean(), nullable=False, server_default=sa.text('0')),
    )


def downgrade() -> None:
    op.drop_column('asset_transfers', 'is_offboarding_transfer')
