"""add img2img columns

Revision ID: aaa111bbb222
Revises: 999abcdef456
Create Date: 2026-09-16 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'aaa111bbb222'
down_revision = '999abcdef456'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add columns to jobs table
    op.add_column('jobs', sa.Column('init_image_url', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('strength', sa.Float(), nullable=True))

def downgrade() -> None:
    op.drop_column('jobs', 'strength')
    op.drop_column('jobs', 'init_image_url')
