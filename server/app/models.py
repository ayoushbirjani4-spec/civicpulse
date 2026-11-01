import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (Boolean, DateTime, Float, ForeignKey, Integer,
                        String, Text, func)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def now():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="citizen")  # citizen | admin
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_name: Mapped[str | None] = mapped_column(String(100))
    refresh_token_hash: Mapped[str | None] = mapped_column(String(255))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailOtp(Base):
    __tablename__ = "email_otps"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    icon: Mapped[str | None] = mapped_column(String(50))


class Pin(Base):
    __tablename__ = "pins"
    id: Mapped[uuid.UUID] = pk()
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    location = mapped_column(Geography(geometry_type="POINT", srid=4326))
    status: Mapped[str] = mapped_column(String(20), default="open")
    supporter_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = now()


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[uuid.UUID] = pk()
    client_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    pin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pins.id"), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    location = mapped_column(Geography(geometry_type="POINT", srid=4326))
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    is_mocked: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="submitted")
    created_at: Mapped[datetime] = now()


class Image(Base):
    __tablename__ = "images"
    id: Mapped[uuid.UUID] = pk()
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(100))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    phash: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = now()