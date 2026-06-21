import io
import os
import sys
from pathlib import Path

import pytest
from PIL import Image

# Añade los servicios al path para que los tests encuentren los módulos.
_root = Path(__file__).resolve().parents[2]


def _load_env_file(path: Path) -> None:
    """Carga variables KEY=VALUE simples sin pisar el entorno del proceso."""
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _load_backend_env() -> None:
    """Carga las variables usadas al importar los servicios backend."""
    config_dir = _root / "config"
    _load_env_file(_root / ".env")
    for env_path in (
        config_dir / "backend.env",
        config_dir / "ocr.env",
        config_dir / "celery.env",
        config_dir / "database.env",
    ):
        _load_env_file(env_path)
    os.environ.setdefault("REDIS_PASSWORD", "test-redis-password")


_load_backend_env()

# backend/ permite importar el paquete compartido `common` con el mismo
# nombre que usa el código de producción (from common.logging import ...).
sys.path.insert(0, str(_root / "backend"))


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
