"""Storage local de imágenes de manual."""

from pathlib import Path
from uuid import UUID, uuid4

import anyio

from api import config
from api.manuals.validation import ValidatedManualImage


async def save_manual_image(
    image: ValidatedManualImage,
    *,
    owner_user_id: UUID,
) -> str:
    """Guarda el fichero físico y devuelve su storage_key relativo."""
    storage_key = _storage_key(
        owner_user_id=owner_user_id,
        extension=image.extension,
    )
    path = _storage_path(storage_key)
    await anyio.to_thread.run_sync(_write_file, path, image.content)
    return storage_key


async def delete_stored_file(storage_key: str) -> bool:
    """Borra un fichero físico si todavía existe."""
    return await anyio.to_thread.run_sync(_delete_stored_file, storage_key)


def _write_file(path: Path, content: bytes) -> None:
    """Crea el directorio destino y escribe bytes fuera del event loop."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _delete_stored_file(storage_key: str) -> bool:
    """Borra un fichero físico si todavía existe."""
    path = _storage_path(storage_key)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return False
    return True


def _storage_key(*, owner_user_id: UUID, extension: str) -> str:
    """Construye una ruta interna no derivada del nombre original."""
    return f"manuals/{owner_user_id}/{uuid4().hex}/page-1{extension}"


def _storage_path(storage_key: str) -> Path:
    """Resuelve el storage_key dentro del directorio configurado."""
    root = Path(config.MANUAL_STORAGE_DIR)
    return root / storage_key
