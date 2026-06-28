import os
from pathlib import Path
from urllib.parse import quote

DATABASE_URL_ENV = "DATABASE_URL"
DATABASE_DRIVER_ENV = "DATABASE_DRIVER"
EXPECTED_SCHEME = "postgresql+psycopg://"
POSTGRES_DB_ENV = "POSTGRES_DB"
POSTGRES_HOST_ENV = "POSTGRES_HOST"
POSTGRES_PASSWORD_ENV = "POSTGRES_PASSWORD"
POSTGRES_PASSWORD_FILE_ENV = "POSTGRES_PASSWORD_FILE"
POSTGRES_PORT_ENV = "POSTGRES_PORT"
POSTGRES_USER_ENV = "POSTGRES_USER"
POSTGRES_USER_FILE_ENV = "POSTGRES_USER_FILE"


def get_database_url() -> str:
    """Devuelve la URL de Postgres usada por SQLAlchemy y Alembic."""
    raw_database_url = os.environ.get(DATABASE_URL_ENV)
    if raw_database_url is not None:
        database_url = raw_database_url.strip()
        if not database_url:
            raise RuntimeError(f"{DATABASE_URL_ENV} no puede estar vacía.")
        _validate_database_url(database_url)
        return database_url

    database_url = build_database_url_from_parts()
    _validate_database_url(database_url)
    return database_url


def build_database_url_from_parts() -> str:
    """Construye la URL SQLAlchemy desde variables Postgres y password file."""
    driver = _get_required_env(DATABASE_DRIVER_ENV)
    user = _get_secret_or_env(POSTGRES_USER_FILE_ENV, POSTGRES_USER_ENV)
    password = _get_secret_or_env(POSTGRES_PASSWORD_FILE_ENV, POSTGRES_PASSWORD_ENV)
    host = _get_required_env(POSTGRES_HOST_ENV)
    port = _get_required_env(POSTGRES_PORT_ENV)
    database = _get_required_env(POSTGRES_DB_ENV)

    return (
        f"{driver}://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@{host}:{port}/{database}"
    )


def _get_secret_or_env(file_env_name: str, value_env_name: str) -> str:
    """Lee un valor desde Docker secret y usa env normal como alternativa."""
    secret_file = os.environ.get(file_env_name)
    if secret_file:
        path = Path(secret_file)
        if not path.is_file():
            raise RuntimeError(f"{file_env_name} no apunta a un fichero válido.")
        secret_value = path.read_text(encoding="utf-8").strip()
        if not secret_value:
            raise RuntimeError(f"{file_env_name} no puede estar vacío.")
        return secret_value

    env_value = os.environ.get(value_env_name)
    if env_value is not None:
        env_value = env_value.strip()
        if not env_value:
            raise RuntimeError(f"{value_env_name} no puede estar vacía.")
        return env_value

    raise RuntimeError(f"Se requiere {file_env_name} o {value_env_name}.")


def _get_required_env(name: str) -> str:
    """Lee una variable de entorno obligatoria y no vacía."""
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} no está definida.")
    return value.strip()


def _validate_database_url(database_url: str) -> None:
    """Garantiza que SQLAlchemy use Psycopg 3 como dialecto Postgres."""
    if not database_url.startswith(EXPECTED_SCHEME):
        raise RuntimeError(
            f"{DATABASE_URL_ENV} debe usar el dialecto '{EXPECTED_SCHEME}'."
        )
