import pytest

import llm.config as config


def test_bool_env_accepts_common_true_false_values(monkeypatch):
    """La configuración booleana acepta valores habituales y recorta espacios."""
    monkeypatch.setenv("TEST_BOOL", " true ")
    assert config._bool_env("TEST_BOOL", default=False) is True

    monkeypatch.setenv("TEST_BOOL", "off")
    assert config._bool_env("TEST_BOOL", default=True) is False


def test_bool_env_uses_default_for_missing_or_blank_values(monkeypatch):
    """Los valores ausentes o vacíos caen en el default explícito."""
    monkeypatch.delenv("TEST_BOOL", raising=False)
    assert config._bool_env("TEST_BOOL", default=True) is True

    monkeypatch.setenv("TEST_BOOL", " ")
    assert config._bool_env("TEST_BOOL", default=False) is False


def test_bool_env_rejects_ambiguous_values(monkeypatch):
    """Un booleano mal escrito falla al arrancar en vez de cambiar el modo."""
    monkeypatch.setenv("TEST_BOOL", "tru")

    with pytest.raises(ValueError, match="TEST_BOOL debe ser un booleano válido"):
        config._bool_env("TEST_BOOL", default=False)


def test_int_env_accepts_integer_values(monkeypatch):
    monkeypatch.setenv("TEST_INT", " 4096 ")

    assert config._int_env("TEST_INT", default=8192, minimum=1024) == 4096


def test_int_env_uses_default_for_missing_or_blank_values(monkeypatch):
    monkeypatch.delenv("TEST_INT", raising=False)
    assert config._int_env("TEST_INT", default=8192, minimum=1024) == 8192

    monkeypatch.setenv("TEST_INT", " ")
    assert config._int_env("TEST_INT", default=4096, minimum=1024) == 4096


def test_int_env_rejects_invalid_or_too_small_values(monkeypatch):
    monkeypatch.setenv("TEST_INT", "fast")
    with pytest.raises(ValueError, match="TEST_INT debe ser un entero valido"):
        config._int_env("TEST_INT", default=8192, minimum=1024)

    monkeypatch.setenv("TEST_INT", "512")
    with pytest.raises(ValueError, match="TEST_INT debe ser mayor o igual que 1024"):
        config._int_env("TEST_INT", default=8192, minimum=1024)
