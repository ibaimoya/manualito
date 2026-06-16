from types import SimpleNamespace
from uuid import uuid4

import pytest

from api.assets import storage as asset_storage
from api.manuals.validation import ValidatedManualImage, ValidatedManualPdf


@pytest.mark.anyio
async def test_save_manual_image_writes_file_under_configured_storage(tmp_path, monkeypatch):
    """El storage usa una clave interna y escribe bytes bajo el directorio configurado."""
    owner_user_id = uuid4()
    monkeypatch.setattr(asset_storage.config, "ASSET_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(asset_storage, "uuid4", lambda: SimpleNamespace(hex="abc123"))

    storage_key = await asset_storage.save_manual_image(
        ValidatedManualImage(
            content=b"image-bytes",
            mime_type="image/jpeg",
            extension=".jpg",
            width=10,
            height=10,
            sha256="a" * 64,
        ),
        owner_user_id=owner_user_id,
        page_number=3,
    )

    assert storage_key == f"manuals/{owner_user_id}/abc123/page-3.jpg"
    assert (tmp_path / storage_key).read_bytes() == b"image-bytes"


@pytest.mark.anyio
async def test_save_manual_pdf_writes_original_source_file(tmp_path, monkeypatch):
    """El PDF original se guarda como asset fuente, no como página renderizada."""
    owner_user_id = uuid4()
    monkeypatch.setattr(asset_storage.config, "ASSET_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(asset_storage, "uuid4", lambda: SimpleNamespace(hex="pdf123"))

    storage_key = await asset_storage.save_manual_pdf(
        ValidatedManualPdf(
            content=b"pdf-bytes",
            mime_type="application/pdf",
            extension=".pdf",
            page_count=2,
            sha256="b" * 64,
        ),
        owner_user_id=owner_user_id,
    )

    assert storage_key == f"manuals/{owner_user_id}/pdf123/source.pdf"
    assert (tmp_path / storage_key).read_bytes() == b"pdf-bytes"


@pytest.mark.anyio
async def test_read_stored_file_reads_bytes_from_configured_storage(tmp_path, monkeypatch):
    """El procesamiento en segundo plano puede reabrir assets sin depender de la petición."""
    monkeypatch.setattr(asset_storage.config, "ASSET_STORAGE_DIR", str(tmp_path))
    storage_key = "manuals/user/manual/page-1.jpg"
    path = tmp_path / storage_key
    path.parent.mkdir(parents=True)
    path.write_bytes(b"image-bytes")

    assert await asset_storage.read_stored_file(storage_key) == b"image-bytes"


@pytest.mark.anyio
async def test_delete_stored_file_removes_file_and_ignores_missing(tmp_path, monkeypatch):
    """El borrado explícito limpia el fichero físico y es idempotente."""
    monkeypatch.setattr(asset_storage.config, "ASSET_STORAGE_DIR", str(tmp_path))
    storage_key = "manuals/user/manual/page-1.jpg"
    path = tmp_path / storage_key
    path.parent.mkdir(parents=True)
    path.write_bytes(b"image-bytes")

    assert await asset_storage.delete_stored_file(storage_key) is True
    assert await asset_storage.delete_stored_file(storage_key) is True

    assert not path.exists()


@pytest.mark.anyio
async def test_delete_stored_file_reports_filesystem_errors(monkeypatch):
    """Si el filesystem falla, el caller puede registrar una limpieza pendiente."""

    class BrokenPath:
        def unlink(self, *, missing_ok: bool) -> None:
            """Simula un error del filesystem durante el borrado."""
            raise OSError("disk error")

    monkeypatch.setattr(asset_storage, "_storage_path", lambda _storage_key: BrokenPath())

    assert await asset_storage.delete_stored_file("manuals/user/manual/page-1.jpg") is False
