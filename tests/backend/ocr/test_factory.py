import logging
from unittest.mock import Mock

import pytest
from factory import create_ocr_engine


def test_create_ocr_engine_uses_paddle_cpu_by_default(monkeypatch):
    fake_engine = Mock()
    paddle_cpu_factory = Mock(return_value=fake_engine)
    monkeypatch.delenv("OCR_ENGINE", raising=False)
    monkeypatch.setattr(
        "factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": paddle_cpu_factory},
    )

    assert create_ocr_engine() is fake_engine
    paddle_cpu_factory.assert_called_once_with()


def test_create_ocr_engine_reads_environment(monkeypatch):
    fake_engine = Mock()
    paddle_cpu_factory = Mock(return_value=fake_engine)
    monkeypatch.setenv("OCR_ENGINE", " paddle_cpu ")
    monkeypatch.setattr(
        "factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": paddle_cpu_factory},
    )

    assert create_ocr_engine() is fake_engine
    paddle_cpu_factory.assert_called_once_with()


def test_create_ocr_engine_blank_environment_uses_default(monkeypatch):
    fake_engine = Mock()
    paddle_cpu_factory = Mock(return_value=fake_engine)
    monkeypatch.setenv("OCR_ENGINE", " ")
    monkeypatch.setattr(
        "factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": paddle_cpu_factory},
    )

    assert create_ocr_engine() is fake_engine
    paddle_cpu_factory.assert_called_once_with()


def test_create_ocr_engine_rejects_unknown_engine(monkeypatch):
    monkeypatch.setattr("factory.SUPPORTED_OCR_ENGINES", {"paddle_cpu": Mock()})

    with pytest.raises(ValueError, match="Motor OCR no soportado: 'unknown'"):
        create_ocr_engine("unknown")


def test_create_ocr_engine_logs_selected_engine(monkeypatch, caplog):
    fake_engine = Mock()
    paddle_cpu_factory = Mock(return_value=fake_engine)
    monkeypatch.setattr(
        "factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": paddle_cpu_factory},
    )

    with caplog.at_level(logging.INFO, logger="factory"):
        assert create_ocr_engine("paddle_cpu") is fake_engine

    assert "Motor OCR seleccionado: paddle_cpu" in caplog.text
