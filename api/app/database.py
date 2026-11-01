import os
import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    """PostgreSQL database connection return karta hai."""
    conn = psycopg.connect(DATABASE_URL)
    return conn