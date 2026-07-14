"""Crea un lote interrumpido para las pruebas de reconciliación."""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path
from uuid import UUID

import anyio
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(_REPOSITORY_ROOT / "backend"))

from api import config  # noqa: E402
from api.assets.storage import LocalAssetStore  # noqa: E402
from database.config import get_database_url  # noqa: E402
from database.models import import_all_models  # noqa: E402
from database.models.asset import Asset  # noqa: E402

_CRASH_EXIT_CODE = 73

import_all_models()


async def _create_interrupted_batch(owner_user_id: UUID, referenced: bool) -> dict[str, str]:
    payload = b"postcommit asset" if referenced else b"precommit orphan"
    store = LocalAssetStore(config.ASSET_STORAGE_DIR)
    batch = await store.create_manual_batch(owner_user_id=owner_user_id)
    staged = await batch.stage(io.BytesIO(payload), max_bytes=len(payload))
    storage_key = await batch.promote(staged, name="page-1", extension=".jpg")
    if referenced:
        engine = create_engine(get_database_url())
        try:
            with Session(engine) as session:
                session.add(
                    Asset(
                        owner_user_id=owner_user_id,
                        kind="manual_page_image",
                        storage_key=storage_key,
                        mime_type="image/jpeg",
                        byte_size=len(payload),
                        sha256=staged.sha256,
                        width=1,
                        height=1,
                    )
                )
                session.commit()
        finally:
            engine.dispose()
    return {
        "batch_path": str(batch.path),
        "storage_key": storage_key,
    }


def _write_descriptor(path: Path, descriptor: dict[str, str]) -> None:
    encoded = json.dumps(descriptor).encode("utf-8")
    descriptor_fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(descriptor_fd, encoded)
        os.fsync(descriptor_fd)
    finally:
        os.close(descriptor_fd)


def main() -> None:
    owner_user_id = UUID(sys.argv[1])
    descriptor_path = Path(sys.argv[2])
    referenced = sys.argv[3] == "referenced"
    descriptor = anyio.run(_create_interrupted_batch, owner_user_id, referenced)
    _write_descriptor(descriptor_path, descriptor)
    os._exit(_CRASH_EXIT_CODE)


if __name__ == "__main__":
    main()
