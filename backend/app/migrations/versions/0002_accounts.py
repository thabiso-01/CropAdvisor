"""User accounts: users, sign-in sessions, and an owner on each analysis.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("identifier", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
    )
    op.create_index("ix_users_identifier", "users", ["identifier"], unique=True)
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    with op.batch_alter_table("analyses") as batch:
        batch.add_column(sa.Column("user_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_analyses_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE")
        batch.create_index("ix_analyses_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("analyses") as batch:
        batch.drop_index("ix_analyses_user_id")
        batch.drop_constraint("fk_analyses_user_id", type_="foreignkey")
        batch.drop_column("user_id")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_users_identifier", table_name="users")
    op.drop_table("users")
