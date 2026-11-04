"""Account: revocable login sessions, and a purpose on email codes

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_otps", sa.Column("purpose", sa.String(10), nullable=False, server_default="verify")
    )
    op.create_check_constraint("ck_email_otps_purpose", "email_otps", "purpose IN ('verify', 'reset')")

    op.create_table(
        "auth_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("device_id", sa.String(128)),
        sa.Column("refresh_jti", sa.String(64), nullable=False),
        sa.Column("previous_jti", sa.String(64)),
        sa.Column("rotated_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_table("auth_sessions")
    op.drop_constraint("ck_email_otps_purpose", "email_otps")
    op.drop_column("email_otps", "purpose")
