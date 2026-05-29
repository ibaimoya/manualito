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
    "raw_username",
    [
        "",
        "   ",
        " nora",
        "nora ",
        "no ra",
        "nora@example",
        "nora!",
        "nora/name",
        "😀",
        "\u200b",
        "a" * (USERNAME_MAX_LENGTH + 1),
    ],
)
def test_normalize_username_rejects_invalid_equivalence_partitions(raw_username: str):
    """Rechaza usernames ambiguos, invisibles o fuera de formato."""
    with pytest.raises(UsernameValidationError):
        normalize_username(raw_username)


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
    with pytest.raises(UsernameValidationError):
        build_username_key(raw_username)


def test_build_username_key_rejects_key_longer_than_column():
    """La clave respeta el límite de la columna username_key (160)."""
    with pytest.raises(UsernameValidationError, match="demasiado larga"):
        build_username_key("a" * (USERNAME_KEY_MAX_LENGTH + 1))
