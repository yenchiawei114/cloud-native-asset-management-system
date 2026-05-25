"""loaner_return_flow: borrower_id, loaner_return confirmations, WAITING_LOANER_RETURN status

Revision ID: c1d2e3f4a5b6
Revises: 2b3c4d5e6f7a
Create Date: 2026-05-16 00:00:00.000000+00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import mysql

from alembic import op

revision: str = 'c1d2e3f4a5b6'
down_revision: str | Sequence[str] | None = '2b3c4d5e6f7a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 新增 borrower_id 到 assets（追蹤目前借用備用機的人）
    op.add_column('assets', sa.Column('borrower_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        'fk_assets_borrower_id',
        'assets', 'users',
        ['borrower_id'], ['id'],
    )

    # 新增 WAITING_LOANER_RETURN 到 repair_request 狀態 enum
    op.alter_column(
        'repair_requests', 'status',
        existing_type=mysql.ENUM(
            'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'RETURNED',
            name='repair_request_status',
        ),
        type_=mysql.ENUM(
            'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'RETURNED', 'WAITING_LOANER_RETURN',
            name='repair_request_status',
        ),
        nullable=False,
    )

    # 新增備用機歸還確認欄位
    op.add_column('repair_requests', sa.Column('loaner_return_borrower_confirmed', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('repair_requests', sa.Column('loaner_return_lender_confirmed', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('repair_requests', 'loaner_return_lender_confirmed')
    op.drop_column('repair_requests', 'loaner_return_borrower_confirmed')

    op.alter_column(
        'repair_requests', 'status',
        existing_type=mysql.ENUM(
            'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'RETURNED', 'WAITING_LOANER_RETURN',
            name='repair_request_status',
        ),
        type_=mysql.ENUM(
            'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'RETURNED',
            name='repair_request_status',
        ),
        nullable=False,
    )

    op.drop_constraint('fk_assets_borrower_id', 'assets', type_='foreignkey')
    op.drop_column('assets', 'borrower_id')
