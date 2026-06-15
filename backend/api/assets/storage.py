"""Storage local de assets persistidos."""

from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

import anyio

from api import config


class AssetUpload(Protocol):
    """Contenido validado que puede guardarse como asset físico."""

    content: bytes
    extension: str


async def save_manual_image(
    image: AssetUpload,
    *,
    owner_user_id: UUID,
    page_number: int = 1,
) -> str:
    """Guarda una imagen de manual y devuelve su storage_key relativo."""
    return await _save_asset_file(
        image.content,
        owner_user_id=owner_user_id,
        extension=image.extension,
        filename=f"page-{page_number}",
        namespace="manuals",
    )


async def save_manual_pdf(
    pdf: AssetUpload,
    *,
    owner_user_id: UUID,
) -> str:
    """Guarda el PDF original y devuelve su storage_key relativo."""
    return await _save_asset_file(
        pdf.content,
        owner_user_id=owner_user_id,
        extension=pdf.extension,
        filename="source",
        namespace="manuals",
    )


async def _save_asset_file(
    content: bytes,
    *,
    owner_user_id: UUID,
    extension: str,
    filename: str,
    namespace: str,
) -> str:
    """Guarda bytes de asset y devuelve su ruta interna."""
    storage_key = _storage_key(
        owner_user_id=owner_user_id,
        extension=extension,
        filename=filename,
        namespace=namespace,
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


def _storage_key(
    *,
    owner_user_id: UUID,
    extension: str,
    filename: str,
    namespace: str,
) -> str:
    """Construye una ruta interna no derivada del nombre original."""
    return f"{namespace}/{owner_user_id}/{uuid4().hex}/{filename}{extension}"


def _storage_path(storage_key: str) -> Path:
    """Resuelve el storage_key dentro del directorio configurado."""
    root = Path(config.ASSET_STORAGE_DIR)
    return root / storage_key
