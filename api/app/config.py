import os

DATABASE_URL = os.environ["DATABASE_URL"]
# SQLAlchemy would pick psycopg2 for a bare postgresql:// URL; we ship psycopg 3.
SQLALCHEMY_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TOKEN_MINUTES = 15
# Idle limit: each refresh moves the deadline, so a phone in regular use stays logged in.
REFRESH_TOKEN_DAYS = 14
# A refresh token replaced less than this long ago still works once, for a reply the phone
# never received on a bad connection. Later use counts as theft and ends the session.
REFRESH_GRACE_SECONDS = 60

OTP_MINUTES = 10
OTP_MAX_ATTEMPTS = 5

SMTP_HOST = os.environ.get("SMTP_HOST", "mailpit")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "1025"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "false").lower() == "true"
SMTP_FROM = os.environ.get("SMTP_FROM", "CivicPulse <no-reply@civicpulse.local>")

MEDIA_DIR = os.environ.get("MEDIA_DIR", "/data/media")
# Must differ from the dashboard's origin. A phone needs the computer's LAN address here.
MEDIA_BASE_URL = os.environ.get("MEDIA_BASE_URL", "http://localhost:8001").rstrip("/")
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_SIDE = 1600
DAILY_UPLOAD_CAP = 50
