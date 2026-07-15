import os
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

from api.assets import storage as asset_storage


@pytest.mark.anyio
async def test_manual_batch_bootstraps_a_missing_local_storage_root(tmp_path):
    """El desarrollo local no exige preparar a mano la jerarquía de assets."""
    root = tmp_path / "runtime" / "assets"

    batch = await asset_storage.LocalAssetStore(root).create_manual_batch(owner_user_id=uuid4())

    assert (batch.path / ".pending").is_file()


@pytest.mark.anyio
async def test_manual_batch_stages_a_real_image_with_bounded_file_metadata(
    tmp_path,
    valid_jpeg_bytes,
):
    """El seam de storage persiste por streaming y devuelve metadatos, no bytes."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())

    staged = await batch.stage(BytesIO(valid_jpeg_bytes), max_bytes=30_000_000)

    assert staged.byte_size == len(valid_jpeg_bytes)
    assert staged.sha256 == sha256(valid_jpeg_bytes).hexdigest()
    assert staged.path.read_bytes() == valid_jpeg_bytes
    assert staged.path.suffix == ".part"
    if os.name == "posix":
        assert staged.path.stat().st_mode & 0o777 == 0o600
    assert "content" not in staged.__dataclass_fields__


@pytest.mark.anyio
async def test_staging_enforces_actual_size_and_removes_partial_file(tmp_path):
    """El contador durante la copia no confía en el tamaño anunciado por HTTP."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())
    source = BytesIO(b"123456")

    with pytest.raises(asset_storage.AssetSizeExceededError):
        await batch.stage(source, max_bytes=5)

    assert list(batch.path.glob("*.part")) == []
    assert (batch.path / ".pending").is_file()


@pytest.mark.anyio
async def test_manual_batch_promotes_staged_assets_without_using_original_names(
    tmp_path,
    valid_jpeg_bytes,
):
    """Publicar conserva el lote pendiente y usa solo nombres internos controlados."""
    owner_user_id = uuid4()
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=owner_user_id)
    staged = await batch.stage(BytesIO(valid_jpeg_bytes), max_bytes=30_000_000)

    storage_key = await batch.promote(staged, name="page-1", extension=".jpg")

    expected_key = f"manuals/{owner_user_id}/{batch.batch_id}/page-1.jpg"
    assert storage_key == expected_key
    assert store.resolve_file(storage_key).read_bytes() == valid_jpeg_bytes
    assert not staged.path.exists()
    assert (batch.path / ".pending").is_file()


@pytest.mark.anyio
async def test_promote_rejects_unsafe_names_and_a_file_from_another_batch(
    tmp_path,
    valid_jpeg_bytes,
):
    """Ni traversal nominal ni temporales ajenos pueden cruzar el aislamiento del lote."""
    store = asset_storage.LocalAssetStore(tmp_path)
    first = await store.create_manual_batch(owner_user_id=uuid4())
    second = await store.create_manual_batch(owner_user_id=uuid4())
    staged = await first.stage(BytesIO(valid_jpeg_bytes), max_bytes=30_000_000)

    with pytest.raises(ValueError):
        await first.promote(staged, name="../page-1", extension=".jpg")
    with pytest.raises(ValueError):
        await second.promote(staged, name="page-1", extension=".jpg")

    assert staged.path.is_file()


@pytest.mark.anyio
async def test_adopting_a_manual_batch_keeps_assets_and_removes_pending_marker(
    tmp_path,
    valid_jpeg_bytes,
):
    """Confirmar el commit lógico hace persistente el lote sin mover sus assets."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())
    staged = await batch.stage(BytesIO(valid_jpeg_bytes), max_bytes=30_000_000)
    storage_key = await batch.promote(staged, name="page-1", extension=".jpg")

    await batch.adopt()

    assert store.resolve_file(storage_key).is_file()
    assert not (batch.path / ".pending").exists()
    source = BytesIO(valid_jpeg_bytes)
    with pytest.raises(ValueError):
        await batch.stage(source, max_bytes=30_000_000)


@pytest.mark.anyio
async def test_aborting_a_manual_batch_removes_staged_and_promoted_files(
    tmp_path,
    valid_jpeg_bytes,
):
    """Un fallo precommit elimina el lote completo sin dejar archivos parciales."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())
    first = await batch.stage(BytesIO(valid_jpeg_bytes), max_bytes=30_000_000)
    await batch.promote(first, name="page-1", extension=".jpg")
    await batch.stage(BytesIO(valid_jpeg_bytes), max_bytes=30_000_000)

    await batch.abort()
    await batch.abort()

    assert not batch.path.exists()


