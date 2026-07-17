from __future__ import annotations

import hashlib
import io
import json
import os
import stat
import subprocess
import sys
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import Engine, func, select, text
from sqlalchemy.orm import Session

from api import config
from api.assets.storage import LocalAssetStore
from api.manuals import service as manuals_service
from api.manuals.dto import ValidatedManualImage
from api.manuals.exceptions import ManualContextNotFoundError
from api.manuals.repository import asset_storage_prefix_is_referenced, attach_page_image_asset
from api.worker.tasks import maintenance as maintenance_tasks
from database.models.asset import Asset
from database.models.manual import Manual, ManualPage
from database.session import get_sessionmaker

pytestmark = pytest.mark.upload_integration

_CRASH_WRITER = Path(__file__).with_name("_crash_upload_process.py")
_CRASH_EXIT_CODE = 73


def test_committed_upload_survives_optional_auto_follow_rollback(
    upload_client: TestClient,
    upload_world: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
) -> None:
    """Un fallo del auto-follow no invalida la respuesta del manual ya confirmado."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    trigger_suffix = uuid4().hex
    function_name = f"fail_upload_follow_{trigger_suffix}"
    trigger_name = f"fail_upload_follow_{trigger_suffix}"

    with upload_db_engine.begin() as connection:
        connection.execute(
            text(
                f"""
                CREATE FUNCTION {function_name}() RETURNS trigger AS $$
                BEGIN
                    RAISE EXCEPTION 'forced auto-follow failure';
                END;
                $$ LANGUAGE plpgsql
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TRIGGER {trigger_name}
                BEFORE INSERT ON game_follows
                FOR EACH ROW EXECUTE FUNCTION {function_name}()
                """
            )
        )

    try:
        response = upload_client.post(
            "/api/manuals",
            data={"game_id": str(upload_world.game_ids[0])},
            files={"images": ("manual.jpg", valid_jpeg_bytes, "image/jpeg")},
            headers=auth.headers,
        )
    finally:
        with upload_db_engine.begin() as connection:
            connection.execute(text(f"DROP TRIGGER {trigger_name} ON game_follows"))
            connection.execute(text(f"DROP FUNCTION {function_name}()"))

    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])
    with Session(upload_db_engine) as session:
        assert session.get(Manual, manual_id) is not None
    assert captured_manual_dispatches == [str(manual_id)]


def test_worker_marks_missing_image_failed_after_real_rollback(
    upload_client: TestClient,
    upload_world: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    valid_jpeg_bytes: bytes,
) -> None:
    """El manejo de fallo no toca un ORM expirado después del rollback."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    response = upload_client.post(
        "/api/manuals",
        data={"game_id": str(upload_world.game_ids[0])},
        files={"images": ("manual.jpg", valid_jpeg_bytes, "image/jpeg")},
        headers=auth.headers,
    )
    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])

    with Session(upload_db_engine) as session:
        page = session.scalar(select(ManualPage).where(ManualPage.manual_id == manual_id))
        assert page is not None
        assert page.image_asset_id is not None
        asset = session.get(Asset, page.image_asset_id)
        assert asset is not None
        page_id = page.id
        LocalAssetStore(config.ASSET_STORAGE_DIR).resolve_file(asset.storage_key).unlink()

    portal = upload_client.portal
    assert portal is not None
    portal.call(manuals_service.process_manual_page, manual_id, page_id)

    with Session(upload_db_engine) as session:
        failed_page = session.get(ManualPage, page_id)
        assert failed_page is not None
        assert failed_page.ocr_status == "failed"


def test_later_invalid_image_aborts_the_entire_upload_batch(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
) -> None:
    """Un segundo fichero truncado revierte DB y elimina todo el primer asset."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)

    response = upload_client.post(
        "/api/manuals",
        data={"game_id": str(upload_world.game_ids[0])},
        files=[
            ("images", ("first-valid.jpg", valid_jpeg_bytes, "image/jpeg")),
            ("images", ("second-truncated.jpg", valid_jpeg_bytes[:-16], "image/jpeg")),
        ],
        headers=auth.headers,
    )

    assert response.status_code == 415, response.text
    assert response.json()["errors"][0]["code"] == "invalid_image"
    _assert_owner_has_no_upload_state(
        upload_db_engine,
        upload_runtime.asset_root,
        owner_user_id=identity.user_id,
    )
    assert captured_manual_dispatches == []


@pytest.mark.parametrize(
    ("file_count", "expected_status", "expected_code"),
    [
        (31, 413, "manual_too_many_pages"),
        (32, 400, "http_error"),
    ],
    ids=["31-reaches-domain", "32-rejected-by-parser"],
)
def test_upload_file_part_parser_boundary(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
    file_count: int,
    expected_status: int,
    expected_code: str,
) -> None:
    """El parser admite 31 partes; el dominio aplica entonces sus 30 páginas."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)

    response = upload_client.post(
        "/api/manuals",
        data={"game_id": str(upload_world.game_ids[0])},
        files=[
            ("images", (f"page-{index}.jpg", valid_jpeg_bytes, "image/jpeg"))
            for index in range(file_count)
        ],
        headers=auth.headers,
    )

    assert response.status_code == expected_status, response.text
    assert response.json()["errors"][0]["code"] == expected_code
    _assert_owner_has_no_upload_state(
        upload_db_engine,
        upload_runtime.asset_root,
        owner_user_id=identity.user_id,
    )
    assert captured_manual_dispatches == []


