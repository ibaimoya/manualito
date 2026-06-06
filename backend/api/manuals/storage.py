"""Storage local de imágenes de manual."""

from pathlib import Path
from uuid import UUID, uuid4

import anyio

from api import config
from api.manuals.validation import ValidatedManualImage, ValidatedManualPdf


async def save_manual_image(
    image: ValidatedManualImage,
    *,
    owner_user_id: UUID,
    page_number: int = 1,
) -> str:
    """Guarda el fichero físico y devuelve su storage_key relativo."""
    return await _save_manual_file(
        image.content,
        owner_user_id=owner_user_id,
        extension=image.extension,
        filename=f"page-{page_number}",
    )


async def save_manual_pdf(
    pdf: ValidatedManualPdf,
    *,
    owner_user_id: UUID,
) -> str:
    """Guarda el PDF original y devuelve su storage_key relativo."""
    return await _save_manual_file(
        pdf.content,
        owner_user_id=owner_user_id,
        extension=pdf.extension,
        filename="source",
    )


async def _save_manual_file(
    content: bytes,
    *,
    owner_user_id: UUID,
    extension: str,
    filename: str,
) -> str:
    """Guarda bytes de manual y devuelve su ruta interna."""
    storage_key = _storage_key(
        owner_user_id=owner_user_id,
        extension=extension,
        filename=filename,
    )
    path = _storage_path(storage_key)
    await anyio.to_thread.run_sync(_write_file, path, content)
    return storage_key


async def read_stored_file(storage_key: str) -> bytes:
    """Lee un fichero del storage local."""
    return await anyio.to_thread.run_sync(_read_stored_file, storage_key)


async def delete_stored_file(storage_key: str) -> bool:
    """Borra un fichero físico si todavía existe."""
    return await anyio.to_thread.run_sync(_delete_stored_file, storage_key)


def _write_file(path: Path, content: bytes) -> None:
    """Crea el directorio destino y escribe bytes fuera del event loop."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _read_stored_file(storage_key: str) -> bytes:
    """Lee bytes desde un storage_key ya persistido."""
    return _storage_path(storage_key).read_bytes()


def _delete_stored_file(storage_key: str) -> bool:
    """Borra un fichero físico si todavía existe."""
    path = _storage_path(storage_key)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return False
    return True


def _storage_key(*, owner_user_id: UUID, extension: str, filename: str) -> str:
    """Construye una ruta interna no derivada del nombre original."""
    return f"manuals/{owner_user_id}/{uuid4().hex}/{filename}{extension}"


def _storage_path(storage_key: str) -> Path:
    """Resuelve el storage_key dentro del directorio configurado."""
    root = Path(config.MANUAL_STORAGE_DIR)
    return root / storage_key
