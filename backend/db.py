import os
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from .models import Base

BASE_DIR = Path(__file__).resolve().parent

# Small additive upgrades keep existing demo/MySQL databases usable without a
# migration dependency. New installations receive these columns from models.py.
ADDITIVE_COLUMNS = {
    "customers": {
        "license_expiry": "DATE NULL",
        "kyc_status": "VARCHAR(20) NOT NULL DEFAULT 'Not submitted'",
        "license_document": "VARCHAR(255) NULL",
        "kyc_rejection_reason": "VARCHAR(500) NOT NULL DEFAULT ''",
        "kyc_submitted_at": "DATETIME NULL",
        "kyc_reviewed_at": "DATETIME NULL",
        "kyc_reviewed_by": "INTEGER NULL",
        "kyc_reminder_sent_at": "DATETIME NULL",
    },
    "vehicles": {
        "driver_available": "BOOLEAN NOT NULL DEFAULT 0",
        "driver_daily_rate": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
    },
    "bookings": {
        "with_driver": "BOOLEAN NOT NULL DEFAULT 0",
        "driver_daily_rate": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
        "driver_amount": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
    },
}


def upgrade_existing_schema(engine):
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, columns in ADDITIVE_COLUMNS.items():
            if table not in tables:
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for column, definition in columns.items():
                if column not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def local_now():
    return datetime.now(ZoneInfo(os.environ.get("RENTAL_TIMEZONE", "Asia/Kolkata"))).replace(tzinfo=None, microsecond=0)


def create_database(url):
    options = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False, "timeout": 20}
    else:
        options["isolation_level"] = "READ COMMITTED"
    engine = create_engine(url, **options)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=20000")
            cursor.close()
    Base.metadata.create_all(engine)
    upgrade_existing_schema(engine)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def default_database_url():
    (BASE_DIR / "instance").mkdir(exist_ok=True)
    return "sqlite:///" + str(BASE_DIR / "instance" / "roam.db")