@pytest.mark.parametrize(
    ("field_count", "expected_status", "expected_code"),
    [(4, 202, None), (5, 400, "http_error")],
    ids=["four-fields-accepted", "fifth-field-rejected"],
)
def test_upload_form_field_count_parser_boundary(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
    field_count: int,
    expected_status: int,
    expected_code: str | None,
) -> None:
    """Las cuatro partes de formulario del contrato caben; una quinta no."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    form = {
        "game_id": str(upload_world.game_ids[0]),
        "title": "Parser field boundary",
        "visibility": "private",
        "language": "es",
    }
    if field_count == 5:
        form["unexpected"] = "fifth-field"

    response = upload_client.post(
        "/api/manuals",
        data=form,
        files={"images": ("page.jpg", valid_jpeg_bytes, "image/jpeg")},
        headers=auth.headers,
    )

    assert response.status_code == expected_status, response.text
    if expected_code is None:
        assert captured_manual_dispatches == [response.json()["manual_id"]]
        assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 1
        assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    else:
        assert response.json()["errors"][0]["code"] == expected_code
        _assert_owner_has_no_upload_state(
            upload_db_engine,
            upload_runtime.asset_root,
            owner_user_id=identity.user_id,
        )
        assert captured_manual_dispatches == []


@pytest.mark.parametrize(
    ("field_size", "expected_status", "expected_code"),
    [(1024 * 1024, 202, None), (1024 * 1024 + 1, 400, "http_error")],
    ids=["one-mibibyte-accepted", "one-mibibyte-plus-one-rejected"],
)
def test_upload_form_part_size_parser_boundary(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
    field_size: int,
    expected_status: int,
    expected_code: str | None,
) -> None:
    """Una parte de campo acepta un MiB y corta el byte siguiente."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)

    response = upload_client.post(
        "/api/manuals",
        data={
            "game_id": str(upload_world.game_ids[0]),
            "parser_probe": "x" * field_size,
        },
        files={"images": ("page.jpg", valid_jpeg_bytes, "image/jpeg")},
        headers=auth.headers,
    )

    assert response.status_code == expected_status, response.text
    if expected_code is None:
        assert captured_manual_dispatches == [response.json()["manual_id"]]
        assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 1
        assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    else:
        assert response.json()["errors"][0]["code"] == expected_code
        _assert_owner_has_no_upload_state(
            upload_db_engine,
            upload_runtime.asset_root,
            owner_user_id=identity.user_id,
        )
        assert captured_manual_dispatches == []


def test_declared_oversized_upload_is_rejected_before_parsing(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
) -> None:
    """Content-Length abusivo se corta sin abrir dominio ni almacenamiento."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)

    response = upload_client.post(
        "/api/manuals",
        content=b"--upload--\r\n",
        headers={
            **auth.headers,
            "Content-Type": "multipart/form-data; boundary=upload",
            "Content-Length": "100000000",
        },
    )

    assert response.status_code == 413, response.text
    assert response.json()["errors"][0]["code"] == "manual_request_too_large"
    _assert_owner_has_no_upload_state(
        upload_db_engine,
        upload_runtime.asset_root,
        owner_user_id=identity.user_id,
    )
    assert captured_manual_dispatches == []


@pytest.mark.parametrize("source_case", ["mixed", "missing"])
def test_upload_requires_exactly_one_source_kind(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
    source_case: str,
) -> None:
    """La API rechaza tanto mezclar PDF/imágenes como omitir ambos."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    request_kwargs: dict[str, Any] = {
        "data": {"game_id": str(upload_world.game_ids[0])},
        "headers": auth.headers,
    }
    if source_case == "mixed":
        request_kwargs["files"] = [
            ("images", ("page.jpg", valid_jpeg_bytes, "image/jpeg")),
            ("pdf", ("manual.pdf", b"%PDF-1.7", "application/pdf")),
        ]

    response = upload_client.post("/api/manuals", **request_kwargs)

    assert response.status_code == 422, response.text
    assert response.json()["errors"][0]["code"] == "manual_upload_selection_invalid"
    _assert_owner_has_no_upload_state(
        upload_db_engine,
        upload_runtime.asset_root,
        owner_user_id=identity.user_id,
    )
    assert captured_manual_dispatches == []


