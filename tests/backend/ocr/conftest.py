import sys
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# =====================================================================
# Aislamiento del modelo antes de cualquier importación del proyecto.
# PaddleOCR se instancia a nivel de módulo en extractor.py; sin
# este mock, pytest intentaría cargar el modelo real al importar ocr_app,
# lo que haría imposible ejecutar los tests unitarios en CI.
# =====================================================================
sys.modules.setdefault("paddleocr", MagicMock())

from ocr_app import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)
