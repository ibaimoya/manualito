import io
import sys
from pathlib import Path

import pytest
from PIL import Image

# Añade los servicios al path para que los tests encuentren los módulos.
_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_root / "backend" / "ocr"))
sys.path.insert(0, str(_root / "backend" / "api"))


# ---------------------------------------------------------------------------
# Fixtures compartidas por todos los servicios.
# ---------------------------------------------------------------------------

@pytest.fixture
def valid_jpeg_bytes():
    """Bytes de una imagen JPEG minima y válida (10x10 px)."""
    image = Image.new("RGB", (10, 10), color=(100, 150, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
def valid_png_bytes():
    """Bytes de una imagen PNG minima y válida (10x10 px)."""
    image = Image.new("RGB", (10, 10), color=(100, 150, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
