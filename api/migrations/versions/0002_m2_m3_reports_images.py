"""M2/M3: categories, pins, reports, images

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _point():
    return Geography("POINT", srid=4326, spatial_index=False)


def _ts(name, nullable=False, now=False):
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=nullable, server_default=sa.func.now() if now else None
    )


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("department", sa.String(60), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    # Working list until the supervisor signs off the categories (SRS Section 2.8).
    op.execute(
        """
        INSERT INTO categories (id, slug, name, department, sort_order) VALUES
          (gen_random_uuid(), 'pothole', 'Pothole', 'Roads', 1),
          (gen_random_uuid(), 'waterlogged_road', 'Waterlogged road', 'Drainage', 2),
          (gen_random_uuid(), 'blocked_drain', 'Blocked drain', 'Drainage', 3),
          (gen_random_uuid(), 'debris', 'Fallen branch or debris', 'Sanitation', 4),
          (gen_random_uuid(), 'other', 'Other', 'General', 5)
        """
    )

    op.create_table(
        "pins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("location", _point(), nullable=False),
        sa.Column("avg_accuracy_m", sa.Float(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("severity", sa.SmallInteger()),
        sa.Column("supporter_count", sa.Integer(), nullable=False, server_default="0"),
        _ts("first_reported_at"),
        _ts("last_reported_at"),
        _ts("closed_at", nullable=True),
        sa.Column("follows_pin_id", UUID(as_uuid=True), sa.ForeignKey("pins.id")),
        sa.Column("priority_score", sa.Float()),
        sa.Column("score_breakdown", JSONB()),
        sa.Column("paid_total", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("status IN ('open', 'pending_repair', 'closed')", name="ck_pins_status"),
    )
    op.create_index("ix_pins_location", "pins", ["location"], postgresql_using="gist")
    op.create_index("ix_pins_category_status_last", "pins", ["category_id", "status", "last_reported_at"])

    op.create_table(
        "reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("client_uuid", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("pin_id", UUID(as_uuid=True), sa.ForeignKey("pins.id")),
        sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("location", _point(), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=False),
        sa.Column("is_mocked", sa.Boolean(), nullable=False, server_default="false"),
        _ts("captured_at"),
        _ts("created_at", now=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="received"),
        sa.Column("merge_decision", JSONB()),
        sa.CheckConstraint("state IN ('received', 'merged', 'rejected')", name="ck_reports_state"),
        sa.CheckConstraint("accuracy_m > 0", name="ck_reports_accuracy"),
    )
    op.create_index("ix_reports_location", "reports", ["location"], postgresql_using="gist")
    op.create_index("ix_reports_user_id", "reports", ["user_id"])
    op.create_index("ix_reports_pin_id", "reports", ["pin_id"])

    op.create_table(
        "images",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("report_id", UUID(as_uuid=True), sa.ForeignKey("reports.id")),
        sa.Column("pin_id", UUID(as_uuid=True), sa.ForeignKey("pins.id")),
        sa.Column("uploader_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("storage_name", sa.String(40), nullable=False, unique=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("phash", sa.String(16), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        _ts("taken_at", nullable=True),
        _ts("created_at", now=True),
        sa.CheckConstraint("kind IN ('report', 'repair_after')", name="ck_images_kind"),
    )
    for col in ("report_id", "pin_id", "uploader_id", "sha256", "phash"):
        op.create_index(f"ix_images_{col}", "images", [col])


def downgrade() -> None:
    op.drop_table("images")
    op.drop_table("reports")
    op.drop_table("pins")
    op.drop_table("categories")
