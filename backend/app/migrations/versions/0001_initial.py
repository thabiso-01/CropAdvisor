"""Initial schema: the analyses table.

Revision ID: 0001
Revises:
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("crop", sa.String(80), nullable=False),
        sa.Column("image_file", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lang", sa.String(8), nullable=False),
        sa.Column("health_score", sa.Integer(), nullable=False),
        sa.Column("health_status", sa.String(20), nullable=False),
        sa.Column("favorite", sa.Boolean(), nullable=False),
        sa.Column("provider", sa.String(80), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
    )
    op.create_index("ix_analyses_created_at", "analyses", ["created_at"])
    op.create_index("ix_analyses_device_id", "analyses", ["device_id"])


def downgrade() -> None:
    op.drop_index("ix_analyses_device_id", table_name="analyses")
    op.drop_index("ix_analyses_created_at", table_name="analyses")
    op.drop_table("analyses")
