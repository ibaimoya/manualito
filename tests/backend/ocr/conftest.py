import sys
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# =====================================================================
# Aislamiento del modulo PaddleOCR antes de importar el servicio.
# Los tests unitarios no deben depender de que PaddleOCR este instalado ni
# cargar modelos reales; cada prueba controla explicitamente el engine.
# =====================================================================
sys.modules.setdefault("paddleocr", MagicMock())

from ocr_app import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP sincrono reutilizable para toda la sesion de tests."""
    return TestClient(app)
