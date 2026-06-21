"""Tests de coherencia de la semilla inicial de juegos."""

import importlib.util
from pathlib import Path

import pytest

from api.games.service import build_game_name_key

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "backend"
    / "database"
    / "alembic"
    / "versions"
    / "0007_seed_bgg_game_catalog.py"
)


def _load_seed_module():
    """Carga una migración con nombre no importable como módulo normal."""
    spec = importlib.util.spec_from_file_location("seed_bgg_game_catalog", _MIGRATION_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("No se pudo cargar la migración de semilla BGG.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_bgg_seed_name_key_matches_runtime_normalization():
    """La migración y el runtime generan la misma clave de búsqueda."""
    seed_module = _load_seed_module()

    for _bgg_id, name, _year in seed_module.BGG_SEED_GAMES:
        assert seed_module._seed_game_name_key(name) == build_game_name_key(name)


@pytest.mark.parametrize(
    ("name", "expected_key"),
    [
        ("  CATÁN  ", "catán"),
        ("Cafe\u0301", "café"),
        ("Straße", "strasse"),
    ],
)
def test_bgg_seed_name_key_covers_unicode_edges(name: str, expected_key: str):
    """La paridad cubre trim, NFKC y casefold aunque la semilla cambie."""
    seed_module = _load_seed_module()

    assert seed_module._seed_game_name_key(name) == expected_key
    assert seed_module._seed_game_name_key(name) == build_game_name_key(name)
