import pytest

from api.auth.username import (
    USERNAME_KEY_MAX_LENGTH,
    USERNAME_MAX_LENGTH,
    UsernameValidationError,
    build_username_key,
    normalize_username,
)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — usernames válidos
#   Clase 1: ASCII simple.
#   Clase 2: Letras Unicode con tildes y letra eñe.
#   Clase 3: Unicode equivalente tras NFKC.
#   Clase 4: Alfabetos no latinos.
#   Clase 5: Símbolos seguros de username.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("raw_username", "expected_username", "expected_key"),
    [
        ("Nora", "Nora", "nora"),
        ("Álvaro", "Álvaro", "álvaro"),
        ("A\u0301lvaro", "Álvaro", "álvaro"),
        ("NIÑO", "NIÑO", "niño"),
        ("\uff2e\uff4f\uff52\uff41_\uff11", "Nora_1", "nora_1"),
        ("Straße", "Straße", "strasse"),
        ("usuario-01.perfil", "usuario-01.perfil", "usuario-01.perfil"),
        ("a" * USERNAME_MAX_LENGTH, "a" * USERNAME_MAX_LENGTH, "a" * USERNAME_MAX_LENGTH),
        ("ユーザー", "ユーザー", "ユーザー"),
    ],
)
def test_normalize_username_accepts_valid_equivalence_partitions(
    raw_username: str,
    expected_username: str,
    expected_key: str,
):
    """Acepta usernames visibles y genera claves comparables."""
    normalized = normalize_username(raw_username)

    assert normalized == expected_username
    assert build_username_key(normalized) == expected_key


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — usernames inválidos
#   Clase 1: Vacío o solo espacios.
#   Clase 2: Espacios al principio, al final o en medio.
#   Clase 3: Ambigüedad con email por contener @.
#   Clase 4: Símbolos no permitidos.
#   Clase 5: Caracteres invisibles/control.
#   Clase 6: Longitud superior al límite.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("raw_username", "code"),
    [
        ("", "username_empty"),
        ("   ", "username_empty"),
        (" nora", "username_surrounding_spaces"),
        ("nora ", "username_surrounding_spaces"),
        ("no ra", "username_contains_spaces"),
        ("nora@example", "username_contains_at"),
        ("nora!", "username_invalid_character"),
        ("nora/name", "username_invalid_character"),
        ("😀", "username_invalid_character"),
        ("\u200b", "username_invalid_character"),
        ("a" * (USERNAME_MAX_LENGTH + 1), "username_too_long"),
    ],
)
def test_normalize_username_rejects_invalid_equivalence_partitions(
    raw_username: str,
    code: str,
):
    """Rechaza usernames ambiguos, invisibles o fuera de formato."""
    with pytest.raises(UsernameValidationError) as exc_info:
        normalize_username(raw_username)

    error = exc_info.value.errors[0]
    assert error.field == "username"
    assert error.code == code
    assert error.message


@pytest.mark.parametrize(
    ("first_username", "second_username"),
    [
        ("Nora", "nora"),
        ("Álvaro", "A\u0301LVARO"),
        ("Straße", "STRASSE"),
        ("\uff2e\uff4f\uff52\uff41", "Nora"),
    ],
)
def test_build_username_key_collapses_equivalent_spellings(
    first_username: str,
    second_username: str,
):
    """La key detecta usernames equivalentes aunque se escriban distinto."""
    assert build_username_key(first_username) == build_username_key(second_username)


def test_build_username_key_trims_lookup_identifier():
    """El identificador de login puede limpiarse antes de buscar por username."""
    assert build_username_key("  Nora  ") == "nora"


# ---------------------------------------------------------------------------
# build_username_key — límites del identificador de búsqueda.
#   No revalida caracteres (asume input ya validado en el registro); solo
#   garantiza una clave no vacía y dentro del límite de la columna.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("raw_username", ["", "   ", "\t\n"])
def test_build_username_key_rejects_empty_lookup(raw_username: str):
    """No se puede construir una clave de búsqueda desde algo vacío."""
    with pytest.raises(UsernameValidationError) as exc_info:
        build_username_key(raw_username)

    assert exc_info.value.errors[0].code == "username_empty"


def test_build_username_key_rejects_key_longer_than_column():
    """La clave respeta el límite de la columna username_key (160)."""
    with pytest.raises(UsernameValidationError) as exc_info:
        build_username_key("a" * (USERNAME_KEY_MAX_LENGTH + 1))

    assert exc_info.value.errors[0].code == "username_key_too_long"
