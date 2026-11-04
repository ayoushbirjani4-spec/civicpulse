import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('citizen', 'admin')", name="ck_users_role"),
        CheckConstraint("status IN ('active', 'disabled')", name="ck_users_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(40))
    role: Mapped[str] = mapped_column(String(10), default="citizen", server_default="citizen")
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    status: Mapped[str] = mapped_column(String(10), default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Device(Base):
    """One row per phone. The fingerprint is unique so that when a second person
    logs in on a phone, its push token follows them and leaves the old account."""

    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_fingerprint: Mapped[str] = mapped_column(String(128), unique=True)
    push_token: Mapped[str | None] = mapped_column(String(255))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmailOtp(Base):
    __tablename__ = "email_otps"
    __table_args__ = (CheckConstraint("purpose IN ('verify', 'reset')", name="ck_email_otps_purpose"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # A sign-up code must never reset a password, and a reset code must never verify an email.
    purpose: Mapped[str] = mapped_column(String(10), default="verify", server_default="verify")
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    """One row per login. Every token carries the session id, so ending the session ends
    its refresh token and its access tokens together."""

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[str | None] = mapped_column(String(128))
    # Random ids of the current and the replaced refresh token, so a replayed old token is spotted.
    refresh_jti: Mapped[str] = mapped_column(String(64))
    previous_jti: Mapped[str | None] = mapped_column(String(64))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RateLimitCounter(Base):
    __tablename__ = "rate_limit_counters"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)


def _point():
    # The GiST index is declared explicitly in __table_args__ so Alembic sees it.
    return mapped_column(Geography("POINT", srid=4326, spatial_index=False), nullable=False)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    department: Mapped[str] = mapped_column(String(60))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")


class Pin(Base):
    """One physical hazard. Reports point at a pin; a pin never absorbs them (M5 owns merging)."""

    __tablename__ = "pins"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'pending_repair', 'closed')", name="ck_pins_status"),
        Index("ix_pins_location", "location", postgresql_using="gist"),
        Index("ix_pins_category_status_last", "category_id", "status", "last_reported_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"))
    location = _point()
    avg_accuracy_m: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    severity: Mapped[int | None] = mapped_column(SmallInteger)
    supporter_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    first_reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    follows_pin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pins.id"))
    priority_score: Mapped[float | None] = mapped_column(Float)
    score_breakdown: Mapped[dict | None] = mapped_column(JSONB)
    paid_total: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("state IN ('received', 'merged', 'rejected')", name="ck_reports_state"),
        CheckConstraint("accuracy_m > 0", name="ck_reports_accuracy"),
        Index("ix_reports_location", "location", postgresql_using="gist"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Generated on the phone, so an upload retried after a lost reply is the same report.
    client_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    pin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pins.id"), index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"))
    description: Mapped[str | None] = mapped_column(Text)
    location = _point()
    accuracy_m: Mapped[float] = mapped_column(Float)
    is_mocked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    state: Mapped[str] = mapped_column(String(20), default="received", server_default="received")
    merge_decision: Mapped[dict | None] = mapped_column(JSONB)


class Image(Base):
    __tablename__ = "images"
    __table_args__ = (CheckConstraint("kind IN ('report', 'repair_after')", name="ck_images_kind"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("reports.id"), index=True)
    pin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pins.id"), index=True)
    uploader_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    storage_name: Mapped[str] = mapped_column(String(40), unique=True)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    phash: Mapped[str] = mapped_column(String(16), index=True)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
