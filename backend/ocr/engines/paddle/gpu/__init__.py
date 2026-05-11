"""Motor OCR basado en PaddleOCR acelerado por GPU (CUDA)."""

from engines.paddle.gpu.engine import PaddleGpuOcrEngine

__all__ = ["PaddleGpuOcrEngine"]

