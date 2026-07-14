import os
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from redis import Redis
from sqlalchemy import create_engine, text

from api import config

pytestmark = pytest.mark.upload_integration

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


def test_database_schema_is_at_alembic_head() -> None:
    """La integración usa PostgreSQL migrado, no una sustitución en memoria."""
    database_url = os.environ["DATABASE_URL"]
    alembic_config = Config(_REPOSITORY_ROOT / "backend/database/alembic.ini")
    expected_revision = ScriptDirectory.from_config(alembic_config).get_current_head()
    engine = create_engine(database_url)

    try:
        with engine.connect() as connection:
            current_revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
    finally:
        engine.dispose()

    assert current_revision == expected_revision


def test_celery_redis_service_accepts_connections() -> None:
    """El broker real está disponible para que la API publique tareas."""
    client = Redis.from_url(
        config.CELERY_BROKER_URL,
        socket_connect_timeout=2,
        socket_timeout=2,
    )

    try:
        assert client.ping() is True
    finally:
        client.close()


def test_upload_spool_is_private_and_shares_the_asset_filesystem() -> None:
    """Los temporales pueden publicarse sin cruzar dispositivos."""
    asset_root = Path(os.environ["ASSET_STORAGE_DIR"])
    spool_dir = Path(os.environ["TMPDIR"])

    assert spool_dir.parent == asset_root
    if os.name == "posix":
        assert asset_root.stat().st_mode & 0o777 == 0o700
        assert spool_dir.stat().st_mode & 0o777 == 0o700
    assert asset_root.stat().st_dev == spool_dir.stat().st_dev
