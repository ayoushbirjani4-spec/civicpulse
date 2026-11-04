import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import (
    OTP_MINUTES,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_STARTTLS,
    SMTP_USER,
)

logger = logging.getLogger(__name__)


def _send(email: str, subject: str, body: str) -> None:
    """Runs as a background task. A failure is logged; the user can request a new code."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = SMTP_FROM
    message["To"] = email
    message.set_content(body)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            if SMTP_STARTTLS:
                smtp.starttls(context=ssl.create_default_context())
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        logger.exception("could not send email")


def send_verification_code(email: str, code: str) -> None:
    _send(
        email,
        f"Your CivicPulse code is {code}",
        f"Your CivicPulse verification code is {code}.\n"
        f"It expires in {OTP_MINUTES} minutes. If you did not sign up, ignore this email.\n",
    )


def send_password_reset_code(email: str, code: str) -> None:
    _send(
        email,
        f"Your CivicPulse password reset code is {code}",
        f"Use {code} to choose a new CivicPulse password. It expires in {OTP_MINUTES} minutes.\n"
        "If you did not ask to reset your password, ignore this email; your password has not changed.\n",
    )
