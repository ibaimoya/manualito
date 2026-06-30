import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# =====================================================================
# Aislamiento del módulo PaddleOCR antes de importar el servicio.
# Los tests unitarios no deben depender de que PaddleOCR esté instalado ni
# cargar modelos reales; cada prueba controla explícitamente el engine.
# =====================================================================
sys.modules.setdefault("paddleocr", MagicMock())

_pytesseract = MagicMock()
_pytesseract.Output = SimpleNamespace(DICT="dict")
sys.modules.setdefault("pytesseract", _pytesseract)

from ocr.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)
