import os

DATABASE_URL = os.environ["DATABASE_URL"]
# SQLAlchemy would pick psycopg2 for a bare postgresql:// URL; we ship psycopg 3.
SQLALCHEMY_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 14

OTP_MINUTES = 10
OTP_MAX_ATTEMPTS = 5

SMTP_HOST = os.environ.get("SMTP_HOST", "mailpit")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "1025"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "false").lower() == "true"
SMTP_FROM = os.environ.get("SMTP_FROM", "CivicPulse <no-reply@civicpulse.local>")