def test_multi_image_upload_preserves_public_page_order(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
) -> None:
    """El orden multipart se conserva como páginas 1..N y nombres internos."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    widths = [11, 13, 17]

    response = upload_client.post(
        "/api/manuals",
        data={"game_id": str(upload_world.game_ids[0])},
        files=[
            (
                "images",
                (
                    f"customer-name-{index}.jpg",
                    _jpeg_bytes(width=width, height=7, color=(index * 40, 20, 100)),
                    "image/jpeg",
                ),
            )
            for index, width in enumerate(widths, start=1)
        ],
        headers=auth.headers,
    )

    assert response.status_code == 202, response.text
    manual_id = response.json()["manual_id"]
    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    assert [page["page_number"] for page in detail.json()["pages"]] == [1, 2, 3]
    assert [page["image_width"] for page in detail.json()["pages"]] == widths
    published = _published_files(upload_runtime.asset_root, (identity.user_id,))
    assert [path.name for path in published] == ["page-1.jpg", "page-2.jpg", "page-3.jpg"]
    assert all("customer-name" not in path.as_posix() for path in published)
    assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    assert captured_manual_dispatches == [manual_id]


def test_image_upload_is_transactional_queryable_and_scoped(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
) -> None:
    """La API completa aplica auth/CSRF, deduplica y publica solo tras el commit."""
    first_user, second_user = upload_world.users
    first_game, second_game = upload_world.game_ids
    first_auth = upload_authenticator(upload_client, first_user, upload_world.password)

    assert config.AUTH_COOKIE_SECURE is True
    assert config.AUTH_SESSION_COOKIE_NAME.startswith("__Host-")
    assert config.AUTH_CSRF_COOKIE_NAME.startswith("__Host-")

    rejected = _post_image(
        upload_client,
        game_id=first_game,
        image=valid_jpeg_bytes,
        headers={},
    )
    assert rejected.status_code == 403
    assert rejected.json()["errors"][0]["code"] == "invalid_csrf_token"
    assert _published_files(upload_runtime.asset_root, (first_user.user_id,)) == []

    accepted = _post_image(
        upload_client,
        game_id=first_game,
        image=valid_jpeg_bytes,
        headers=first_auth.headers,
    )
    assert accepted.status_code == 202, accepted.text
    manual_id = UUID(accepted.json()["manual_id"])
    assert accepted.json() == {
        "manual_id": str(manual_id),
        "game_id": str(first_game),
        "status": "indexing",
        "visibility": "private",
        "source_type": "images",
        "page_count": 1,
    }

    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["id"] == str(manual_id)
    assert detail.json()["pages"] == [
        {
            "page_number": 1,
            "ocr_status": "pending",
            "text_source": "none",
            "text_quality": None,
            "dedup_status": "none",
            "image_available": True,
            "image_width": 10,
            "image_height": 10,
            "ocr_confidence_mean": None,
            "ocr_lines": [],
        }
    ]
    files_after_first = _published_files(upload_runtime.asset_root, (first_user.user_id,))
    assert len(files_after_first) == 1

    duplicate = _post_image(
        upload_client,
        game_id=first_game,
        image=valid_jpeg_bytes,
        headers=first_auth.headers,
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["errors"][0]["code"] == "manual_duplicate"
    assert _published_files(upload_runtime.asset_root, (first_user.user_id,)) == files_after_first

    same_user_other_game = _post_image(
        upload_client,
        game_id=second_game,
        image=valid_jpeg_bytes,
        headers=first_auth.headers,
    )
    assert same_user_other_game.status_code == 202, same_user_other_game.text

    second_auth = upload_authenticator(upload_client, second_user, upload_world.password)
    same_game_other_user = _post_image(
        upload_client,
        game_id=first_game,
        image=valid_jpeg_bytes,
        headers=second_auth.headers,
    )
    assert same_game_other_user.status_code == 202, same_game_other_user.text

    owner_ids = (first_user.user_id, second_user.user_id)
    published = _published_files(upload_runtime.asset_root, owner_ids)
    assert len(published) == 3
    assert not _residual_files(upload_runtime.asset_root, owner_ids)
    with Session(upload_db_engine) as session:
        assets = list(session.scalars(select(Asset).where(Asset.owner_user_id.in_(owner_ids))))
    assert len(assets) == 3
    assert all(asset.byte_size == len(valid_jpeg_bytes) for asset in assets)
    assert all(
        LocalAssetStore(upload_runtime.asset_root).resolve_file(asset.storage_key).is_file()
        for asset in assets
    )
    assert captured_manual_dispatches == [
        str(manual_id),
        same_user_other_game.json()["manual_id"],
        same_game_other_user.json()["manual_id"],
    ]


def test_image_worker_preserves_the_internal_ocr_product_pipeline(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    internal_service_probe: Any,
    valid_jpeg_bytes: bytes,
) -> None:
    """Una subida pública termina en OCR interno sin depender del endpoint legado."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    internal_service_probe.ocr_responses.append(
        (
            200,
            {
                "lines": [
                    {"text": "x", "confidence": 0.10},
                    {"text": " Reglas\tclaras ", "confidence": 0.98},
                ]
            },
        )
    )

    response = _post_image(
        upload_client,
        game_id=upload_world.game_ids[0],
        image=valid_jpeg_bytes,
        headers=auth.headers,
    )
    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])
    with Session(upload_db_engine) as session:
        page_id = session.scalar(select(ManualPage.id).where(ManualPage.manual_id == manual_id))
    assert page_id is not None

    portal = upload_client.portal
    assert portal is not None
    portal.call(manuals_service.process_manual_page, manual_id, page_id)

    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    page = detail.json()["pages"][0]
    assert page["ocr_status"] == "completed"
    assert page["text_source"] == "ocr"
    assert page["text_quality"] == "ok"
    assert page["ocr_confidence_mean"] == pytest.approx(0.98)
    assert page["ocr_lines"] == [{"text": "Reglas claras", "confidence": 0.98}]
    assert internal_service_probe.ocr_requests == [
        {
            "body": valid_jpeg_bytes,
            "content_type": "image/jpeg",
            "content_length": str(len(valid_jpeg_bytes)),
        }
    ]
    assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 1
    assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    assert captured_manual_dispatches == [str(manual_id)]


