"""add installation_id and github_repo_id to installations

Revision ID: a1b2c3d4e5f6
Revises: e83f4b0f5bf4
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e83f4b0f5bf4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('installations')]

    if 'installation_id' not in columns:
        op.add_column('installations', sa.Column('installation_id', sa.Integer(), nullable=True))

    if 'github_repo_id' not in columns:
        op.add_column('installations', sa.Column('github_repo_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('installations', 'github_repo_id')
    op.drop_column('installations', 'installation_id')
