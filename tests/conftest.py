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

def _make_image_bytes(fmt: str) -> bytes:
    """Genera los bytes de una imagen mínima (10x10 px) en el formato dado."""
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(100, 150, 200)).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def valid_jpeg_bytes():
    """Bytes de una imagen JPEG mínima y válida (10x10 px)."""
    return _make_image_bytes("JPEG")


@pytest.fixture
def valid_png_bytes():
    """Bytes de una imagen PNG mínima y válida (10x10 px)."""
    return _make_image_bytes("PNG")