def test_blank_pdf_falls_back_to_internal_ocr_after_real_pdfium_render(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    internal_service_probe: Any,
) -> None:
    """Un PDF sin texto se renderiza de verdad y usa la misma frontera OCR interna."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    internal_service_probe.ocr_responses.append(
        (200, {"lines": [{"text": "Texto de la página", "confidence": 0.93}]})
    )

    response = upload_client.post(
        "/api/manuals",
        data={"game_id": str(upload_world.game_ids[0])},
        files={"pdf": ("blank.pdf", _real_blank_pdf(), "application/pdf")},
        headers=auth.headers,
    )
    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])

    portal = upload_client.portal
    assert portal is not None
    page_ids = portal.call(manuals_service.process_manual, manual_id)
    assert len(page_ids) == 1
    portal.call(manuals_service.process_manual_page, manual_id, page_ids[0])

    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    page = detail.json()["pages"][0]
    assert page["ocr_status"] == "completed"
    assert page["text_source"] == "ocr"
    assert page["ocr_lines"] == [{"text": "Texto de la página", "confidence": 0.93}]
    assert len(internal_service_probe.ocr_requests) == 1
    ocr_request = internal_service_probe.ocr_requests[0]
    assert ocr_request["content_type"] == "image/jpeg"
    assert ocr_request["content_length"] == str(len(ocr_request["body"]))
    with Image.open(io.BytesIO(ocr_request["body"])) as rendered:
        assert rendered.format == "JPEG"
    assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 2
    assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    assert captured_manual_dispatches == [str(manual_id)]


def test_internal_ocr_failure_marks_the_product_page_failed_without_residue(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    internal_service_probe: Any,
    valid_jpeg_bytes: bytes,
) -> None:
    """Un 500 del servicio privado no revive la fachada pública ni deja temporales."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    internal_service_probe.ocr_responses.append((500, {"detail": "forced failure"}))

    response = _post_image(
        upload_client,
        game_id=upload_world.game_ids[0],
        image=valid_jpeg_bytes,
        headers=auth.headers,
    )
    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])
    with Session(upload_db_engine) as session:
        page_id = session.scalar(select(ManualPage.id).where(ManualPage.manual_id == manual_id))
    assert page_id is not None

    portal = upload_client.portal
    assert portal is not None
    portal.call(manuals_service.process_manual_page, manual_id, page_id)

    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    page = detail.json()["pages"][0]
    assert page["ocr_status"] == "failed"
    assert page["text_source"] == "none"
    assert page["ocr_lines"] == []
    assert len(internal_service_probe.ocr_requests) == 1
    assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 1
    assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    assert captured_manual_dispatches == [str(manual_id)]


def test_reprocessing_replaces_product_ocr_through_the_private_boundary(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    internal_service_probe: Any,
    valid_jpeg_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El reprocesado público vuelve a OCR interno y persiste el resultado nuevo."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    internal_service_probe.ocr_responses.append(
        (200, {"lines": [{"text": "Primera lectura", "confidence": 0.91}]})
    )

    response = _post_image(
        upload_client,
        game_id=upload_world.game_ids[0],
        image=valid_jpeg_bytes,
        headers=auth.headers,
    )
    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])
    portal = upload_client.portal
    assert portal is not None
    page_ids = portal.call(manuals_service.process_manual, manual_id)
    assert len(page_ids) == 1
    portal.call(manuals_service.process_manual_page, manual_id, page_ids[0])
    portal.call(manuals_service.finalize_manual, manual_id)

    reprocess_dispatches: list[tuple[str, list[str]]] = []
    monkeypatch.setattr(
        "api.manuals.router.reprocess_manual_task.delay",
        lambda dispatched_manual_id, chunk_ids: reprocess_dispatches.append(
            (dispatched_manual_id, chunk_ids)
        ),
    )
    reprocess = upload_client.post(
        f"/api/manuals/{manual_id}/reprocess",
        headers=auth.headers,
    )
    assert reprocess.status_code == 202, reprocess.text
    assert len(reprocess_dispatches) == 1
    dispatched_manual_id, stale_chunk_ids = reprocess_dispatches[0]
    assert dispatched_manual_id == str(manual_id)
    assert stale_chunk_ids

    internal_service_probe.ocr_responses.append(
        (200, {"lines": [{"text": "Segunda lectura", "confidence": 0.97}]})
    )
    page_ids = portal.call(
        manuals_service.run_reprocess,
        manual_id,
        [UUID(chunk_id) for chunk_id in stale_chunk_ids],
    )
    assert len(page_ids) == 1
    portal.call(manuals_service.process_manual_page, manual_id, page_ids[0])
    portal.call(manuals_service.finalize_manual, manual_id)

    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "active"
    page = detail.json()["pages"][0]
    assert page["ocr_status"] == "completed"
    assert page["ocr_lines"] == [{"text": "Segunda lectura", "confidence": 0.97}]
    assert len(internal_service_probe.ocr_requests) == 2
    assert len(internal_service_probe.rag_ingests) == 2
    assert internal_service_probe.rag_deletes == [
        {
            "manual_id": str(manual_id),
            "chunk_ids": stale_chunk_ids,
        }
    ]
    assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 1
    assert _residual_files(upload_runtime.asset_root, (identity.user_id,)) == []
    assert captured_manual_dispatches == [str(manual_id)]


def test_pdf_worker_reads_the_persisted_path_with_real_pdfium(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
) -> None:
    """El entrypoint del worker abre el PDF publicado y completa texto e imagen."""
    identity = upload_world.users[0]
    game_id = upload_world.game_ids[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    pdf_bytes = _real_searchable_pdf()

    response = upload_client.post(
        "/api/manuals",
        data={"game_id": str(game_id), "title": "PDF por ruta", "visibility": "private"},
        files={"pdf": ("ignored-user-name.pdf", pdf_bytes, "application/pdf")},
        headers=auth.headers,
    )
    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])

    with Session(upload_db_engine) as session:
        source = session.execute(
            select(Asset.storage_key, Asset.byte_size)
            .join(Manual, Manual.source_asset_id == Asset.id)
            .where(Manual.id == manual_id)
        ).one()
    source_path = LocalAssetStore(upload_runtime.asset_root).resolve_file(source.storage_key)
    assert source_path.is_file()
    assert source.byte_size == len(pdf_bytes)
    assert "ignored-user-name" not in source.storage_key

    portal = upload_client.portal
    assert portal is not None
    page_ids = portal.call(manuals_service.process_manual, manual_id)
    assert len(page_ids) == 1
    portal.call(manuals_service.process_manual_page, manual_id, page_ids[0])

    detail = upload_client.get(f"/api/manuals/{manual_id}")
    assert detail.status_code == 200, detail.text
    page = detail.json()["pages"][0]
    assert page["ocr_status"] == "completed"
    assert page["text_source"] == "pdf_text"
    assert page["image_available"] is True
    assert "Reglas del juego" in page["ocr_lines"][0]["text"]
    assert len(_published_files(upload_runtime.asset_root, (identity.user_id,))) == 2
    assert not _residual_files(upload_runtime.asset_root, (identity.user_id,))
    assert captured_manual_dispatches == [str(manual_id)]


