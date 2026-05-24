import logging
import sys
from unittest.mock import Mock, patch

import pytest

import ocr.factory as factory
from ocr.factory import create_ocr_engine


def _fake_paddle(*, cuda_enabled: bool, gpu_count: int):
    paddle = Mock()
    paddle.is_compiled_with_cuda.return_value = cuda_enabled
    paddle.device.cuda.device_count.return_value = gpu_count
    return paddle


def test_create_ocr_engine_uses_tesseract_by_default(monkeypatch):
    fake_engine = Mock()
    tesseract_factory = Mock(return_value=fake_engine)
    monkeypatch.delenv("OCR_ENGINE", raising=False)
    monkeypatch.setattr(
        "ocr.factory.SUPPORTED_OCR_ENGINES",
        {"tesseract": tesseract_factory},
    )

    assert create_ocr_engine() is fake_engine
    tesseract_factory.assert_called_once_with()


def test_create_ocr_engine_reads_environment(monkeypatch):
    fake_engine = Mock()
    paddle_cpu_factory = Mock(return_value=fake_engine)
    monkeypatch.setenv("OCR_ENGINE", " paddle_cpu ")
    monkeypatch.setattr(
        "ocr.factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": paddle_cpu_factory},
    )

    assert create_ocr_engine() is fake_engine
    paddle_cpu_factory.assert_called_once_with()


def test_create_ocr_engine_selects_paddle_gpu(monkeypatch):
    fake_engine = Mock()
    paddle_gpu_factory = Mock(return_value=fake_engine)
    monkeypatch.setattr(
        "ocr.factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": Mock(), "paddle_gpu": paddle_gpu_factory},
    )

    assert create_ocr_engine("paddle_gpu") is fake_engine
    paddle_gpu_factory.assert_called_once_with()


def test_create_ocr_engine_blank_environment_uses_default(monkeypatch):
    fake_engine = Mock()
    tesseract_factory = Mock(return_value=fake_engine)
    monkeypatch.setenv("OCR_ENGINE", " ")
    monkeypatch.setattr(
        "ocr.factory.SUPPORTED_OCR_ENGINES",
        {"tesseract": tesseract_factory},
    )

    assert create_ocr_engine() is fake_engine
    tesseract_factory.assert_called_once_with()


def test_create_ocr_engine_rejects_unknown_engine(monkeypatch):
    monkeypatch.setattr("ocr.factory.SUPPORTED_OCR_ENGINES", {"tesseract": Mock()})

    with pytest.raises(ValueError, match="Motor OCR no soportado: 'unknown'"):
        create_ocr_engine("unknown")


def test_create_ocr_engine_logs_selected_engine(monkeypatch, caplog):
    fake_engine = Mock()
    paddle_cpu_factory = Mock(return_value=fake_engine)
    monkeypatch.setattr(
        "ocr.factory.SUPPORTED_OCR_ENGINES",
        {"paddle_cpu": paddle_cpu_factory},
    )

    with caplog.at_level(logging.INFO, logger="ocr.factory"):
        assert create_ocr_engine("paddle_cpu") is fake_engine

    assert "Motor OCR seleccionado: paddle_cpu" in caplog.text


def test_tesseract_factory_builds_engine():
    """La factory lazy real instancia el motor Tesseract sin ejecutar OCR real."""
    with patch("ocr.engines.tesseract.engine.pytesseract.get_tesseract_version"), patch(
        "ocr.engines.tesseract.engine.pytesseract.get_languages",
        return_value=["spa"],
    ):
        engine = factory._create_tesseract_engine()

    assert engine.name == "tesseract"


def test_paddle_cpu_factory_builds_cpu_engine():
    """La factory lazy real instancia el motor Paddle CPU sin cargar modelos reales."""
    with patch("ocr.engines.paddle.cpu.engine.PaddleOCR"):
        engine = factory._create_paddle_cpu_engine()

    assert engine.name == "paddle_cpu"


def test_paddle_gpu_factory_builds_gpu_engine(monkeypatch):
    """La factory lazy real instancia el motor Paddle GPU sin requerir CUDA real."""
    monkeypatch.setitem(
        sys.modules,
        "paddle",
        _fake_paddle(cuda_enabled=True, gpu_count=1),
    )

    with patch("ocr.engines.paddle.gpu.engine.PaddleOCR"):
        engine = factory._create_paddle_gpu_engine()

    assert engine.name == "paddle_gpu"
