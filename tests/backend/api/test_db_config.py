from secrets import token_urlsafe

import pytest
from sqlalchemy.engine import URL, make_url

from database.base import NAMING_CONVENTION
from database.config import get_database_url


def test_database_url_is_required(monkeypatch):
    """Sin URL explícita, la configuración por partes exige driver."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_DRIVER", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_DRIVER no esta definida"):
        get_database_url()


def test_database_url_requires_psycopg_dialect(monkeypatch):
    """Las URLs explícitas deben usar el dialecto Psycopg 3."""
    monkeypatch.setenv("DATABASE_URL", _test_database_url(drivername="postgresql"))

    with pytest.raises(RuntimeError, match="postgresql\\+psycopg://"):
        get_database_url()


def test_database_url_accepts_sqlalchemy_psycopg_dialect(monkeypatch):
    """La URL explícita válida se devuelve sin reconstruirla."""
    url = _test_database_url()
    monkeypatch.setenv("DATABASE_URL", url)

    assert get_database_url() == url


def test_database_url_can_be_built_from_secret_files(monkeypatch, tmp_path):
    """La URL se puede construir leyendo usuario y password desde ficheros."""
    secret_value = "value with spaces"
    user_file = tmp_path / "postgres_user.txt"
    password_file = tmp_path / "postgres_password.txt"
    user_file.write_text("manualito\n", encoding="utf-8")
    password_file.write_text(f"{secret_value}\n", encoding="utf-8")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_DRIVER", "postgresql+psycopg")
    monkeypatch.setenv("POSTGRES_DB", "manualito")
    monkeypatch.setenv("POSTGRES_HOST", "database")
    monkeypatch.setenv("POSTGRES_PASSWORD_FILE", str(password_file))
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_USER_FILE", str(user_file))

    database_url = make_url(get_database_url())
    assert database_url.drivername == "postgresql+psycopg"
    assert database_url.username == "manualito"
    assert database_url.password == secret_value
    assert database_url.host == "database"
    assert database_url.port == 5432
    assert database_url.database == "manualito"


def test_base_metadata_has_stable_naming_convention():
    """La metadata define nombres estables para constraints."""
    assert NAMING_CONVENTION["pk"] == "pk_%(table_name)s"
    assert NAMING_CONVENTION["fk"] == (
        "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
    )


def _test_database_url(drivername: str = "postgresql+psycopg") -> str:
    """Construye URLs de test sin credenciales hardcodeadas."""
    return URL.create(
        drivername=drivername,
        username="manualito",
        password=token_urlsafe(16),
        host="postgres",
        port=5432,
        database="manualito",
    ).render_as_string(hide_password=False)
