from sqlalchemy import CheckConstraint, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.base import _NoneName

from database.base import Base
from database.models import import_all_models


def test_model_registry_imports_phase_2_tables():
    """El registry carga las tablas de identidad y assets para Alembic."""
    import_all_models()

    assert {"users", "auth_sessions", "audit_log", "assets"}.issubset(
        Base.metadata.tables
    )
    assert "email_verification_tokens" not in Base.metadata.tables
    assert "password_reset_tokens" not in Base.metadata.tables


def test_users_schema_uses_partial_case_insensitive_email_index():
    """users evita UNIQUE simple y usa índice parcial sobre lower(email)."""
    import_all_models()
    users = Base.metadata.tables["users"]

    assert "email_verified_at" not in users.c
    assert "avatar_asset_id" not in users.c
    assert "display_name" not in users.c
    assert not users.c.email.unique
    assert users.c.username.nullable is False
    assert users.c.username.type.length == 80
    assert users.c.username_key.nullable is False
    assert users.c.username_key.type.length == 160
    assert isinstance(users.c.role.type, String)
    assert isinstance(users.c.status.type, String)
    assert _check_names(users) >= {
        "ck_users_username_not_empty",
        "ck_users_username_trimmed",
        "ck_users_username_without_at",
        "ck_users_username_key_not_empty",
        "ck_users_role_valid",
        "ck_users_status_valid",
    }

    email_index = _index(users, "uq_users_email_active")
    assert email_index.unique is True
    assert "lower(users.email)" in _compile(email_index.expressions[0])
    assert _compile(email_index.dialect_options["postgresql"]["where"]) == (
        "deleted_at IS NULL"
    )

    username_index = _index(users, "uq_users_username_key_active")
    assert username_index.unique is True
    assert _compile(username_index.expressions[0]) == "users.username_key"
    assert _compile(username_index.dialect_options["postgresql"]["where"]) == (
        "deleted_at IS NULL"
    )


def test_auth_sessions_schema_supports_revocation_and_cleanup():
    """auth_sessions guarda sesiones opacas con índices de soporte."""
    import_all_models()
    sessions = Base.metadata.tables["auth_sessions"]

    assert sessions.c.token_hash.type.length == 64
    assert sessions.c.csrf_token_hash.type.length == 64
    assert _index(sessions, "uq_auth_sessions_token_hash").unique is True
    assert _index(sessions, "ix_auth_sessions_user_id") is not None
    assert _index(sessions, "ix_auth_sessions_expires_at") is not None
    assert _single_fk(sessions.c.user_id).ondelete == "CASCADE"


def test_audit_log_avoids_reserved_metadata_name():
    """audit_log usa event_data JSONB en vez del nombre reservado metadata."""
    import_all_models()
    audit_log = Base.metadata.tables["audit_log"]

    assert "metadata" not in audit_log.c
    assert isinstance(audit_log.c.event_data.type, postgresql.JSONB)
    assert str(audit_log.c.event_data.server_default.arg) == "'{}'::jsonb"
    assert isinstance(audit_log.c.ip_address.type, postgresql.INET)
    assert _check_names(audit_log) == {"ck_audit_log_event_type_not_empty"}
    assert _single_fk(audit_log.c.user_id).ondelete == "SET NULL"


def test_assets_schema_models_avatar_without_circular_fk():
    """assets representa avatares sin puntero circular desde users."""
    import_all_models()
    assets = Base.metadata.tables["assets"]

    assert _single_fk(assets.c.owner_user_id).ondelete == "CASCADE"
    assert _check_names(assets) >= {
        "ck_assets_kind_valid",
        "ck_assets_byte_size_positive",
        "ck_assets_sha256_length_valid",
        "ck_assets_width_positive",
        "ck_assets_height_positive",
    }
    avatar_index = _index(assets, "uq_assets_owner_avatar_active")
    assert avatar_index.unique is True
    assert _compile(avatar_index.dialect_options["postgresql"]["where"]) == (
        "kind = 'avatar' AND deleted_at IS NULL"
    )


def test_uuid_primary_keys_use_postgres_uuidv7_default():
    """Las PKs UUID se generan en Postgres con uuidv7()."""
    import_all_models()

    for table_name in ("users", "auth_sessions", "audit_log", "assets"):
        id_column = Base.metadata.tables[table_name].c.id
        assert isinstance(id_column.type, postgresql.UUID)
        assert str(id_column.server_default.arg) == "uuidv7()"


def _index(table, name: str):
    """Devuelve un índice por nombre y falla claro si falta."""
    return next(index for index in table.indexes if index.name == name)


def _check_names(table) -> set[str | _NoneName | None]:
    """Lista nombres explícitos de CHECK constraints."""
    return {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }


def _single_fk(column):
    """Devuelve la única FK esperada para una columna."""
    foreign_keys = list(column.foreign_keys)
    assert len(foreign_keys) == 1
    return foreign_keys[0]


def _compile(expression) -> str:
    """Compila expresiones SQL con el dialecto Postgres."""
    return str(expression.compile(dialect=postgresql.dialect()))