def test_render_asset_repository_leaves_commit_to_the_service(
    upload_client: TestClient,
    upload_world: Any,
    upload_db_engine: Engine,
    tmp_path: Path,
) -> None:
    """Un rollback del servicio debe retirar tanto el Asset como su asociación."""
    identity = upload_world.users[0]
    _manual_id, page_ids = _insert_stale_pending_manual(
        upload_db_engine,
        owner_user_id=identity.user_id,
        game_id=upload_world.game_ids[0],
    )
    batch_id = uuid4().hex
    storage_key = f"manuals/{identity.user_id}/{batch_id}/page-1.jpg"
    image = ValidatedManualImage(
        path=tmp_path / "page-1.jpg",
        byte_size=123,
        mime_type="image/jpeg",
        extension=".jpg",
        width=10,
        height=10,
        sha256="a" * 64,
    )

    portal = upload_client.portal
    assert portal is not None
    portal.call(
        _attach_render_then_rollback,
        identity.user_id,
        page_ids[0],
        image,
        storage_key,
    )

    with Session(upload_db_engine) as session:
        assert session.scalar(select(Asset).where(Asset.storage_key == storage_key)) is None
        page = session.get(ManualPage, page_ids[0])
        assert page is not None
        assert page.image_asset_id is None


def test_attach_render_to_missing_page_leaves_no_asset_after_rollback(
    upload_client: TestClient,
    upload_world: Any,
    upload_db_engine: Engine,
    tmp_path: Path,
    valid_jpeg_bytes: bytes,
) -> None:
    """Una página inexistente falla explícitamente sin crear un Asset huérfano."""
    identity = upload_world.users[0]
    storage_key = f"manuals/{identity.user_id}/{uuid4().hex}/page-1.jpg"
    image_path = tmp_path / "page-1.jpg"
    image_path.write_bytes(valid_jpeg_bytes)
    image = ValidatedManualImage(
        path=image_path,
        byte_size=len(valid_jpeg_bytes),
        mime_type="image/jpeg",
        extension=".jpg",
        width=10,
        height=10,
        sha256=hashlib.sha256(valid_jpeg_bytes).hexdigest(),
    )
    portal = upload_client.portal
    assert portal is not None
    missing_page_id = uuid4()

    with pytest.raises(ManualContextNotFoundError):
        portal.call(
            _attach_missing_render_then_rollback,
            identity.user_id,
            missing_page_id,
            image,
            storage_key,
        )

    with Session(upload_db_engine) as session:
        assert session.scalar(select(Asset).where(Asset.storage_key == storage_key)) is None


def test_chunked_oversize_is_rejected_and_closes_partial_spools(
    upload_client: TestClient,
    upload_runtime: Any,
    upload_db_engine: Engine,
) -> None:
    """El contador real corta chunked abusivo sin autenticación ni residuos."""
    spool_before = set(upload_runtime.spool_dir.iterdir())
    with Session(upload_db_engine) as session:
        manuals_before = session.scalar(select(func.count(Manual.id)))

    response = upload_client.post(
        "/api/manuals",
        content=_oversized_chunked_multipart(),
        headers={"Content-Type": "multipart/form-data; boundary=upload-boundary"},
    )

    assert response.status_code == 413, response.text
    assert response.json()["errors"][0]["code"] == "manual_request_too_large"
    with Session(upload_db_engine) as session:
        assert session.scalar(select(func.count(Manual.id))) == manuals_before
    assert set(upload_runtime.spool_dir.iterdir()) == spool_before
    assert list(upload_runtime.asset_root.rglob("*.part")) == []


@pytest.mark.skipif(os.name != "posix", reason="chmod no retira acceso al propietario en Windows")
def test_unavailable_asset_root_returns_503_without_persisting_state(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
) -> None:
    """Un volumen realmente inaccesible no deja filas, lotes ni tareas encoladas."""
    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    original_mode = stat.S_IMODE(upload_runtime.asset_root.stat().st_mode)
    upload_runtime.asset_root.chmod(0o000)
    try:
        response = _post_image(
            upload_client,
            game_id=upload_world.game_ids[0],
            image=valid_jpeg_bytes,
            headers=auth.headers,
        )
    finally:
        upload_runtime.asset_root.chmod(original_mode)

    assert response.status_code == 503, response.text
    assert response.json()["errors"][0]["code"] == "asset_storage_unavailable"
    with Session(upload_db_engine) as session:
        manual_ids = list(
            session.scalars(select(Manual.id).where(Manual.owner_user_id == identity.user_id))
        )
        asset_ids = list(
            session.scalars(select(Asset.id).where(Asset.owner_user_id == identity.user_id))
        )
    assert manual_ids == []
    assert asset_ids == []
    assert _published_files(upload_runtime.asset_root, (identity.user_id,)) == []
    assert not _residual_files(upload_runtime.asset_root, (identity.user_id,))
    assert captured_manual_dispatches == []


