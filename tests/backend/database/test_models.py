import pytest
from sqlalchemy import CheckConstraint, String, Text
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.base import _NoneName

from database.base import Base
from database.models import import_all_models
from database.models.constants import EMAIL_MAX_LENGTH, SHA256_HEX_LENGTH


def test_model_registry_imports_phase_2_tables():
    """El registry carga las tablas de identidad y assets para Alembic."""
    import_all_models()

    assert {
        "users",
        "auth_sessions",
        "audit_log",
        "assets",
        "email_verification_tokens",
        "password_reset_tokens",
        "games",
        "manuals",
        "manual_pages",
        "manual_chunks",
        "conversations",
        "messages",
    }.issubset(Base.metadata.tables)


def test_users_schema_uses_partial_case_insensitive_email_index():
    """users evita UNIQUE simple y usa índice parcial sobre lower(email)."""
    import_all_models()
    users = Base.metadata.tables["users"]

    assert users.c.email_verified_at.nullable is True
    assert "avatar_asset_id" not in users.c
    assert "display_name" not in users.c
    assert not users.c.email.unique
    assert users.c.email.type.length == EMAIL_MAX_LENGTH
    assert users.c.username.nullable is False
    assert users.c.username.type.length == 20
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


@pytest.mark.parametrize(
    "table_name",
    ["email_verification_tokens", "password_reset_tokens"],
)
def test_account_token_schemas_store_only_hashes_and_cascade(table_name: str):
    """Los tokens de cuenta son opacos, expirables y caen al borrar usuario."""
    import_all_models()
    table = Base.metadata.tables[table_name]

    assert table.c.token_hash.type.length == SHA256_HEX_LENGTH
    assert table.c.expires_at.nullable is False
    assert table.c.consumed_at.nullable is True
    assert _single_fk(table.c.user_id).ondelete == "CASCADE"
    assert _index(table, f"uq_{table_name}_token_hash").unique is True
    assert _index(table, f"ix_{table_name}_user_id") is not None
    assert _index(table, f"ix_{table_name}_expires_at") is not None
    assert _check_names(table) == {f"ck_{table_name}_token_hash_length_valid"}


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
    kind_check = _check(assets, "ck_assets_kind_valid")
    assert "manual_source_pdf" in str(kind_check.sqltext)
    avatar_index = _index(assets, "uq_assets_owner_avatar_active")
    assert avatar_index.unique is True
    assert _compile(avatar_index.dialect_options["postgresql"]["where"]) == (
        "kind = 'avatar' AND deleted_at IS NULL"
    )


def test_games_schema_supports_bgg_catalog_and_typeahead():
    """games guarda catálogo local y typeahead sin unicidad global por nombre."""
    import_all_models()
    games = Base.metadata.tables["games"]

    assert games.c.name.nullable is False
    assert games.c.name_key.nullable is False
    assert games.c.name_key.unique is None
    assert games.c.bgg_id.unique is None
    assert isinstance(games.c.status.type, String)
    assert str(games.c.status.server_default.arg) == "'active'"
    assert _single_fk(games.c.created_by_user_id).ondelete == "SET NULL"
    assert _check_names(games) >= {
        "ck_games_name_not_empty",
        "ck_games_name_trimmed",
        "ck_games_name_key_not_empty",
        "ck_games_bgg_id_positive",
        "ck_games_year_published_positive",
        "ck_games_status_valid",
    }

    assert _index(games, "ix_games_name_key") is not None
    trgm_index = _index(games, "ix_games_name_trgm")
    assert trgm_index.dialect_options["postgresql"]["using"] == "gin"
    assert trgm_index.dialect_options["postgresql"]["ops"] == {
        "name": "gin_trgm_ops",
    }
    bgg_index = _index(games, "uq_games_bgg_id_active")
    assert bgg_index.unique is True
    assert _compile(bgg_index.dialect_options["postgresql"]["where"]) == (
        "bgg_id IS NOT NULL AND deleted_at IS NULL"
    )


def test_manuals_schema_tracks_owner_game_visibility_and_index_status():
    """manuals representa el estado transaccional entre Postgres y Chroma."""
    import_all_models()
    manuals = Base.metadata.tables["manuals"]

    assert _single_fk(manuals.c.owner_user_id).ondelete == "CASCADE"
    assert _single_fk(manuals.c.game_id).ondelete is None
    assert _single_fk(manuals.c.source_asset_id).ondelete == "SET NULL"
    assert str(manuals.c.source_type.server_default.arg) == "'images'"
    assert str(manuals.c.page_count.server_default.arg) == "1"
    assert str(manuals.c.status.server_default.arg) == "'indexing'"
    assert str(manuals.c.visibility.server_default.arg) == "'private'"
    assert str(manuals.c.chunks_indexed.server_default.arg) == "0"
    assert _check_names(manuals) >= {
        "ck_manuals_title_valid",
        "ck_manuals_source_type_valid",
        "ck_manuals_page_count_positive",
        "ck_manuals_status_valid",
        "ck_manuals_language_not_empty",
        "ck_manuals_visibility_valid",
        "ck_manuals_chunks_indexed_non_negative",
    }

    assert _index(manuals, "ix_manuals_owner_user_id") is not None
    assert _index(manuals, "ix_manuals_game_id") is not None
    assert _index(manuals, "ix_manuals_source_asset_id") is not None
    shared_index = _index(manuals, "ix_manuals_game_shared_active")
    assert _compile(shared_index.dialect_options["postgresql"]["where"]) == (
        "visibility = 'shared' AND status = 'active' AND deleted_at IS NULL"
    )


