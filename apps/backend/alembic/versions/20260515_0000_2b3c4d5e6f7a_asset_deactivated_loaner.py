"""asset_deactivated_status_and_loaner_asset

Revision ID: 2b3c4d5e6f7a
Revises: 4385d7a8eef7
Create Date: 2026-05-15 00:00:00.000000+00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '2b3c4d5e6f7a'
down_revision: str | Sequence[str] | None = '4385d7a8eef7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 新增 deactivated 到 asset 狀態 enum
    op.alter_column(
        'assets', 'status',
        existing_type=mysql.ENUM('in_use', 'maintenance', 'borrowed', 'available', name='assetstatus'),
        type_=mysql.ENUM('in_use', 'maintenance', 'borrowed', 'available', 'deactivated', name='assetstatus'),
        nullable=False,
    )
    # 新增備用機資產欄位到維修申請表
    op.add_column('repair_requests', sa.Column('loaner_asset_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        'fk_repair_requests_loaner_asset_id',
        'repair_requests', 'assets',
        ['loaner_asset_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_repair_requests_loaner_asset_id', 'repair_requests', type_='foreignkey')
    op.drop_column('repair_requests', 'loaner_asset_id')
    op.alter_column(
        'assets', 'status',
        existing_type=mysql.ENUM('in_use', 'maintenance', 'borrowed', 'available', 'deactivated', name='assetstatus'),
        type_=mysql.ENUM('in_use', 'maintenance', 'borrowed', 'available', name='assetstatus'),
        nullable=False,
    )