@pytest.mark.skipif(os.name != "posix", reason="chmod no retira acceso al propietario en Windows")
def test_unavailable_upload_spool_returns_503_without_persisting_state(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
) -> None:
    """Un fallo real al volcar multipart a disco conserva el contrato 503."""
    identity = upload_world.users[0]
    spool_before = set(upload_runtime.spool_dir.iterdir())
    original_mode = stat.S_IMODE(upload_runtime.spool_dir.stat().st_mode)
    upload_runtime.spool_dir.chmod(0o000)
    try:
        response = upload_client.post(
            "/api/manuals",
            files={"pdf": ("ignored.pdf", b"x" * (2 * 1024 * 1024), "application/pdf")},
        )
    finally:
        upload_runtime.spool_dir.chmod(original_mode)

    assert response.status_code == 503, response.text
    assert response.json()["errors"][0]["code"] == "asset_storage_unavailable"
    with Session(upload_db_engine) as session:
        assert (
            list(session.scalars(select(Manual.id).where(Manual.owner_user_id == identity.user_id)))
            == []
        )
    assert set(upload_runtime.spool_dir.iterdir()) == spool_before


@pytest.mark.skipif(os.name != "posix", reason="chmod no impide unlink al propietario en Windows")
def test_committed_upload_keeps_202_when_pending_marker_cannot_be_removed(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    upload_db_engine: Engine,
    upload_authenticator: Any,
    captured_manual_dispatches: list[str],
    valid_jpeg_bytes: bytes,
) -> None:
    """Un fallo adopt postcommit conserva manual/asset y lo repara el reconciliador."""
    if not upload_runtime.storage_started_empty:
        pytest.skip("La reconciliación destructiva exige un ASSET_STORAGE_DIR inicialmente vacío")

    identity = upload_world.users[0]
    auth = upload_authenticator(upload_client, identity, upload_world.password)
    batch_path: Path | None = None
    original_mode: int | None = None

    with upload_db_engine.connect() as lock_connection:
        lock_transaction = lock_connection.begin()
        lock_connection.exec_driver_sql("LOCK TABLE manuals IN ACCESS EXCLUSIVE MODE")
        with ThreadPoolExecutor(max_workers=1) as executor:
            upload_future = executor.submit(
                _post_image,
                upload_client,
                game_id=upload_world.game_ids[0],
                image=valid_jpeg_bytes,
                headers=auth.headers,
            )
            try:
                batch_path = _wait_for_published_batch(
                    upload_runtime.asset_root,
                    owner_user_id=identity.user_id,
                    upload_future=upload_future,
                )
                original_mode = stat.S_IMODE(batch_path.stat().st_mode)
                batch_path.chmod(0o500)
            finally:
                lock_transaction.commit()
            response = upload_future.result(timeout=30)

    assert response.status_code == 202, response.text
    manual_id = UUID(response.json()["manual_id"])
    assert batch_path is not None
    marker = batch_path / ".pending"
    assert marker.is_file()
    try:
        detail = upload_client.get(f"/api/manuals/{manual_id}")
        image_response = upload_client.get(f"/api/manuals/{manual_id}/pages/1/image")
        assert detail.status_code == 200, detail.text
        assert image_response.status_code == 200
        assert image_response.content == valid_jpeg_bytes
        with Session(upload_db_engine) as session:
            asset = session.scalar(
                select(Asset).where(
                    Asset.owner_user_id == identity.user_id,
                    Asset.deleted_at.is_(None),
                )
            )
            assert asset is not None
            storage_key = asset.storage_key
        store = LocalAssetStore(upload_runtime.asset_root)
        assert store.resolve_file(storage_key).is_file()
        assert captured_manual_dispatches == [str(manual_id)]
    finally:
        if batch_path is not None and original_mode is not None:
            batch_path.chmod(original_mode)

    old_timestamp = (datetime.now(UTC) - timedelta(days=2)).timestamp()
    os.utime(marker, (old_timestamp, old_timestamp))
    portal = upload_client.portal
    assert portal is not None
    assert portal.call(manuals_service.reconcile_pending_asset_batches) == (1, 0)
    assert not marker.exists()
    assert store.resolve_file(storage_key).is_file()