def test_manual_pages_schema_embeds_ocr_lines_as_jsonb_array():
    """manual_pages guarda OCR estructurado sin crear tabla de líneas."""
    import_all_models()
    pages = Base.metadata.tables["manual_pages"]

    assert _single_fk(pages.c.manual_id).ondelete == "CASCADE"
    assert _single_fk(pages.c.image_asset_id).ondelete == "SET NULL"
    assert isinstance(pages.c.ocr_lines.type, postgresql.JSONB)
    assert str(pages.c.ocr_lines.server_default.arg) == "'[]'::jsonb"
    assert str(pages.c.ocr_status.server_default.arg) == "'pending'"
    assert str(pages.c.text_source.server_default.arg) == "'none'"
    assert pages.c.text_quality.nullable is True
    assert pages.c.ocr_confidence_mean.nullable is True
    assert _check_names(pages) >= {
        "ck_manual_pages_page_number_positive",
        "ck_manual_pages_ocr_lines_array",
        "ck_manual_pages_ocr_status_valid",
        "ck_manual_pages_text_source_valid",
        "ck_manual_pages_text_quality_valid",
        "ck_manual_pages_ocr_confidence_mean_valid",
    }

    assert _index(pages, "ix_manual_pages_manual_id") is not None
    assert _index(pages, "ix_manual_pages_image_asset_id") is not None
    assert _index(pages, "uq_manual_pages_manual_page_number").unique is True


def test_manual_chunks_schema_is_chroma_source_of_truth():
    """manual_chunks usa su UUID como id de Chroma y guarda estado de indexado."""
    import_all_models()
    chunks = Base.metadata.tables["manual_chunks"]

    assert _single_fk(chunks.c.manual_id).ondelete == "CASCADE"
    assert _single_fk(chunks.c.page_id).ondelete == "SET NULL"
    assert chunks.c.content_hash.type.length == SHA256_HEX_LENGTH
    assert chunks.c.embedding_model.nullable is True
    assert chunks.c.indexed_at.nullable is True
    assert _check_names(chunks) >= {
        "ck_manual_chunks_chunk_index_non_negative",
        "ck_manual_chunks_text_not_empty",
        "ck_manual_chunks_source_page_positive",
        "ck_manual_chunks_content_hash_length_valid",
        "ck_manual_chunks_embedding_model_not_empty",
    }

    assert _index(chunks, "ix_manual_chunks_manual_id") is not None
    assert _index(chunks, "ix_manual_chunks_page_id") is not None
    assert _index(chunks, "ix_manual_chunks_content_hash") is not None
    assert _index(chunks, "uq_manual_chunks_manual_chunk_index").unique is True


def test_uuid_primary_keys_use_postgres_uuidv7_default():
    """Las PKs UUID se generan en Postgres con uuidv7()."""
    import_all_models()

    for table_name in (
        "users",
        "auth_sessions",
        "email_verification_tokens",
        "password_reset_tokens",
        "audit_log",
        "assets",
        "games",
        "manuals",
        "manual_pages",
        "manual_chunks",
        "conversations",
        "messages",
    ):
        id_column = Base.metadata.tables[table_name].c.id
        assert isinstance(id_column.type, postgresql.UUID)
        assert str(id_column.server_default.arg) == "uuidv7()"


def test_conversations_schema_tracks_user_game_and_title():
    """conversations guarda chats propios por juego con borrado lógico."""
    import_all_models()
    conversations = Base.metadata.tables["conversations"]

    assert _single_fk(conversations.c.user_id).ondelete == "CASCADE"
    assert _single_fk(conversations.c.game_id).ondelete == "RESTRICT"
    assert conversations.c.title.type.length == 80
    assert _check_names(conversations) == {"ck_conversations_title_valid"}
    assert _index(conversations, "ix_conversations_user_id") is not None
    assert _index(conversations, "ix_conversations_game_id") is not None
    active_index = _index(conversations, "ix_conversations_user_game_updated")
    assert _compile(active_index.dialect_options["postgresql"]["where"]) == (
        "deleted_at IS NULL"
    )


def test_messages_schema_cascades_from_conversation_and_limits_roles():
    """messages conserva solo roles de chat y cae al borrar la conversación."""
    import_all_models()
    messages = Base.metadata.tables["messages"]

    assert _single_fk(messages.c.conversation_id).ondelete == "CASCADE"
    assert isinstance(messages.c.content.type, Text)
    assert _check_names(messages) >= {
        "ck_messages_role_valid",
        "ck_messages_content_not_empty",
        "ck_messages_content_length_valid",
    }
    assert _index(messages, "ix_messages_conversation_created") is not None


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


def _check(table, name: str) -> CheckConstraint:
    """Devuelve una CHECK constraint por nombre."""
    return next(
        constraint
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint) and constraint.name == name
    )


def _single_fk(column):
    """Devuelve la única FK esperada para una columna."""
    foreign_keys = list(column.foreign_keys)
    assert len(foreign_keys) == 1
    return foreign_keys[0]


def _compile(expression) -> str:
    """Compila expresiones SQL con el dialecto Postgres."""
    return str(expression.compile(dialect=postgresql.dialect()))
