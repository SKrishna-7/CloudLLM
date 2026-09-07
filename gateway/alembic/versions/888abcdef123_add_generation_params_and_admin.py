"""add generation params and is_admin

Revision ID: 888abcdef123
Revises: 774eb60ad105
Create Date: 2026-09-07 21:28:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '888abcdef123'
down_revision: Union[str, None] = '774eb60ad105'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_admin to users table
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))
    
    # Add generation params to jobs table
    op.add_column('jobs', sa.Column('negative_prompt', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('steps', sa.Integer(), server_default='35', nullable=False))
    op.add_column('jobs', sa.Column('guidance_scale', sa.Float(), server_default='3.4', nullable=False))
    op.add_column('jobs', sa.Column('width', sa.Integer(), server_default='832', nullable=False))
    op.add_column('jobs', sa.Column('height', sa.Integer(), server_default='1216', nullable=False))


def downgrade() -> None:
    # Drop columns from jobs
    op.drop_column('jobs', 'height')
    op.drop_column('jobs', 'width')
    op.drop_column('jobs', 'guidance_scale')
    op.drop_column('jobs', 'steps')
    op.drop_column('jobs', 'negative_prompt')
    
    # Drop column from users
    op.drop_column('users', 'is_admin')