@pytest.mark.anyio
async def test_manual_batch_stages_generated_pillow_output_without_bytes_buffer(tmp_path):
    """Los renders pueden escribir directamente al temporal acotado del lote."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())
    image = Image.new("RGB", (12, 8), color=(30, 60, 90))

    staged = await batch.stage_generated(
        lambda destination: image.save(destination, format="JPEG"),
        max_bytes=30_000_000,
    )

    with Image.open(staged.path) as persisted:
        persisted.verify()
    assert staged.byte_size == staged.path.stat().st_size
    assert staged.sha256 == sha256(staged.path.read_bytes()).hexdigest()


@pytest.mark.anyio
async def test_generated_writer_failure_removes_partial_file(tmp_path):
    """Un encoder que falla no deja un `.part` para el siguiente intento."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())

    def broken_writer(destination):
        destination.write(b"partial")
        raise OSError("encoder failed")

    with pytest.raises(OSError, match="encoder failed"):
        await batch.stage_generated(broken_writer, max_bytes=30_000_000)

    assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
async def test_reconciliation_removes_only_old_unreferenced_pending_batches(tmp_path):
    """El reconciliador expone lotes vencidos y elimina el huérfano completo."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())
    marker = batch.path / ".pending"
    old = datetime.now(UTC) - timedelta(days=2)
    os.utime(marker, (old.timestamp(), old.timestamp()))

    pending = await store.list_pending_batches(older_than=datetime.now(UTC) - timedelta(days=1))

    assert [item.storage_prefix for item in pending] == [
        f"manuals/{batch.owner_user_id}/{batch.batch_id}/"
    ]
    await store.reconcile_batch(pending[0], referenced=False)
    assert not batch.path.exists()


@pytest.mark.anyio
async def test_reconciliation_adopts_a_referenced_pending_batch(tmp_path):
    """Un commit confirmado tras un crash conserva el lote y retira su marcador."""
    store = asset_storage.LocalAssetStore(tmp_path)
    batch = await store.create_manual_batch(owner_user_id=uuid4())
    marker = batch.path / ".pending"
    old = datetime.now(UTC) - timedelta(days=2)
    os.utime(marker, (old.timestamp(), old.timestamp()))
    pending = await store.list_pending_batches(older_than=datetime.now(UTC))

    await store.reconcile_batch(pending[0], referenced=True)

    assert batch.path.is_dir()
    assert not marker.exists()


@pytest.mark.anyio
async def test_pending_scan_ignores_fresh_and_legacy_directories(tmp_path):
    """La recuperación nunca amplía su alcance a rutas no generadas por el store."""
    store = asset_storage.LocalAssetStore(tmp_path)
    await store.create_manual_batch(owner_user_id=uuid4())
    legacy = tmp_path / "manuals" / "legacy-user" / "legacy-batch"
    legacy.mkdir(parents=True)
    (legacy / ".pending").touch()

    pending = await store.list_pending_batches(older_than=datetime.now(UTC) - timedelta(days=1))

    assert pending == []
    assert legacy.is_dir()


@pytest.mark.parametrize(
    "storage_key",
    ["../secret.jpg", "/absolute.jpg", "manuals\\escape.jpg", "manuals//asset.jpg"],
)
def test_resolve_file_rejects_non_canonical_or_escaping_keys(tmp_path, storage_key):
    """Las claves siempre son POSIX relativas, canónicas y contenidas."""
    store = asset_storage.LocalAssetStore(tmp_path)

    with pytest.raises(ValueError):
        store.resolve_file(storage_key)


def test_resolve_file_rejects_symbolic_link_components(tmp_path):
    """Un symlink interno no puede redirigir una lectura fuera de la raíz."""
    outside = tmp_path.parent / f"outside-{uuid4().hex}"
    outside.mkdir()
    link = tmp_path / "manuals"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("La plataforma no permite crear symlinks sin privilegios")
    try:
        store = asset_storage.LocalAssetStore(tmp_path)
        with pytest.raises(ValueError):
            store.resolve_file("manuals/secret.jpg")
    finally:
        link.unlink(missing_ok=True)
        outside.rmdir()


@pytest.mark.anyio
async def test_delete_stored_file_is_idempotent_on_a_safe_key(tmp_path, monkeypatch):
    """La API de borrado conserva compatibilidad sin reintroducir lecturas completas."""
    monkeypatch.setattr(asset_storage.config, "ASSET_STORAGE_DIR", str(tmp_path))
    storage_key = "manuals/user/batch/page-1.jpg"
    path = tmp_path / Path(*storage_key.split("/"))
    path.parent.mkdir(parents=True)
    path.write_bytes(b"image")

    assert await asset_storage.delete_stored_file(storage_key) is True
    assert await asset_storage.delete_stored_file(storage_key) is True
    assert not path.exists()