def test_dispatch_recovery_task_resends_only_stale_all_pending_manuals(
    upload_world: Any,
    upload_db_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """La task reenvía sólo candidatos completos y repetirla conserva el mismo trabajo."""
    identity = upload_world.users[0]
    game_id = upload_world.game_ids[0]
    eligible_id, _page_ids = _insert_manual_for_dispatch_recovery(
        upload_db_engine,
        owner_user_id=identity.user_id,
        game_id=game_id,
        age=timedelta(seconds=config.MANUAL_DISPATCH_RECOVERY_DELAY_SECONDS + 60),
        declared_page_count=2,
        page_statuses=("pending", "pending"),
        title="Eligible stale manual",
    )
    fresh_id, _ = _insert_manual_for_dispatch_recovery(
        upload_db_engine,
        owner_user_id=identity.user_id,
        game_id=game_id,
        age=timedelta(0),
        declared_page_count=2,
        page_statuses=("pending", "pending"),
        title="Fresh manual",
    )
    mixed_id, _ = _insert_manual_for_dispatch_recovery(
        upload_db_engine,
        owner_user_id=identity.user_id,
        game_id=game_id,
        age=timedelta(seconds=config.MANUAL_DISPATCH_RECOVERY_DELAY_SECONDS + 60),
        declared_page_count=2,
        page_statuses=("pending", "processing"),
        title="Mixed page states",
    )
    inconsistent_id, _ = _insert_manual_for_dispatch_recovery(
        upload_db_engine,
        owner_user_id=identity.user_id,
        game_id=game_id,
        age=timedelta(seconds=config.MANUAL_DISPATCH_RECOVERY_DELAY_SECONDS + 60),
        declared_page_count=3,
        page_statuses=("pending", "pending"),
        title="Inconsistent page count",
    )
    dispatched: list[str] = []
    monkeypatch.setattr(
        maintenance_tasks.process_manual_task,
        "delay",
        lambda manual_id: dispatched.append(manual_id),
    )

    maintenance_tasks.recover_manuals_pending_dispatch.run()
    maintenance_tasks.recover_manuals_pending_dispatch.run()

    assert dispatched == [str(eligible_id), str(eligible_id)]
    assert {str(fresh_id), str(mixed_id), str(inconsistent_id)}.isdisjoint(dispatched)


def test_pending_batch_reconciliation_uses_real_asset_references(
    upload_client: TestClient,
    upload_world: Any,
    upload_runtime: Any,
    tmp_path: Path,
) -> None:
    """La reconciliación adopta sólo el lote que PostgreSQL referencia realmente."""
    if not upload_runtime.storage_started_empty:
        pytest.skip("La reconciliación destructiva exige un ASSET_STORAGE_DIR inicialmente vacío")

    identity = upload_world.users[0]
    portal = upload_client.portal
    assert portal is not None
    store = LocalAssetStore(upload_runtime.asset_root)
    referenced = _run_crash_writer(
        owner_user_id=identity.user_id,
        descriptor_path=tmp_path / "postcommit.json",
        referenced=True,
    )
    orphan = _run_crash_writer(
        owner_user_id=identity.user_id,
        descriptor_path=tmp_path / "precommit.json",
        referenced=False,
    )
    referenced_batch_path = Path(referenced["batch_path"])
    orphan_batch_path = Path(orphan["batch_path"])
    old_timestamp = (datetime.now(UTC) - timedelta(days=2)).timestamp()
    os.utime(referenced_batch_path / ".pending", (old_timestamp, old_timestamp))
    os.utime(orphan_batch_path / ".pending", (old_timestamp, old_timestamp))
    referenced_prefix = referenced["storage_key"].rsplit("/", 1)[0] + "/"
    orphan_prefix = orphan["storage_key"].rsplit("/", 1)[0] + "/"

    assert portal.call(_asset_prefix_is_referenced, referenced_prefix) is True
    assert portal.call(_asset_prefix_is_referenced, orphan_prefix) is False

    adopted, deleted = portal.call(manuals_service.reconcile_pending_asset_batches)
    assert (adopted, deleted) == (1, 1)
    assert store.resolve_file(referenced["storage_key"]).is_file()
    assert not (referenced_batch_path / ".pending").exists()
    assert not orphan_batch_path.exists()
    assert not store.resolve_file(orphan["storage_key"]).exists()
    assert portal.call(_asset_prefix_is_referenced, referenced_prefix) is True
    assert portal.call(_asset_prefix_is_referenced, orphan_prefix) is False


def _post_image(
    client: TestClient,
    *,
    game_id: UUID,
    image: bytes,
    headers: dict[str, str],
) -> Any:
    return client.post(
        "/api/manuals",
        data={"game_id": str(game_id), "visibility": "private"},
        files=[("images", ("ignored-user-name.jpg", image, "image/jpeg"))],
        headers=headers,
    )


def _wait_for_published_batch(
    asset_root: Path,
    *,
    owner_user_id: UUID,
    upload_future: Future[Any],
) -> Path:
    """Espera al rename publicado mientras el INSERT permanece bloqueado en PostgreSQL."""
    owner_root = asset_root / "manuals" / str(owner_user_id)
    deadline = datetime.now(UTC) + timedelta(seconds=30)
    while datetime.now(UTC) < deadline:
        published = list(owner_root.glob("*/page-1.jpg"))
        if len(published) == 1:
            return published[0].parent
        if upload_future.done():
            response = upload_future.result()
            raise AssertionError(f"El POST terminó antes de publicar el asset: {response.text}")
        time.sleep(0.01)
    raise TimeoutError("El asset no se publicó antes del timeout")


def _jpeg_bytes(*, width: int, height: int, color: tuple[int, int, int]) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (width, height), color=color).save(output, format="JPEG")
    return output.getvalue()


async def _attach_render_then_rollback(
    owner_user_id: UUID,
    page_id: UUID,
    image: ValidatedManualImage,
    storage_key: str,
) -> None:
    async with get_sessionmaker()() as session:
        await attach_page_image_asset(
            session,
            owner_user_id=owner_user_id,
            page_id=page_id,
            image=image,
            storage_key=storage_key,
            source_fingerprint_kind="pdf_render",
        )
        await session.rollback()


async def _attach_missing_render_then_rollback(
    owner_user_id: UUID,
    page_id: UUID,
    image: ValidatedManualImage,
    storage_key: str,
) -> None:
    async with get_sessionmaker()() as session:
        try:
            await attach_page_image_asset(
                session,
                owner_user_id=owner_user_id,
                page_id=page_id,
                image=image,
                storage_key=storage_key,
                source_fingerprint_kind="pdf_render",
            )
        finally:
            await session.rollback()


async def _asset_prefix_is_referenced(storage_prefix: str) -> bool:
    async with get_sessionmaker()() as session:
        return await asset_storage_prefix_is_referenced(
            session,
            storage_prefix=storage_prefix,
        )


