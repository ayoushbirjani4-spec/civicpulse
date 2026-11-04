"""Create the admin account by hand. Admins can never be created through the API.

    docker compose exec api python -m app.create_admin admin@example.com "Admin Name"

The password comes from ADMIN_PASSWORD, or a prompt when that is not set.
"""

import argparse
import getpass
import os

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User
from app.schemas import RegisterIn
from app.security import hash_password, password_problem


def create_admin(email: str, display_name: str, password: str) -> str:
    """Create an admin, or promote the existing account (keeping its password)."""
    body = RegisterIn(email=email, password=password, display_name=display_name)
    if problem := password_problem(body.password, body.email):
        raise ValueError(f"Choose a stronger password ({problem}).")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == body.email))
        if user is None:
            db.add(
                User(
                    email=body.email,
                    password_hash=hash_password(body.password),
                    display_name=body.display_name,
                    role="admin",
                    email_verified=True,
                )
            )
            outcome = "created"
        else:
            user.role = "admin"
            user.email_verified = True
            outcome = "promoted"
        db.commit()
    return outcome


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create or promote an admin account")
    parser.add_argument("email")
    parser.add_argument("display_name")
    args = parser.parse_args()
    admin_password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password: ")
    print(f"Admin {args.email} {create_admin(args.email, args.display_name, admin_password)}")
