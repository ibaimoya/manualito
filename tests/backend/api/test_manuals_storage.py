from types import SimpleNamespace
from uuid import uuid4

import pytest

from api.manuals import storage as manual_storage
from api.manuals.validation import ValidatedManualImage


@pytest.mark.anyio
async def test_save_manual_image_writes_file_under_configured_storage(tmp_path, monkeypatch):
    """El storage usa una clave interna y escribe bytes bajo el directorio configurado."""
    owner_user_id = uuid4()
    monkeypatch.setattr(manual_storage.config, "MANUAL_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(manual_storage, "uuid4", lambda: SimpleNamespace(hex="abc123"))

    storage_key = await manual_storage.save_manual_image(
        ValidatedManualImage(
            content=b"image-bytes",
            mime_type="image/jpeg",
            extension=".jpg",
            width=10,
            height=10,
            sha256="a" * 64,
        ),
        owner_user_id=owner_user_id,
    )

    assert storage_key == f"manuals/{owner_user_id}/abc123/page-1.jpg"
    assert (tmp_path / storage_key).read_bytes() == b"image-bytes"


@pytest.mark.anyio
async def test_delete_stored_file_removes_file_and_ignores_missing(tmp_path, monkeypatch):
    """El borrado explícito limpia el fichero físico y es idempotente."""
    monkeypatch.setattr(manual_storage.config, "MANUAL_STORAGE_DIR", str(tmp_path))
    storage_key = "manuals/user/manual/page-1.jpg"
    path = tmp_path / storage_key
    path.parent.mkdir(parents=True)
    path.write_bytes(b"image-bytes")

    assert await manual_storage.delete_stored_file(storage_key) is True
    assert await manual_storage.delete_stored_file(storage_key) is True

    assert not path.exists()


@pytest.mark.anyio
async def test_delete_stored_file_reports_filesystem_errors(monkeypatch):
    """Si el filesystem falla, el caller puede registrar una limpieza pendiente."""

    class BrokenPath:
        def unlink(self, *, missing_ok: bool) -> None:
            """Simula un error del filesystem durante el borrado."""
            raise OSError("disk error")

    monkeypatch.setattr(manual_storage, "_storage_path", lambda _storage_key: BrokenPath())

    assert await manual_storage.delete_stored_file("manuals/user/manual/page-1.jpg") is False