def _oversized_chunked_multipart() -> Any:
    yield (
        b"--upload-boundary\r\n"
        b'Content-Disposition: form-data; name="pdf"; filename="ignored.pdf"\r\n'
        b"Content-Type: application/pdf\r\n\r\n"
    )
    chunk = b"x" * (1024 * 1024)
    remaining = config.MAX_MANUAL_TOTAL_SIZE + (2 * 1024 * 1024)
    while remaining:
        size = min(remaining, len(chunk))
        yield chunk[:size]
        remaining -= size
    yield b"\r\n--upload-boundary--\r\n"


def _published_files(asset_root: Path, owner_ids: tuple[UUID, ...]) -> list[Path]:
    files: list[Path] = []
    for owner_id in owner_ids:
        owner_root = asset_root / "manuals" / str(owner_id)
        if owner_root.exists():
            files.extend(
                path
                for path in owner_root.rglob("*")
                if path.is_file() and path.name != ".pending" and path.suffix != ".part"
            )
    return sorted(files)


def _residual_files(asset_root: Path, owner_ids: tuple[UUID, ...]) -> list[Path]:
    return [
        path
        for owner_id in owner_ids
        for path in (asset_root / "manuals" / str(owner_id)).rglob("*")
        if path.is_file() and (path.name == ".pending" or path.suffix == ".part")
    ]


def _assert_owner_has_no_upload_state(
    engine: Engine,
    asset_root: Path,
    *,
    owner_user_id: UUID,
) -> None:
    """Comprueba el rollback observable sin sustituir DB ni almacenamiento."""
    with Session(engine) as session:
        assert (
            list(session.scalars(select(Manual.id).where(Manual.owner_user_id == owner_user_id)))
            == []
        )
        assert (
            list(session.scalars(select(Asset.id).where(Asset.owner_user_id == owner_user_id)))
            == []
        )
    assert _published_files(asset_root, (owner_user_id,)) == []
    assert _residual_files(asset_root, (owner_user_id,)) == []


def _real_searchable_pdf() -> bytes:
    """Genera un PDF real con texto suficiente usando exclusivamente PDFium."""
    output = io.BytesIO()
    document = pdfium.PdfDocument.new()
    page = document.new_page(612, 792)
    raw_object = pdfium_raw.FPDFPageObj_NewTextObj(document, b"Helvetica", 12.0)
    text_value = "Reglas del juego. " * 40
    encoded = text_value.encode("utf-16-le") + b"\0\0"
    units = [
        int.from_bytes(encoded[index : index + 2], "little") for index in range(0, len(encoded), 2)
    ]
    text_buffer = (pdfium_raw.FPDF_WCHAR * len(units))(*units)
    try:
        assert pdfium_raw.FPDFText_SetText(raw_object, text_buffer)
        pdfium_raw.FPDFPageObj_Transform(raw_object, 1, 0, 0, 1, 40, 700)
        text_object = pdfium.PdfTextObj(raw_object, pdf=document)
        page.insert_obj(text_object)
        assert pdfium_raw.FPDFPage_GenerateContent(page)
        document.save(output)
    finally:
        page.close()
        document.close()
    return output.getvalue()


def _real_blank_pdf() -> bytes:
    """Genera un PDF real sin capa de texto para forzar el fallback OCR."""
    output = io.BytesIO()
    document = pdfium.PdfDocument.new()
    document.new_page(200, 200)
    try:
        document.save(output)
    finally:
        document.close()
    return output.getvalue()


def _insert_stale_pending_manual(
    engine: Engine,
    *,
    owner_user_id: UUID,
    game_id: UUID,
) -> tuple[UUID, list[UUID]]:
    return _insert_manual_for_dispatch_recovery(
        engine,
        owner_user_id=owner_user_id,
        game_id=game_id,
        age=timedelta(seconds=config.MANUAL_DISPATCH_RECOVERY_DELAY_SECONDS + 60),
        declared_page_count=2,
        page_statuses=("pending", "pending"),
        title="Pending dispatch",
    )


def _insert_manual_for_dispatch_recovery(
    engine: Engine,
    *,
    owner_user_id: UUID,
    game_id: UUID,
    age: timedelta,
    declared_page_count: int,
    page_statuses: tuple[str, ...],
    title: str,
) -> tuple[UUID, list[UUID]]:
    created_at = datetime.now(UTC) - age
    with Session(engine, expire_on_commit=False) as session:
        manual = Manual(
            owner_user_id=owner_user_id,
            game_id=game_id,
            title=title,
            source_type="images",
            page_count=declared_page_count,
            source_fingerprint=hashlib.sha256(uuid4().bytes).hexdigest(),
            status="indexing",
            visibility="private",
            chunks_indexed=0,
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(manual)
        session.flush()
        pages = [
            ManualPage(
                manual_id=manual.id,
                page_number=page_number,
                ocr_status=ocr_status,
                text_source="none",
                created_at=created_at,
                updated_at=created_at,
            )
            for page_number, ocr_status in enumerate(page_statuses, start=1)
        ]
        session.add_all(pages)
        session.commit()
        return manual.id, [page.id for page in pages]


def _run_crash_writer(
    *,
    owner_user_id: UUID,
    descriptor_path: Path,
    referenced: bool,
) -> dict[str, str]:
    result = subprocess.run(
        [
            sys.executable,
            str(_CRASH_WRITER),
            str(owner_user_id),
            str(descriptor_path),
            "referenced" if referenced else "orphan",
        ],
        cwd=_CRASH_WRITER.parents[4],
        check=False,
        timeout=30,
    )
    assert result.returncode == _CRASH_EXIT_CODE
    descriptor = json.loads(descriptor_path.read_text(encoding="utf-8"))
    assert isinstance(descriptor, dict)
    return {str(key): str(value) for key, value in descriptor.items()}
