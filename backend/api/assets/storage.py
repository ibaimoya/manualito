"""Storage local, transaccional y acotado en memoria para assets."""

import hashlib
import os
import re
import shutil
import stat
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Protocol, cast
from uuid import UUID, uuid4

import anyio

from api import config

COPY_CHUNK_SIZE = 1024 * 1024
_INTERNAL_NAME_RE = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?")
_EXTENSION_RE = re.compile(r"\.[a-z0-9]{1,10}")
_BATCH_ID_RE = re.compile(r"[0-9a-f]{32}")
_PENDING_MARKER = ".pending"


class AssetSizeExceededError(Exception):
    """El stream supera el límite de bytes permitido por el caller."""


@dataclass(frozen=True, slots=True)
class StagedAsset:
    """Fichero temporal ya copiado, medido y resumido criptográficamente."""

    path: Path
    byte_size: int
    sha256: str


class StagedFile(Protocol):
    """Descriptor estructural que puede promoverse dentro de un lote."""

    @property
    def path(self) -> Path: ...


@dataclass(frozen=True, slots=True)
class PendingAssetBatch:
    """Lote recuperable cuyo marcador superó el umbral indicado."""

    owner_user_id: UUID
    batch_id: str

    @property
    def storage_prefix(self) -> str:
        return f"manuals/{self.owner_user_id}/{self.batch_id}/"


