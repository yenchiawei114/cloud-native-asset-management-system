"""add hire_date and termination_date to users

Revision ID: 7b8c9d0e1f2g
Revises: 6a7b8c9d0e1f
Create Date: 2026-05-17 00:01:00.000000

"""
import sqlalchemy as sa

from alembic import op

revision = '7b8c9d0e1f2g'
down_revision = '6a7b8c9d0e1f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('hire_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('termination_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'termination_date')
    op.drop_column('users', 'hire_date')
