"""add_job_indexes

Revision ID: 999abcdef456
Revises: 888abcdef123
Create Date: 2026-09-16 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '999abcdef456'
down_revision = '888abcdef123'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create indexes on jobs table
    op.create_index(op.f('ix_jobs_user_id'), 'jobs', ['user_id'], unique=False)
    op.create_index(op.f('ix_jobs_status'), 'jobs', ['status'], unique=False)
    op.create_index('ix_jobs_user_id_created_at_desc', 'jobs', ['user_id', sa.text('created_at DESC')])

def downgrade() -> None:
    op.drop_index('ix_jobs_user_id_created_at_desc', table_name='jobs')
    op.drop_index(op.f('ix_jobs_status'), table_name='jobs')
    op.drop_index(op.f('ix_jobs_user_id'), table_name='jobs')
