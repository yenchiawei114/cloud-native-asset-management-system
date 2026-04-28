"""merge multi heads

Revision ID: 99cadff67b78
Revises: 743e2720b75d, 08009148274f
Create Date: 2026-04-21 09:41:01.038149+00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '99cadff67b78'
down_revision: str | Sequence[str] | None = ('743e2720b75d', '08009148274f')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
