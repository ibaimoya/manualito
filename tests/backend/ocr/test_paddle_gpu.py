import sys
from unittest.mock import Mock, patch

import pytest

from ocr.engines.paddle.gpu import PaddleGpuOcrEngine


def _fake_paddle(*, cuda_enabled: bool, gpu_count: int):
    paddle = Mock()
    paddle.is_compiled_with_cuda.return_value = cuda_enabled
    paddle.device.cuda.device_count.return_value = gpu_count
    return paddle


def test_paddle_gpu_engine_name():
    """El engine expone un nombre estable para logs, métricas y tests."""
    assert PaddleGpuOcrEngine.name == "paddle_gpu"


def test_paddle_gpu_rejects_paddle_without_cuda(monkeypatch):
    """Falla pronto si se intenta usar GPU con PaddlePaddle CPU."""
    monkeypatch.setitem(
        sys.modules,
        "paddle",
        _fake_paddle(cuda_enabled=False, gpu_count=0),
    )

    with pytest.raises(RuntimeError, match="soporte CUDA"):
        PaddleGpuOcrEngine()


def test_paddle_gpu_rejects_missing_cuda_device(monkeypatch):
    """Falla pronto si PaddlePaddle tiene CUDA pero Docker no ve ninguna GPU."""
    monkeypatch.setitem(
        sys.modules,
        "paddle",
        _fake_paddle(cuda_enabled=True, gpu_count=0),
    )

    with pytest.raises(RuntimeError, match="GPU CUDA"):
        PaddleGpuOcrEngine()


def test_paddle_gpu_initializes_paddleocr_with_gpu(monkeypatch):
    """Inicializa PaddleOCR apuntando explícitamente al dispositivo GPU."""
    monkeypatch.setitem(
        sys.modules,
        "paddle",
        _fake_paddle(cuda_enabled=True, gpu_count=1),
    )

    with patch("ocr.engines.paddle.gpu.engine.PaddleOCR") as paddleocr:
        PaddleGpuOcrEngine()

    paddleocr.assert_called_once_with(
        use_textline_orientation=True,
        lang="es",
        device="gpu",
    )


def test_paddle_gpu_engine_extract_text_results():
    """Transforma el output del OCR Paddle GPU en lista normalizada."""
    engine = object.__new__(PaddleGpuOcrEngine)
    engine._ocr = Mock()
    engine._ocr.predict.return_value = [
        {"rec_texts": ["Reglas"], "rec_scores": [0.98765]},
    ]

    result = engine.extract_text("fake/path.jpg")

    assert result == [{"text": "Reglas", "confidence": 0.9877}]
