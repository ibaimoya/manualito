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


def test_database_url_rejects_blank_value(monkeypatch):
    """Una DATABASE_URL en blanco es un error de configuración, no una ausencia."""
    monkeypatch.setenv("DATABASE_URL", "   ")

    with pytest.raises(RuntimeError, match="DATABASE_URL no puede estar vacia"):
        get_database_url()


def test_build_from_parts_uses_plain_env_vars_without_secret_files(monkeypatch):
    """Sin Docker secrets, las credenciales se leen de POSTGRES_USER/PASSWORD."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_USER_FILE", raising=False)
    monkeypatch.delenv("POSTGRES_PASSWORD_FILE", raising=False)
    monkeypatch.setenv("DATABASE_DRIVER", "postgresql+psycopg")
    monkeypatch.setenv("POSTGRES_USER", "manualito")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss word")
    monkeypatch.setenv("POSTGRES_HOST", "database")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "manualito")

    database_url = make_url(get_database_url())

    assert database_url.username == "manualito"
    assert database_url.password == "p@ss word"
    assert database_url.host == "database"


def test_build_from_parts_requires_user_via_file_or_env(monkeypatch):
    """Si falta el usuario por fichero y por entorno, el error lo dice claro."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_USER_FILE", raising=False)
    monkeypatch.delenv("POSTGRES_USER", raising=False)
    monkeypatch.setenv("DATABASE_DRIVER", "postgresql+psycopg")

    with pytest.raises(RuntimeError, match="Se requiere POSTGRES_USER_FILE o POSTGRES_USER"):
        get_database_url()


def test_secret_file_must_point_to_an_existing_file(monkeypatch, tmp_path):
    """Un Docker secret mal montado falla al construir la URL, no en la 1ª query."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_DRIVER", "postgresql+psycopg")
    monkeypatch.setenv("POSTGRES_USER_FILE", str(tmp_path / "ausente.txt"))

    with pytest.raises(RuntimeError, match="POSTGRES_USER_FILE no apunta a un fichero valido"):
        get_database_url()


def test_secret_file_must_not_be_empty(monkeypatch, tmp_path):
    """Un secret vacío se rechaza en vez de generar credenciales vacías."""
    empty_secret = tmp_path / "postgres_user.txt"
    empty_secret.write_text("   \n", encoding="utf-8")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_DRIVER", "postgresql+psycopg")
    monkeypatch.setenv("POSTGRES_USER_FILE", str(empty_secret))

    with pytest.raises(RuntimeError, match="POSTGRES_USER_FILE no puede estar vacio"):
        get_database_url()


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
