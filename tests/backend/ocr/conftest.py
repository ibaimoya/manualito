import io
import sys
from unittest.mock import MagicMock

import pytest
from PIL import Image

# =====================================================================
# Aislamiento del modelo antes de cualquier importación del proyecto.
# PaddleOCR se instancia a nivel de módulo en extractor.py; sin
# este mock, pytest intentaría cargar el modelo real al importar main,
# lo que haría imposible ejecutar los tests unitarios en CI.
# =====================================================================
sys.modules.setdefault("paddleocr", MagicMock())

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)


@pytest.fixture
def valid_jpeg_bytes():
    """Bytes de una imagen JPEG mínima y válida (10x10 px)."""
    image = Image.new("RGB", (10, 10), color=(100, 150, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
def valid_png_bytes():
    """Bytes de una imagen PNG mínima y válida (10x10 px)."""
    image = Image.new("RGB", (10, 10), color=(100, 150, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