class LocalAssetStore:
    """Raíz concreta de almacenamiento local de assets."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    async def create_manual_batch(self, *, owner_user_id: UUID) -> "AssetWriteBatch":
        """Crea un lote pendiente aislado para una subida de manual."""
        batch_id = uuid4().hex
        batch_dir = self.root / "manuals" / str(owner_user_id) / batch_id
        await anyio.to_thread.run_sync(_create_pending_batch, self.root, batch_dir)
        return AssetWriteBatch(
            store=self,
            owner_user_id=owner_user_id,
            batch_id=batch_id,
            path=batch_dir,
        )

    def resolve_file(self, storage_key: str) -> Path:
        """Resuelve una clave relativa sin traversal ni enlaces simbólicos."""
        return _resolve_storage_key(self.root, storage_key)

    async def list_pending_batches(self, *, older_than: datetime) -> list[PendingAssetBatch]:
        """Lista solo lotes generados y pendientes anteriores al umbral."""
        if older_than.tzinfo is None or older_than.utcoffset() is None:
            raise ValueError("older_than debe incluir zona horaria")
        return await anyio.to_thread.run_sync(
            _list_pending_batches,
            self.root,
            older_than.astimezone(UTC),
        )

    async def reconcile_batch(
        self,
        batch: PendingAssetBatch,
        *,
        referenced: bool,
    ) -> None:
        """Adopta un lote referenciado o elimina un huérfano confirmado."""
        if _BATCH_ID_RE.fullmatch(batch.batch_id) is None:
            raise ValueError("Descriptor de lote pendiente inválido")
        path = self.root / "manuals" / str(batch.owner_user_id) / batch.batch_id
        if referenced:
            await anyio.to_thread.run_sync(
                _adopt_batch,
                self.root,
                path,
                abandon_on_cancel=False,
            )
            return
        await anyio.to_thread.run_sync(
            _abort_batch,
            self.root,
            batch.owner_user_id,
            batch.batch_id,
            path,
            abandon_on_cancel=False,
        )


@dataclass(frozen=True, slots=True)
class AssetWriteBatch:
    """Lote de escritura que permanece pendiente hasta su adopción."""

    store: LocalAssetStore
    owner_user_id: UUID
    batch_id: str
    path: Path

    async def stage(self, source: BinaryIO, *, max_bytes: int) -> StagedAsset:
        """Copia un stream a un ``.part`` sin cargarlo completo en memoria."""
        if max_bytes < 0:
            raise ValueError("max_bytes no puede ser negativo")
        return await anyio.to_thread.run_sync(
            _stage_stream,
            self.store.root,
            self.path,
            source,
            max_bytes,
            abandon_on_cancel=False,
        )

    async def stage_generated(
        self,
        writer: Callable[[BinaryIO], None],
        *,
        max_bytes: int,
    ) -> StagedAsset:
        """Permite que un encoder escriba directamente al temporal acotado."""
        if max_bytes < 0:
            raise ValueError("max_bytes no puede ser negativo")
        return await anyio.to_thread.run_sync(
            _stage_generated,
            self.store.root,
            self.path,
            writer,
            max_bytes,
            abandon_on_cancel=False,
        )

    async def promote(self, staged: StagedFile, *, name: str, extension: str) -> str:
        """Publica un temporal con un nombre interno mediante reemplazo atómico."""
        if _INTERNAL_NAME_RE.fullmatch(name) is None:
            raise ValueError("Nombre interno de asset inválido")
        if _EXTENSION_RE.fullmatch(extension) is None:
            raise ValueError("Extensión de asset inválida")
        destination = self.path / f"{name}{extension}"
        await anyio.to_thread.run_sync(
            _promote_staged,
            self.store.root,
            self.path,
            staged.path,
            destination,
            abandon_on_cancel=False,
        )
        return f"manuals/{self.owner_user_id}/{self.batch_id}/{destination.name}"

    async def adopt(self) -> None:
        """Confirma el lote retirando de forma durable su marcador pendiente."""
        await anyio.to_thread.run_sync(
            _adopt_batch,
            self.store.root,
            self.path,
            abandon_on_cancel=False,
        )

    async def abort(self) -> None:
        """Elimina un lote que sigue pendiente; nunca borra uno adoptado."""
        await anyio.to_thread.run_sync(
            _abort_batch,
            self.store.root,
            self.owner_user_id,
            self.batch_id,
            self.path,
            abandon_on_cancel=False,
        )


def _create_pending_batch(root: Path, batch_dir: Path) -> None:
    """Crea el directorio del lote y su marcador de recuperación."""
    _ensure_directory(root, parents=True)
    _ensure_directory(root / "manuals")
    _ensure_directory(batch_dir.parent)
    batch_dir.mkdir(mode=0o700, exist_ok=False)
    try:
        marker_fd = os.open(
            batch_dir / _PENDING_MARKER,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        try:
            os.fsync(marker_fd)
        finally:
            os.close(marker_fd)
        _fsync_directory(batch_dir)
        _fsync_directory(batch_dir.parent)
    except BaseException:
        with suppress(OSError):
            (batch_dir / _PENDING_MARKER).unlink(missing_ok=True)
            batch_dir.rmdir()
        raise


def _stage_stream(
    root: Path,
    batch_dir: Path,
    source: BinaryIO,
    max_bytes: int,
) -> StagedAsset:
    """Implementación bloqueante de la copia incremental."""
    _assert_batch_directory(root, batch_dir, require_pending=True)
    with _durable_part_file(batch_dir) as (path, destination):
        limited = _LimitedHashWriter(destination, max_bytes)
        shutil.copyfileobj(source, cast(BinaryIO, limited), COPY_CHUNK_SIZE)
    return StagedAsset(
        path=path,
        byte_size=limited.byte_size,
        sha256=limited.digest.hexdigest(),
    )


class _LimitedHashWriter:
    """Writer de una sola pasada que limita y resume lo escrito."""

    def __init__(self, destination: BinaryIO, max_bytes: int) -> None:
        self._destination = destination
        self._max_bytes = max_bytes
        self.byte_size = 0
        self.digest = hashlib.sha256()

    def writable(self) -> bool:
        return True

    def write(self, data: bytes | bytearray) -> int:
        next_size = self.byte_size + len(data)
        if next_size > self._max_bytes:
            raise AssetSizeExceededError
        view = memoryview(data)
        for offset in range(0, len(view), COPY_CHUNK_SIZE):
            chunk = view[offset : offset + COPY_CHUNK_SIZE]
            written = self._destination.write(chunk)
            if written != len(chunk):
                raise OSError("Escritura parcial del asset generado")
            self.digest.update(chunk)
        self.byte_size = next_size
        return len(data)

    def flush(self) -> None:
        self._destination.flush()

    def tell(self) -> int:
        return self._destination.tell()


def _stage_generated(
    root: Path,
    batch_dir: Path,
    writer: Callable[[BinaryIO], None],
    max_bytes: int,
) -> StagedAsset:
    """Ejecuta un encoder contra un writer incremental y durable."""
    _assert_batch_directory(root, batch_dir, require_pending=True)
    with _durable_part_file(batch_dir) as (path, destination):
        limited = _LimitedHashWriter(destination, max_bytes)
        writer(cast(BinaryIO, limited))
    return StagedAsset(
        path=path,
        byte_size=limited.byte_size,
        sha256=limited.digest.hexdigest(),
    )


@contextmanager
def _durable_part_file(batch_dir: Path) -> Iterator[tuple[Path, BinaryIO]]:
    fd, raw_path = tempfile.mkstemp(prefix=".", suffix=".part", dir=batch_dir)
    path = Path(raw_path)
    try:
        destination = os.fdopen(fd, "wb")
        fd = -1
        with destination:
            yield path, destination
            destination.flush()
            os.fsync(destination.fileno())
    except BaseException:
        if fd >= 0:
            with suppress(OSError):
                os.close(fd)
        with suppress(OSError):
            path.unlink(missing_ok=True)
        raise


def _promote_staged(
    root: Path,
    batch_dir: Path,
    staged_path: Path,
    destination: Path,
) -> None:
    """Promueve un temporal que pertenece al lote y sincroniza el directorio."""
    resolved_batch = _assert_batch_directory(root, batch_dir, require_pending=True)
    if staged_path.parent.resolve(strict=True) != resolved_batch:
        raise ValueError("El temporal no pertenece al lote")
    if staged_path.suffix != ".part" or staged_path.is_symlink() or not staged_path.is_file():
        raise ValueError("Temporal de asset inválido")
    placeholder_fd: int | None = None
    placeholder_created = False
    try:
        placeholder_fd = os.open(
            destination,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        placeholder_created = True
        os.close(placeholder_fd)
        placeholder_fd = None
        os.replace(staged_path, destination)
        _fsync_directory(resolved_batch)
    except BaseException:
        if placeholder_fd is not None:
            os.close(placeholder_fd)
        if placeholder_created and destination.exists() and destination.stat().st_size == 0:
            destination.unlink(missing_ok=True)
        raise


def _adopt_batch(root: Path, batch_dir: Path) -> None:
    """Retira el marcador sin introducir otro punto de espera asíncrono."""
    resolved_batch = _assert_batch_directory(root, batch_dir, require_pending=False)
    marker = batch_dir / _PENDING_MARKER
    if marker.is_symlink():
        raise ValueError("Marcador pendiente inválido")
    marker.unlink(missing_ok=True)
    _fsync_directory(resolved_batch)


def _abort_batch(root: Path, owner_user_id: UUID, batch_id: str, batch_dir: Path) -> None:
    """Borra recursivamente solo un lote pendiente con identidad verificable."""
    if not batch_dir.exists():
        return
    expected = root / "manuals" / str(owner_user_id) / batch_id
    if _BATCH_ID_RE.fullmatch(batch_id) is None:
        raise ValueError("Identificador de lote inválido")
    if batch_dir.absolute() != expected.absolute():
        raise ValueError("Ruta de lote inválida")
    _assert_batch_directory(root, batch_dir, require_pending=True)
    marker = batch_dir / _PENDING_MARKER
    if marker.is_symlink() or not marker.is_file():
        raise ValueError("Solo se puede abortar un lote pendiente")
    shutil.rmtree(batch_dir)
    _fsync_directory(expected.parent)
    with suppress(OSError):
        expected.parent.rmdir()


def _ensure_directory(path: Path, *, parents: bool = False) -> None:
    """Crea un directorio privado y rechaza symlinks o nodos no-directorio."""
    try:
        path.mkdir(mode=0o700, parents=parents)
    except FileExistsError:
        if path.is_symlink() or not path.is_dir():
            raise NotADirectoryError(f"Directorio de storage inseguro: {path}") from None
    else:
        _fsync_directory(path.parent)


def _assert_batch_directory(
    root: Path,
    batch_dir: Path,
    *,
    require_pending: bool,
) -> Path:
    """Verifica contención, ausencia de symlinks y estado del lote."""
    resolved_root = root.resolve(strict=True)
    resolved_batch = batch_dir.resolve(strict=True)
    if (
        batch_dir.absolute() != resolved_batch
        or resolved_root not in resolved_batch.parents
        or not resolved_batch.is_dir()
    ):
        raise ValueError("Directorio de lote inseguro")
    marker = resolved_batch / _PENDING_MARKER
    if marker.is_symlink():
        raise ValueError("Marcador pendiente inválido")
    if require_pending and not marker.is_file():
        raise ValueError("El lote ya no está pendiente")
    return resolved_batch


def _canonical_owner_id(owner_entry: os.DirEntry[str]) -> UUID | None:
    """Devuelve el UUID de un directorio de propietario canónico y seguro."""
    try:
        if not owner_entry.is_dir(follow_symlinks=False):
            return None
        owner_user_id = UUID(owner_entry.name)
    except (FileNotFoundError, ValueError):
        return None
    return owner_user_id if str(owner_user_id) == owner_entry.name else None


def _pending_batch_id(batch_entry: os.DirEntry[str], cutoff: float) -> str | None:
    """Devuelve un lote canónico cuyo marcador regular sea suficientemente antiguo."""
    try:
        if _BATCH_ID_RE.fullmatch(batch_entry.name) is None or not batch_entry.is_dir(
            follow_symlinks=False
        ):
            return None
        marker_stat = (Path(batch_entry.path) / _PENDING_MARKER).stat(follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(marker_stat.st_mode) or marker_stat.st_mtime > cutoff:
        return None
    return batch_entry.name


def _list_pending_batches(root: Path, older_than: datetime) -> list[PendingAssetBatch]:
    """Escanea marcadores regulares bajo la jerarquía generada por el store."""
    manuals_dir = root / "manuals"
    if not manuals_dir.exists():
        return []
    if manuals_dir.is_symlink() or not manuals_dir.is_dir():
        raise ValueError("El namespace de manuales no es un directorio seguro")

    cutoff = older_than.timestamp()
    pending: list[PendingAssetBatch] = []
    with os.scandir(manuals_dir) as owners:
        for owner_entry in owners:
            owner_user_id = _canonical_owner_id(owner_entry)
            if owner_user_id is None:
                continue
            with os.scandir(owner_entry.path) as batches:
                for batch_entry in batches:
                    batch_id = _pending_batch_id(batch_entry, cutoff)
                    if batch_id is None:
                        continue
                    pending.append(
                        PendingAssetBatch(
                            owner_user_id=owner_user_id,
                            batch_id=batch_id,
                        )
                    )
    return sorted(pending, key=lambda item: item.storage_prefix)


def _resolve_storage_key(root: Path, storage_key: str) -> Path:
    """Valida sintaxis, contención y componentes existentes de una clave."""
    if not storage_key or "\\" in storage_key:
        raise ValueError("storage_key inválido")
    segments = storage_key.split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("storage_key inválido")
    candidate = root.joinpath(*segments)
    resolved_root = root.resolve()
    resolved_candidate = candidate.resolve(strict=False)
    if resolved_candidate != resolved_root and resolved_root not in resolved_candidate.parents:
        raise ValueError("storage_key fuera del directorio de assets")

    current = resolved_root
    for segment in segments:
        current /= segment
        if current.is_symlink():
            raise ValueError("storage_key contiene un enlace simbólico")
    if candidate.exists() and not candidate.is_file():
        raise ValueError("storage_key no identifica un fichero regular")
    return candidate


def _fsync_directory(directory: Path) -> None:
    """Persiste un rename en POSIX; Windows no permite abrir directorios así."""
    if os.name != "posix":
        return
    directory_fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def stored_file_path(storage_key: str) -> Path:
    """Resuelve un asset dentro del storage local sin permitir escapes."""
    return LocalAssetStore(config.ASSET_STORAGE_DIR).resolve_file(storage_key)


async def delete_stored_file(storage_key: str) -> bool:
    """Borra un fichero físico si todavía existe."""
    return await anyio.to_thread.run_sync(
        _delete_stored_file,
        Path(config.ASSET_STORAGE_DIR),
        storage_key,
    )


def _delete_stored_file(root: Path, storage_key: str) -> bool:
    """Borra un fichero físico si todavía existe."""
    path = LocalAssetStore(root).resolve_file(storage_key)
    try:
        existed = path.exists()
        path.unlink(missing_ok=True)
        if existed:
            _fsync_directory(path.parent)
    except OSError:
        return False
    return True
