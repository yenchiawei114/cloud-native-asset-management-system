"""add handled_by to repair_requests

Revision ID: f3a1b2c4d5e6
Revises: e1258e5d49bf
Create Date: 2026-05-23 00:00:00.000000+00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'f3a1b2c4d5e6'
down_revision: str | Sequence[str] | None = 'e1258e5d49bf'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'repair_requests',
        sa.Column('handled_by', sa.BigInteger(), sa.ForeignKey('users.id', name='fk_repair_requests_handled_by'), nullable=True),
    )
    op.create_index('ix_repair_requests_handled_by', 'repair_requests', ['handled_by'])


def downgrade() -> None:
    op.drop_index('ix_repair_requests_handled_by', table_name='repair_requests')
    op.drop_constraint('fk_repair_requests_handled_by', 'repair_requests', type_='foreignkey')
    op.drop_column('repair_requests', 'handled_by')
