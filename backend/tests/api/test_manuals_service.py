import hashlib
from contextlib import asynccontextmanager
from dataclasses import asdict
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import anyio
import httpx
import pypdfium2 as pdfium
import pytest
from fastapi import UploadFile
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import Headers

import api.exceptions as api_exceptions
import api.manuals.retrieval.service as retrieval_service
import api.manuals.service as manual_service
from api.assets.storage import LocalAssetStore
from api.exceptions import InternalServiceError, ManualPageLimitExceededError
from api.manuals.dto import (
    AuthorizedChunk,
    DeletedManualAssets,
    ManualPageForProcessing,
    ReconciliationPlan,
    ValidatedManualImage,
)
from api.manuals.exceptions import (
    GeneratedAnswerTooLongError,
    ManualContextNotFoundError,
    ManualNotFoundError,
    ManualTooLargeError,
    ManualUploadSelectionError,
)
from api.manuals.schemas import GAME_QUESTION_TOP_K_MAX, AnswerResponse
from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from rag.annotations import RAG_RETRIEVAL_TOP_K_MAX

_USER_ID = uuid4()
_GAME_ID = uuid4()
_MANUAL_ID = uuid4()
_CHUNK_ID = uuid4()
_DUPLICATE_CHUNK_ID = uuid4()
_UNIQUE_CHUNK_ID = uuid4()
_MANUAL_TITLE = "Reglamento base"
_INDEXED_AT = "2026-05-31T10:00:00+00:00"
_OCR_LINES = [{"text": "Regla uno. Regla dos.", "confidence": 0.9}]


def test_retrieval_top_k_limits_keep_api_and_rag_in_sync():
    """El top_k máximo que pide API nunca supera el aceptado por RAG."""
    assert GAME_QUESTION_TOP_K_MAX <= RAG_RETRIEVAL_TOP_K_MAX


@pytest.mark.anyio
async def test_store_images_publishes_flat_metadata_without_staging_descriptor(
    tmp_path,
    valid_jpeg_bytes,
):
    """El DTO publicado conserva metadatos, pero no la ruta temporal ya movida."""
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=_USER_ID)
    upload = _upload_file(valid_jpeg_bytes, filename="page.jpg", mime_type="image/jpeg")
    try:
        [stored] = await manual_service._store_images(batch=batch, images=[upload])

        expected_sha256 = hashlib.sha256(valid_jpeg_bytes).hexdigest()
        assert asdict(stored) == {
            "page_number": 1,
            "storage_key": stored.storage_key,
            "byte_size": len(valid_jpeg_bytes),
            "mime_type": "image/jpeg",
            "extension": ".jpg",
            "width": 10,
            "height": 10,
            "sha256": expected_sha256,
        }
        assert stored.storage_key.endswith("/page-1.jpg")
        assert not any(hasattr(stored, name) for name in ("path", "image", "pdf"))
        assert (
            manual_service._manual_source_fingerprint(
                source_type="images",
                images=[stored],
                source_pdf=None,
            )
            == hashlib.sha256(f"images\n{expected_sha256}".encode()).hexdigest()
        )
    finally:
        await batch.abort()


@pytest.mark.anyio
async def test_store_pdf_publishes_flat_metadata_without_staging_descriptor(tmp_path):
    """El PDF publicado conserva metadatos, pero no el descriptor con ruta temporal."""
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=_USER_ID)
    pdf_bytes = _blank_pdf_bytes(tmp_path)
    upload = _upload_file(pdf_bytes, filename="manual.pdf", mime_type="application/pdf")
    try:
        images, stored, source_type, page_count = await manual_service._store_upload(
            batch=batch,
            images=None,
            pdf=upload,
        )

        assert stored is not None
        expected_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
        assert images == []
        assert source_type == "pdf"
        assert page_count == 1
        assert asdict(stored) == {
            "storage_key": stored.storage_key,
            "byte_size": len(pdf_bytes),
            "mime_type": "application/pdf",
            "extension": ".pdf",
            "page_count": 1,
            "sha256": expected_sha256,
        }
        assert stored.storage_key.endswith("/source.pdf")
        assert not any(hasattr(stored, name) for name in ("path", "image", "pdf"))
        assert (
            manual_service._manual_source_fingerprint(
                source_type="pdf",
                images=[],
                source_pdf=stored,
            )
            == hashlib.sha256(f"pdf\n{expected_sha256}".encode()).hexdigest()
        )
    finally:
        await batch.abort()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("page_count", "accepted"),
    [(29, True), (30, True), (31, False)],
    ids=["29_paginas", "30_paginas", "31_paginas"],
)
async def test_store_images_page_count_bva(
    tmp_path,
    valid_jpeg_bytes,
    monkeypatch,
    page_count,
    accepted,
):
    """BVA real de páginas por imágenes: se aceptan 30 y se rechazan 31."""
    monkeypatch.setattr(manual_service.config, "MAX_MANUAL_PAGES", 30)
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=_USER_ID)
    images = [
        _upload_file(valid_jpeg_bytes, filename=f"page-{index}.jpg", mime_type="image/jpeg")
        for index in range(page_count)
    ]
    try:
        if accepted:
            stored = await manual_service._store_images(batch=batch, images=images)
            assert len(stored) == page_count
            assert [item.page_number for item in stored] == list(range(1, page_count + 1))
            assert not list(batch.path.glob("*.part"))
        else:
            with pytest.raises(ManualPageLimitExceededError):
                await manual_service._store_images(batch=batch, images=images)
            assert not list(batch.path.glob("*.part"))
    finally:
        await batch.abort()


@pytest.mark.anyio
async def test_store_upload_rejects_mixed_sources_and_closes_every_part(
    tmp_path,
    valid_jpeg_bytes,
):
    """La exclusión PDF/imágenes no deja spools abiertos."""
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=_USER_ID)
    image = _upload_file(valid_jpeg_bytes, filename="page.jpg", mime_type="image/jpeg")
    pdf = _upload_file(b"%PDF-", filename="manual.pdf", mime_type="application/pdf")
    try:
        with pytest.raises(ManualUploadSelectionError):
            await manual_service._store_upload(batch=batch, images=[image], pdf=pdf)
        assert image.file.closed
        assert pdf.file.closed
        assert not list(batch.path.glob("*.part"))
    finally:
        await batch.abort()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("total_size", "accepted"),
    [(9, True), (10, True), (11, False)],
    ids=["limite_menos_1", "limite_exacto", "limite_mas_1"],
)
async def test_store_images_total_size_bva(
    tmp_path,
    valid_jpeg_bytes,
    monkeypatch,
    total_size,
    accepted,
):
    """El agregado usa el tamaño contado del JPEG real en límite ±1."""
    boundary = len(valid_jpeg_bytes) + 1
    content = valid_jpeg_bytes + b"\0" * (total_size - 9)
    monkeypatch.setattr(manual_service.config, "MAX_MANUAL_TOTAL_SIZE", boundary)
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=_USER_ID)
    try:
        upload = _upload_file(content, filename="page.jpg", mime_type="image/jpeg")
        if accepted:
            stored = await manual_service._store_images(batch=batch, images=[upload])
            assert len(stored) == 1
        else:
            with pytest.raises(ManualTooLargeError):
                await manual_service._store_images(batch=batch, images=[upload])
    finally:
        await batch.abort()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("pdf_size", "accepted"),
    [(9, True), (10, True), (11, False)],
    ids=["limite_menos_1", "limite_exacto", "limite_mas_1"],
)
async def test_store_pdf_total_size_bva(tmp_path, monkeypatch, pdf_size, accepted):
    """El total usa el tamaño contado de un PDF real en límite ±1."""
    base_pdf = _blank_pdf_bytes(tmp_path)
    boundary = len(base_pdf) + 1
    content = base_pdf + b"\0" * (pdf_size - 9)
    monkeypatch.setattr(manual_service.config, "MAX_MANUAL_TOTAL_SIZE", boundary)
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=_USER_ID)
    try:
        upload = _upload_file(content, filename="manual.pdf", mime_type="application/pdf")
        if accepted:
            stored_images, source_pdf, source_type, page_count = await manual_service._store_upload(
                batch=batch, images=None, pdf=upload
            )
            assert stored_images == []
            assert source_pdf is not None
            assert source_type == "pdf"
            assert page_count == 1
        else:
            with pytest.raises(ManualTooLargeError):
                await manual_service._store_upload(batch=batch, images=None, pdf=upload)
    finally:
        await batch.abort()


@pytest.mark.anyio
async def test_process_manual_devuelve_paginas_pending_para_celery(monkeypatch):
    """El orquestador solo lista páginas pendientes y no hace OCR en el request."""
    session = _session()
    page_id = uuid4()
    _patch_sessionmaker(monkeypatch, session=session)
    list_mock = AsyncMock(return_value=[page_id])
    monkeypatch.setattr(manual_service, "list_pending_page_ids_for_processing", list_mock)

    result = await manual_service.process_manual(_MANUAL_ID)

    assert result == [page_id]
    list_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)


def test_internal_http_client_usa_timeout_configurado(monkeypatch):
    """El worker no debe caer en el timeout HTTPX por defecto de 5 segundos."""
    captured: dict[str, httpx.Timeout] = {}

    def fake_async_client(*, timeout: httpx.Timeout):
        captured["timeout"] = timeout
        return _AsyncContext(object())

    monkeypatch.setattr(manual_service.config, "OCR_SERVICE_TIMEOUT", 300.0)
    monkeypatch.setattr(manual_service.config, "INTERNAL_JSON_TIMEOUT", 120.0)
    monkeypatch.setattr(manual_service.httpx, "AsyncClient", fake_async_client)

    manual_service._internal_http_client()

    assert captured["timeout"].as_dict() == {
        "connect": 10.0,
        "read": 300.0,
        "write": 300.0,
        "pool": 300.0,
    }


@pytest.mark.anyio
async def test_process_manual_page_reclama_pagina_y_ejecuta_ocr(tmp_path, monkeypatch):
    """Una task de página reclama pending -> processing y persiste OCR/chunks."""
    events: list[str] = []
    session = _session(events)
    client = object()
    page_id = uuid4()
    manual = _manual(source_type="images")
    page = _image_page(page_id=page_id, page_number=1)
    claim_mock = _patch_claimed_page(
        monkeypatch,
        session=session,
        client=client,
        manual=manual,
        page=page,
    )
    claim_mock.side_effect = lambda *_args, **_kwargs: events.append("claim") or True
    _patch_no_reusable_page(monkeypatch)
    image_path = tmp_path / "page-1.jpg"
    image_path.write_bytes(b"image-bytes")
    monkeypatch.setattr(manual_service, "stored_file_path", lambda _key: image_path)
    run_ocr_mock = AsyncMock(
        side_effect=lambda **_kwargs: events.append("ocr") or _OCR_LINES,
    )
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    replace_mock = AsyncMock(side_effect=lambda *_args, **_kwargs: events.append("replace"))
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    claim_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID, page_id=page_id)
    replace_mock.assert_awaited_once()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["text_quality"] == "ok"
    assert replace_kwargs["source_fingerprint"] == page.sha256
    assert replace_kwargs["source_fingerprint_kind"] == "image"
    assert replace_kwargs["chunks"][0].source_page == 1
    assert replace_kwargs["chunks"][0].chunk_index == 0
    assert run_ocr_mock.await_args.kwargs["client"] is client
    ocr_image = run_ocr_mock.await_args.kwargs["image"]
    assert ocr_image.path == image_path
    assert ocr_image.byte_size == page.byte_size
    assert "content" not in ocr_image.__dataclass_fields__
    assert ocr_image.sha256 == page.sha256
    assert ocr_image.width == page.width
    assert ocr_image.height == page.height
    assert events == ["claim", "commit", "ocr", "replace", "commit"]


@pytest.mark.anyio
async def test_process_manual_page_reutiliza_imagen_canonica_sin_importar_orden(monkeypatch):
    """EP3 misma foto en otra posición: la huella de página evita repetir OCR."""
    session = _session()
    page_id = uuid4()
    reusable = _reusable_page_result()
    _patch_claimed_page(
        monkeypatch,
        session=session,
        client=object(),
        manual=_manual(source_type="images"),
        page=_image_page(page_id=page_id, page_number=2),
    )
    reuse_mock = AsyncMock(return_value=reusable)
    monkeypatch.setattr(manual_service, "find_reusable_page_result", reuse_mock)
    run_ocr_mock = AsyncMock()
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    reuse_mock.assert_awaited_once_with(
        session,
        owner_user_id=_USER_ID,
        game_id=_GAME_ID,
        source_fingerprint="f" * 64,
        exclude_page_id=page_id,
    )
    run_ocr_mock.assert_not_awaited()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["page_id"] == page_id
    assert replace_kwargs["source_fingerprint"] == "f" * 64
    assert replace_kwargs["source_fingerprint_kind"] == "image"
    assert replace_kwargs["source_reused_from_page_id"] == reusable.page_id
    assert replace_kwargs["chunks"][0].source_page == 2


@pytest.mark.anyio
async def test_process_manual_page_no_toca_nada_si_no_reclama(monkeypatch):
    """Si otro worker ya ganó la página, esta task queda en no-op idempotente."""
    session = _session()
    _patch_sessionmaker(monkeypatch, session=session)
    monkeypatch.setattr(manual_service, "claim_page_for_processing", AsyncMock(return_value=False))
    get_manual_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_manual_mock)

    await manual_service.process_manual_page(_MANUAL_ID, uuid4())

    get_manual_mock.assert_not_awaited()
    assert session.commits == 0


@pytest.mark.anyio
async def test_process_manual_page_hace_rollback_antes_de_marcar_pagina_fallida(
    tmp_path,
    monkeypatch,
):
    """Tras un fallo SQL, la sesión debe limpiarse antes de seguir usándola."""
    events: list[str] = []
    page_id = uuid4()
    session = _session(events)
    claim_mock = _patch_claimed_page(
        monkeypatch,
        session=session,
        client=object(),
        manual=_manual(source_type="images"),
        page=_image_page(page_id=page_id, page_number=1),
    )
    claim_mock.side_effect = lambda *_args, **_kwargs: events.append("claim") or True
    _patch_no_reusable_page(monkeypatch)
    image_path = tmp_path / "page-1.jpg"
    image_path.write_bytes(b"image-bytes")
    monkeypatch.setattr(manual_service, "stored_file_path", lambda _key: image_path)
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(
        manual_service,
        "replace_page_result",
        AsyncMock(side_effect=SQLAlchemyError("fallo flush")),
    )
    monkeypatch.setattr(
        manual_service,
        "mark_page_failed",
        AsyncMock(side_effect=lambda *_args, **_kwargs: events.append("mark_page_failed")),
    )

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    assert events == ["claim", "commit", "rollback", "mark_page_failed", "commit"]


@pytest.mark.anyio
async def test_finalize_manual_no_cierra_si_quedan_paginas_abiertas(monkeypatch):
    """El finalizador es idempotente y espera a pending/processing."""
    session = _session()
    _patch_process_resources(monkeypatch, session=session, client=object())
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="images")),
    )
    monkeypatch.setattr(manual_service, "manual_has_unfinished_pages", AsyncMock(return_value=True))
    resolve_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "resolve_manual_processed_status", resolve_mock)

    await manual_service.finalize_manual(_MANUAL_ID)

    resolve_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_finalize_manual_no_hace_nada_si_otro_worker_tiene_el_lock(monkeypatch):
    """Si otro proceso está cerrando el manual, esta ejecución sale limpia."""
    monkeypatch.setattr(manual_service, "manual_lock", lambda _manual_id: _AsyncContext(None))
    get_manual_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_manual_mock)

    await manual_service.finalize_manual(_MANUAL_ID)

    get_manual_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_replace_page_text_marks_empty_pages_without_text_source(monkeypatch):
    """Si no hay texto útil, la página queda completed/empty pero sin fuente."""
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service._replace_page_text(
        object(),
        manual_id=_MANUAL_ID,
        page_id=uuid4(),
        page_number=1,
        lines=[{"text": "   ", "confidence": 0.9}],
        text_source="ocr",
        confidence_mean=0.9,
    )

    assert replace_mock.await_args.kwargs["text_source"] == "none"
    assert replace_mock.await_args.kwargs["text_quality"] == "empty"
    assert replace_mock.await_args.kwargs["chunks"] == []


@pytest.mark.anyio
async def test_replace_page_text_usa_indices_estables_por_pagina(monkeypatch):
    """Cada página tiene un rango propio de chunk_index para evitar carreras."""
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service._replace_page_text(
        object(),
        manual_id=_MANUAL_ID,
        page_id=uuid4(),
        page_number=2,
        lines=_OCR_LINES,
        text_source="ocr",
        confidence_mean=0.9,
    )

    assert replace_mock.await_args.kwargs["chunks"][0].chunk_index == (
        manual_service.MANUAL_CHUNK_INDEX_PAGE_STRIDE
    )


@pytest.mark.anyio
async def test_process_manual_page_usa_texto_pdf_aprovechable_sin_ocr(tmp_path, monkeypatch):
    """Una página PDF con texto bueno no se degrada pasándola por OCR."""
    session = _session()
    client = object()
    page_id = uuid4()
    source_asset_id = uuid4()
    manual = _manual(source_type="pdf", source_asset_id=source_asset_id)
    text = " ".join(f"regla-{index}" for index in range(40))
    _patch_claimed_page(
        monkeypatch,
        session=session,
        client=client,
        manual=manual,
        page=_pdf_page(page_id=page_id, page_number=1),
    )
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    pdf_path = tmp_path / "source.pdf"
    pdf_path.write_bytes(b"%PDF-")
    monkeypatch.setattr(manual_service, "stored_file_path", lambda _key: pdf_path)
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=text))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda value: value == text)
    run_ocr_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    ensure_image_mock = AsyncMock()
    monkeypatch.setattr(
        manual_service,
        "_ensure_pdf_page_image_asset",
        ensure_image_mock,
    )
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["ocr_lines"] == [{"text": text, "confidence": None}]
    assert replace_kwargs["text_source"] == "pdf_text"
    assert replace_kwargs["ocr_confidence_mean"] is None
    run_ocr_mock.assert_not_awaited()
    assert ensure_image_mock.await_args.kwargs["pdf_path"] == pdf_path


@pytest.mark.anyio
async def test_process_manual_page_pdf_con_render_sigue_prefiriendo_texto_embebido(
    tmp_path,
    monkeypatch,
):
    """Reprocesar un PDF ya renderizado no degrada texto embebido a OCR."""
    session = _session()
    client = object()
    page_id = uuid4()
    text = " ".join(f"regla-{index}" for index in range(40))
    page = SimpleNamespace(
        id=page_id,
        page_number=1,
        ocr_status="processing",
        storage_key="manuals/user/manual/page-1.jpg",
        mime_type="image/jpeg",
        byte_size=11,
        width=10,
        height=10,
        sha256="f" * 64,
    )
    _patch_claimed_page(
        monkeypatch,
        session=session,
        client=client,
        manual=_manual(source_type="pdf", source_asset_id=uuid4()),
        page=page,
    )
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    pdf_path = tmp_path / "source.pdf"
    pdf_path.write_bytes(b"%PDF-")
    monkeypatch.setattr(manual_service, "stored_file_path", lambda _key: pdf_path)
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=text))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda value: value == text)
    run_ocr_mock = AsyncMock()
    render_mock = AsyncMock()
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    monkeypatch.setattr(manual_service, "render_pdf_page", render_mock)
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    run_ocr_mock.assert_not_awaited()
    render_mock.assert_not_awaited()
    assert replace_mock.await_args.kwargs["text_source"] == "pdf_text"


@pytest.mark.anyio
async def test_process_manual_page_renderiza_pdf_si_el_texto_no_es_aprovechable(
    tmp_path,
    monkeypatch,
):
    """Una página PDF sin texto bueno se renderiza y sigue el OCR normal."""
    session = _session()
    client = object()
    page_id = uuid4()
    image = _validated_image()
    _patch_claimed_page(
        monkeypatch,
        session=session,
        client=client,
        manual=_manual(source_type="pdf", source_asset_id=uuid4()),
        page=_pdf_page(page_id=page_id, page_number=2),
    )
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    pdf_path = tmp_path / "source.pdf"
    pdf_path.write_bytes(b"%PDF-")
    monkeypatch.setattr(manual_service, "stored_file_path", lambda _key: pdf_path)
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=""))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda _value: False)
    persist_mock = AsyncMock(return_value=image)
    monkeypatch.setattr(manual_service, "_persist_pdf_page_image", persist_mock)
    _patch_no_reusable_page(monkeypatch)
    run_ocr_mock = AsyncMock(return_value=_OCR_LINES)
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    assert persist_mock.await_args.kwargs["pdf_path"] == pdf_path
    assert run_ocr_mock.await_args.kwargs["image"] is image
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["chunks"][0].source_page == 2


@pytest.mark.anyio
async def test_process_manual_page_reutiliza_pdf_renderizado_canonico(tmp_path, monkeypatch):
    """EP3 PDF renderizado repetido: copia resultado y no llama a OCR."""
    session = _session()
    client = object()
    page_id = uuid4()
    image = _validated_image()
    reusable = _reusable_page_result()
    _patch_claimed_page(
        monkeypatch,
        session=session,
        client=client,
        manual=_manual(source_type="pdf", source_asset_id=uuid4()),
        page=_pdf_page(page_id=page_id, page_number=2),
    )
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    pdf_path = tmp_path / "source.pdf"
    pdf_path.write_bytes(b"%PDF-")
    monkeypatch.setattr(manual_service, "stored_file_path", lambda _key: pdf_path)
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=""))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda _value: False)
    persist_mock = AsyncMock(return_value=image)
    monkeypatch.setattr(manual_service, "_persist_pdf_page_image", persist_mock)
    reuse_mock = AsyncMock(return_value=reusable)
    monkeypatch.setattr(manual_service, "find_reusable_page_result", reuse_mock)
    run_ocr_mock = AsyncMock()
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    reuse_mock.assert_awaited_once_with(
        session,
        owner_user_id=_USER_ID,
        game_id=_GAME_ID,
        source_fingerprint=image.sha256,
        exclude_page_id=page_id,
    )
    assert persist_mock.await_args.kwargs["pdf_path"] == pdf_path
    run_ocr_mock.assert_not_awaited()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["ocr_lines"] == reusable.ocr_lines
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["text_quality"] == "ok"
    assert replace_kwargs["source_fingerprint"] == image.sha256
    assert replace_kwargs["source_fingerprint_kind"] == "pdf_render"
    assert replace_kwargs["source_reused_from_page_id"] == reusable.page_id
    assert replace_kwargs["chunks"][0].text == "Regla reutilizada."
    assert replace_kwargs["chunks"][0].source_page == 2


@pytest.mark.anyio
async def test_finalize_manual_marca_failed_si_rag_responde_payload_invalido(monkeypatch):
    """Un fallo de indexado deja el manual marcado para reintento."""
    events: list[str] = []
    session = _session(events)
    _patch_process_resources(monkeypatch, session=session, client=object())
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="images", language=None)),
    )
    monkeypatch.setattr(
        manual_service,
        "manual_has_unfinished_pages",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        manual_service,
        "resolve_manual_processed_status",
        AsyncMock(return_value="active"),
    )
    monkeypatch.setattr(
        manual_service,
        "list_manual_chunks_for_ingest",
        AsyncMock(
            return_value=[
                SimpleNamespace(
                    id=_CHUNK_ID,
                    text="Regla uno.",
                    chunk_index=0,
                    source_page=1,
                    content_hash="a" * 64,
                )
            ]
        ),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(return_value={"status": "indexed"}),
    )
    mark_failed_mock = AsyncMock(
        side_effect=lambda *_args, **_kwargs: events.append("mark_failed"),
    )
    monkeypatch.setattr(manual_service, "mark_manual_failed", mark_failed_mock)

    with pytest.raises(InternalServiceError):
        await manual_service.finalize_manual(_MANUAL_ID)

    mark_failed_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    assert events == ["mark_failed", "commit"]


@pytest.mark.anyio
async def test_finalize_manual_confirma_el_estado_indexado_en_el_servicio(monkeypatch):
    """El caso de uso confirma la escritura solo tras aceptar la respuesta RAG."""
    session = _session()
    _patch_process_resources(monkeypatch, session=session, client=object())
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="images", language=None)),
    )
    monkeypatch.setattr(
        manual_service,
        "manual_has_unfinished_pages",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        manual_service,
        "resolve_manual_processed_status",
        AsyncMock(return_value="active"),
    )
    monkeypatch.setattr(
        manual_service,
        "list_manual_chunks_for_ingest",
        AsyncMock(
            return_value=[
                SimpleNamespace(
                    id=_CHUNK_ID,
                    text="Regla uno.",
                    chunk_index=0,
                    source_page=1,
                    content_hash="a" * 64,
                )
            ]
        ),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(
            return_value={
                "chunk_ids": [str(_CHUNK_ID)],
                "chunks_indexed": 1,
                "embedding_model": "test-model",
                "indexed_at": _INDEXED_AT,
            }
        ),
    )
    mark_indexed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_indexed_mock)

    await manual_service.finalize_manual(_MANUAL_ID)

    mark_indexed_mock.assert_awaited_once()
    assert session.commits == 1


@pytest.mark.anyio
async def test_recover_stale_manual_pages_usa_cutoff_del_hard_limit(monkeypatch):
    """El sweeper falla páginas abandonadas con margen sobre el hard limit."""
    session = _session()
    _patch_sessionmaker(monkeypatch, session=session)
    mark_mock = AsyncMock(return_value=[_MANUAL_ID])
    monkeypatch.setattr(manual_service, "mark_stale_processing_pages_failed", mark_mock)

    result = await manual_service.recover_stale_manual_pages()

    assert result == [_MANUAL_ID]
    cutoff = mark_mock.await_args.kwargs["cutoff"]
    assert cutoff.tzinfo is not None
    assert cutoff < manual_service.datetime.now(manual_service.UTC)
    assert session.commits == 1


@pytest.mark.anyio
async def test_reprocess_manual_confirma_el_claim_en_el_servicio(monkeypatch):
    """El estado indexing se confirma antes de que el router publique la task."""
    session = _session()
    stale_chunk_ids = [uuid4()]
    monkeypatch.setattr(
        manual_service,
        "begin_manual_reprocessing",
        AsyncMock(return_value=stale_chunk_ids),
    )

    result = await manual_service.reprocess_manual(
        session,
        auth=_auth(),
        manual_id=_MANUAL_ID,
        page_number=None,
    )

    assert result == stale_chunk_ids
    assert session.commits == 1
    assert session.rollbacks == 0


@pytest.mark.anyio
async def test_reprocess_manual_revierte_un_claim_incompleto(monkeypatch):
    """Un error de contexto no deja el manual reclamado a medias."""
    session = _session()
    monkeypatch.setattr(
        manual_service,
        "begin_manual_reprocessing",
        AsyncMock(side_effect=ManualNotFoundError),
    )
    auth = _auth()

    with pytest.raises(ManualNotFoundError):
        await manual_service.reprocess_manual(
            session,
            auth=auth,
            manual_id=_MANUAL_ID,
            page_number=99,
        )

    assert session.commits == 0
    assert session.rollbacks == 1


@pytest.mark.anyio
async def test_fail_manual_page_confirma_el_fallo_en_el_servicio(monkeypatch):
    """El callback de Celery persiste el fallo antes de cerrar su sesión."""
    session = _session()
    _patch_sessionmaker(monkeypatch, session=session)
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="images")),
    )
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_page_failed", mark_failed_mock)
    page_id = uuid4()

    await manual_service.fail_manual_page(_MANUAL_ID, page_id)

    mark_failed_mock.assert_awaited_once_with(session, page_id=page_id)
    assert session.commits == 1


@pytest.mark.anyio
async def test_fail_manual_confirma_el_fallo_en_el_servicio(monkeypatch):
    """El fallback del finalizador es propietario de su commit."""
    session = _session()
    _patch_sessionmaker(monkeypatch, session=session)
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_failed", mark_failed_mock)

    await manual_service.fail_manual(_MANUAL_ID)

    mark_failed_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    assert session.commits == 1


@pytest.mark.anyio
async def test_sync_page_rag_confirma_metadatos_en_el_servicio(monkeypatch):
    """La sincronización confirma Postgres después de la frontera RAG."""
    session = _session()
    _patch_sessionmaker(monkeypatch, session=session)
    _patch_http_client(monkeypatch, client=object())
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="images")),
    )
    monkeypatch.setattr(
        manual_service,
        "list_page_chunks_for_ingest",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(manual_service, "delete_chunks_from_rag", AsyncMock())
    mark_indexed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_page_chunks_indexed", mark_indexed_mock)
    page_id = uuid4()

    await manual_service.sync_page_rag(_MANUAL_ID, page_id, [])

    mark_indexed_mock.assert_awaited_once()
    assert session.commits == 1


@pytest.mark.anyio
async def test_answer_game_question_rehidrata_contexto_autorizado_y_deduplicado(
    monkeypatch,
):
    """API pide candidatos a Chroma y manda al LLM solo texto autorizado de Postgres."""
    post_json_mock = AsyncMock(
        side_effect=[
            {
                "chunks": [
                    {"id": str(_CHUNK_ID), "score": 0.95, "chunk_index": 0, "source_page": 1},
                    {
                        "id": str(_DUPLICATE_CHUNK_ID),
                        "score": 0.90,
                        "chunk_index": 1,
                        "source_page": 1,
                    },
                    {
                        "id": str(_UNIQUE_CHUNK_ID),
                        "score": 0.85,
                        "chunk_index": 2,
                        "source_page": 2,
                    },
                ]
            },
            {"answer": "Se gana con 10 puntos."},
        ]
    )
    monkeypatch.setattr(retrieval_service.internal_client, "post_json", post_json_mock)
    load_chunks_mock = AsyncMock(
        return_value=[
            AuthorizedChunk(
                id=_CHUNK_ID,
                text="Texto A",
                content_hash="same-hash",
                manual_id=_MANUAL_ID,
                manual_title=_MANUAL_TITLE,
                source_page=1,
                is_own=True,
            ),
            AuthorizedChunk(
                id=_DUPLICATE_CHUNK_ID,
                text="Texto duplicado",
                content_hash="same-hash",
                manual_id=_MANUAL_ID,
                manual_title=_MANUAL_TITLE,
                source_page=1,
                is_own=True,
            ),
            AuthorizedChunk(
                id=_UNIQUE_CHUNK_ID,
                text="Texto B",
                content_hash="unique-hash",
                manual_id=_MANUAL_ID,
                manual_title=_MANUAL_TITLE,
                source_page=2,
                is_own=False,
            ),
        ]
    )
    monkeypatch.setattr(retrieval_service, "load_authorized_chunks", load_chunks_mock)
    monkeypatch.setattr(
        retrieval_service,
        "load_game_retrieval_context",
        AsyncMock(return_value=("Catan", [_MANUAL_ID])),
    )

    session = _session()

    result = await retrieval_service.generate_game_answer(
        session,
        current_user_id=_USER_ID,
        game_id=_GAME_ID,
        question="¿Cómo se gana?",
        top_k=3,
        client=object(),
        language="en",
    )

    assert result == AnswerResponse(
        answer="Se gana con 10 puntos.",
        sources=[
            {"manual_id": _MANUAL_ID, "manual_title": _MANUAL_TITLE, "page": 1, "is_own": True},
            {"manual_id": _MANUAL_ID, "manual_title": _MANUAL_TITLE, "page": 2, "is_own": False},
        ],
    )
    rag_payload = post_json_mock.await_args_list[0].kwargs["payload"]
    llm_payload = post_json_mock.await_args_list[1].kwargs["payload"]
    assert rag_payload["game_id"] == str(_GAME_ID)
    assert rag_payload["manual_ids"] == [str(_MANUAL_ID)]
    assert rag_payload["question"] == "Manual de Catan: ¿Cómo se gana?"
    assert rag_payload["lexical_question"] == "¿Cómo se gana?"
    assert rag_payload["top_k"] == 3
    assert load_chunks_mock.await_args.kwargs["chunk_ids"] == [
        _CHUNK_ID,
        _DUPLICATE_CHUNK_ID,
        _UNIQUE_CHUNK_ID,
    ]
    assert session.rollbacks == 2
    assert "manual_id" not in llm_payload
    assert llm_payload["game_name"] == "Catan"
    assert llm_payload["question"] == "¿Cómo se gana?"
    assert llm_payload["context_chunks"] == ["Texto A", "Texto B"]
    assert llm_payload["language"] == "en"


@pytest.mark.anyio
async def test_answer_game_question_rejects_overlong_llm_answer(monkeypatch):
    """La API valida la respuesta antes de devolverla o persistirla en chats."""
    post_json_mock = AsyncMock(
        side_effect=[
            {"chunks": [{"id": str(_CHUNK_ID)}]},
            {"answer": "x" * (MESSAGE_CONTENT_MAX_LENGTH + 1)},
        ]
    )
    monkeypatch.setattr(retrieval_service.internal_client, "post_json", post_json_mock)
    monkeypatch.setattr(
        retrieval_service,
        "load_authorized_chunks",
        AsyncMock(
            return_value=[
                AuthorizedChunk(
                    id=_CHUNK_ID,
                    text="Texto A",
                    content_hash="hash",
                    manual_id=_MANUAL_ID,
                    manual_title=None,
                    source_page=1,
                    is_own=True,
                )
            ]
        ),
    )
    monkeypatch.setattr(
        retrieval_service,
        "load_game_retrieval_context",
        AsyncMock(return_value=("Catan", [_MANUAL_ID])),
    )
    session = _session()

    with pytest.raises(GeneratedAnswerTooLongError):
        await retrieval_service.generate_game_answer(
            session,
            current_user_id=_USER_ID,
            game_id=_GAME_ID,
            question="¿Cómo se gana?",
            top_k=3,
            client=object(),
        )


@pytest.mark.anyio
async def test_answer_game_question_prefija_la_reformulacion(monkeypatch) -> None:
    """La búsqueda usa el juego y la pregunta reformulada, nunca la original."""
    post_json_mock = AsyncMock(
        side_effect=[
            {"chunks": [{"id": str(_CHUNK_ID)}]},
            {"answer": "Respuesta corta."},
        ]
    )
    monkeypatch.setattr(retrieval_service.internal_client, "post_json", post_json_mock)
    monkeypatch.setattr(
        retrieval_service,
        "load_game_retrieval_context",
        AsyncMock(return_value=("Rummikub", [_MANUAL_ID])),
    )
    monkeypatch.setattr(
        retrieval_service,
        "load_authorized_chunks",
        AsyncMock(
            return_value=[
                AuthorizedChunk(
                    id=_CHUNK_ID,
                    text="Texto A",
                    content_hash="hash",
                    manual_id=_MANUAL_ID,
                    manual_title=None,
                    source_page=1,
                    is_own=True,
                )
            ]
        ),
    )
    session = _session()

    await retrieval_service.generate_game_answer(
        session,
        current_user_id=_USER_ID,
        game_id=_GAME_ID,
        question="¿Y con dos personas?",
        top_k=2,
        client=object(),
        retrieval_question="¿Se puede jugar al Rummikub con dos personas?",
    )

    rag_payload = post_json_mock.await_args_list[0].kwargs["payload"]
    llm_payload = post_json_mock.await_args_list[1].kwargs["payload"]
    assert rag_payload["question"] == (
        "Manual de Rummikub: ¿Se puede jugar al Rummikub con dos personas?"
    )
    assert rag_payload["lexical_question"] == (
        "¿Se puede jugar al Rummikub con dos personas?"
    )
    assert llm_payload["question"] == "¿Y con dos personas?"


@pytest.mark.anyio
async def test_answer_game_question_corta_sin_llamar_a_rag_si_no_hay_manuales(monkeypatch):
    """Sin manuales autorizados se corta en el acto, sin llamar siquiera a RAG."""
    post_json_mock = AsyncMock()
    monkeypatch.setattr(retrieval_service.internal_client, "post_json", post_json_mock)
    monkeypatch.setattr(
        retrieval_service,
        "load_game_retrieval_context",
        AsyncMock(return_value=("Monopoly", [])),
    )
    session = _session()

    with pytest.raises(ManualContextNotFoundError):
        await retrieval_service.generate_game_answer(
            session,
            current_user_id=_USER_ID,
            game_id=_GAME_ID,
            question="¿Cómo se gana?",
            top_k=3,
            client=object(),
        )

    post_json_mock.assert_not_awaited()
    assert session.rollbacks == 1


@pytest.mark.anyio
async def test_answer_game_question_rechaza_ids_invalidos_de_rag(monkeypatch):
    """Un vector corrupto en Chroma no provoca un crash sin controlar."""
    monkeypatch.setattr(
        retrieval_service.internal_client,
        "post_json",
        AsyncMock(return_value={"chunks": [{"id": "no-es-uuid"}]}),
    )
    monkeypatch.setattr(
        retrieval_service,
        "load_game_retrieval_context",
        AsyncMock(return_value=("Catan", [_MANUAL_ID])),
    )
    session = _session()

    with pytest.raises(InternalServiceError):
        await retrieval_service.generate_game_answer(
            session,
            current_user_id=_USER_ID,
            game_id=_GAME_ID,
            question="¿Cómo se gana?",
            top_k=3,
            client=object(),
        )


@pytest.mark.anyio
async def test_delete_manual_soft_deletes_then_cleans_rag_and_files(monkeypatch):
    """El borrado confirma Postgres, limpia storage y devuelve chunks derivados."""
    deleted = DeletedManualAssets(
        manual_id=_MANUAL_ID,
        chunk_ids=[_CHUNK_ID],
        storage_keys=["manuals/user/manual/page-1.jpg"],
    )
    events: list[str] = []
    soft_delete_mock = AsyncMock(
        side_effect=lambda *_args, **_kwargs: events.append("soft_delete") or deleted,
    )
    delete_file_mock = AsyncMock(
        side_effect=lambda *_args, **_kwargs: events.append("delete_file") or True,
    )
    monkeypatch.setattr(manual_service, "soft_delete_user_manual", soft_delete_mock)
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_file_mock)
    session = _session(events)

    chunk_ids = await manual_service.delete_manual(
        session,
        auth=_auth(),
        manual_id=_MANUAL_ID,
    )

    soft_delete_mock.assert_awaited_once_with(
        session,
        owner_user_id=_USER_ID,
        manual_id=_MANUAL_ID,
    )
    assert chunk_ids == [_CHUNK_ID]
    delete_file_mock.assert_awaited_once_with("manuals/user/manual/page-1.jpg")
    assert events == ["soft_delete", "commit", "delete_file"]


@pytest.mark.anyio
async def test_delete_manual_continues_when_file_cleanup_fails(monkeypatch):
    """Un fallo borrando storage no deshace el borrado lógico ya confirmado."""
    deleted = DeletedManualAssets(
        manual_id=_MANUAL_ID,
        chunk_ids=[_CHUNK_ID],
        storage_keys=["manuals/user/manual/page-1.jpg"],
    )
    monkeypatch.setattr(
        manual_service,
        "soft_delete_user_manual",
        AsyncMock(return_value=deleted),
    )
    delete_file_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_file_mock)

    session = _session()
    chunk_ids = await manual_service.delete_manual(
        session,
        auth=_auth(),
        manual_id=_MANUAL_ID,
    )

    assert chunk_ids == [_CHUNK_ID]
    delete_file_mock.assert_awaited_once_with("manuals/user/manual/page-1.jpg")
    assert session.commits == 1


def _auth():
    """Crea un objeto de auth mínimo para casos de uso de manuales."""
    return SimpleNamespace(user=SimpleNamespace(id=_USER_ID))


def _session(events: list[str] | None = None):
    """Crea una sesión falsa con fronteras transaccionales observables."""

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1
        if events is not None:
            events.append("commit")

    async def rollback():
        await anyio.lowlevel.checkpoint()
        session.rollbacks += 1
        if events is not None:
            events.append("rollback")

    session = SimpleNamespace(commits=0, rollbacks=0)
    session.commit = commit
    session.rollback = rollback
    return session


class _AsyncContext:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False


def _patch_process_resources(monkeypatch, *, session, client) -> None:
    """Inyecta recursos propios del procesador en segundo plano."""
    monkeypatch.setattr(manual_service, "manual_lock", lambda _manual_id: _AsyncContext(session))
    _patch_http_client(monkeypatch, client=client)


def _patch_sessionmaker(monkeypatch, *, session) -> None:
    """Inyecta una sesión fake para servicios que abren su propia unidad de trabajo."""
    monkeypatch.setattr(manual_service, "get_sessionmaker", lambda: lambda: _AsyncContext(session))


def _patch_http_client(monkeypatch, *, client) -> None:
    """Inyecta un cliente HTTP fake para servicios que llaman a OCR/RAG."""
    monkeypatch.setattr(
        manual_service.httpx,
        "AsyncClient",
        lambda **_kwargs: _AsyncContext(client),
    )


def _patch_claimed_page(monkeypatch, *, session, client, manual, page):
    """Prepara una task de página ya reclamada para centrar cada test en su rama."""
    _patch_sessionmaker(monkeypatch, session=session)
    _patch_http_client(monkeypatch, client=client)
    claim_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(manual_service, "claim_page_for_processing", claim_mock)
    monkeypatch.setattr(manual_service, "get_manual_for_processing", AsyncMock(return_value=manual))
    monkeypatch.setattr(manual_service, "get_page_for_processing", AsyncMock(return_value=page))
    return claim_mock


def _patch_no_reusable_page(monkeypatch) -> None:
    """Fuerza la ruta normal de OCR cuando no hay página canónica previa."""
    monkeypatch.setattr(
        manual_service,
        "find_reusable_page_result",
        AsyncMock(return_value=None),
    )


def _manual(
    *,
    source_type: str,
    source_asset_id=None,
    language: str | None = "es",
):
    """Construye un manual mínimo para el pipeline de procesamiento."""
    return SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_USER_ID,
        language=language,
        status="indexing",
        source_type=source_type,
        source_asset_id=source_asset_id,
    )


def _image_page(*, page_id, page_number: int):
    """Construye una página con imagen ya persistida en storage."""
    return ManualPageForProcessing(
        id=page_id,
        page_number=page_number,
        storage_key=f"manuals/user/manual/page-{page_number}.jpg",
        mime_type="image/jpeg",
        byte_size=11,
        width=10,
        height=10,
        sha256="f" * 64,
    )


def _pdf_page(*, page_id, page_number: int):
    """Construye una página PDF aún sin imagen renderizada."""
    return ManualPageForProcessing(
        id=page_id,
        page_number=page_number,
        storage_key=None,
        mime_type=None,
        byte_size=None,
        width=None,
        height=None,
        sha256=None,
    )


def _reusable_page_result():
    """Construye una página canónica encontrada por huella."""
    return SimpleNamespace(
        page_id=uuid4(),
        ocr_lines=[{"text": "Regla reutilizada.", "confidence": 0.8}],
        text_source="ocr",
        text_quality="ok",
        ocr_confidence_mean=0.8,
        chunk_texts=["Regla reutilizada."],
    )


def _validated_image() -> ValidatedManualImage:
    """Devuelve una imagen validada mínima para el servicio."""
    return ValidatedManualImage(
        path=Path("image.jpg"),
        byte_size=len(b"image-bytes"),
        mime_type="image/jpeg",
        extension=".jpg",
        width=10,
        height=10,
        sha256="f" * 64,
    )


def _upload_file(data: bytes, *, filename: str, mime_type: str) -> UploadFile:
    """Crea un UploadFile real con metadatos coherentes."""
    return UploadFile(
        file=BytesIO(data),
        filename=filename,
        size=len(data),
        headers=Headers({"content-type": mime_type}),
    )


def _blank_pdf_bytes(tmp_path: Path) -> bytes:
    """Genera un PDFium real de una página para pruebas de frontera."""
    path = tmp_path / "source.pdf"
    document = pdfium.PdfDocument.new()
    document.new_page(72, 72)
    try:
        document.save(path)
    finally:
        document.close()
    return path.read_bytes()


@pytest.mark.parametrize(
    ("inventory", "expected", "alive", "plan_esperado"),
    [
        pytest.param(
            {"manual-sin-deriva": ["chunk-beta", "chunk-alfa"]},
            {"manual-sin-deriva": {"chunk-alfa", "chunk-beta"}},
            {"manual-sin-deriva"},
            ReconciliationPlan(orphan_chunk_ids={}, stale_manual_ids=[]),
            id="sin_deriva",
        ),
        pytest.param(
            {"manual-borrado": ["chunk-zeta", "chunk-gamma"]},
            {},
            set(),
            ReconciliationPlan(
                orphan_chunk_ids={
                    "manual-borrado": ["chunk-gamma", "chunk-zeta"],
                },
                stale_manual_ids=[],
            ),
            id="manual_borrado_huerfano",
        ),
        pytest.param(
            {"manual-indexando": ["chunk-temporal"]},
            {},
            {"manual-indexando"},
            ReconciliationPlan(orphan_chunk_ids={}, stale_manual_ids=[]),
            id="manual_vivo_en_zona_gris",
        ),
        pytest.param(
            {"manual-incompleto": ["chunk-presente"]},
            {
                "manual-incompleto": {
                    "chunk-presente",
                    "chunk-ausente",
                }
            },
            {"manual-incompleto"},
            ReconciliationPlan(
                orphan_chunk_ids={},
                stale_manual_ids=["manual-incompleto"],
            ),
            id="chunk_faltante",
        ),
        pytest.param(
            {
                "manual-con-sobrante": [
                    "chunk-valido",
                    "chunk-sobrante",
                ]
            },
            {"manual-con-sobrante": {"chunk-valido"}},
            {"manual-con-sobrante"},
            ReconciliationPlan(
                orphan_chunk_ids={},
                stale_manual_ids=["manual-con-sobrante"],
            ),
            id="chunk_sobrante",
        ),
        pytest.param(
            {},
            {
                "manual-zeta": {"chunk-zeta"},
                "manual-alfa": {"chunk-alfa"},
            },
            {"manual-zeta", "manual-alfa"},
            ReconciliationPlan(
                orphan_chunk_ids={},
                stale_manual_ids=["manual-alfa", "manual-zeta"],
            ),
            id="inventario_vacio_con_esperados",
        ),
        pytest.param(
            {"manual-vaciado": ["chunk-viejo-b", "chunk-viejo-a"]},
            {"manual-vaciado": set()},
            {"manual-vaciado"},
            ReconciliationPlan(
                orphan_chunk_ids={
                    "manual-vaciado": ["chunk-viejo-a", "chunk-viejo-b"],
                },
                stale_manual_ids=[],
            ),
            id="esperado_sin_chunks_con_vectores",
        ),
        pytest.param(
            {"identificador-invalido": ["chunk-invalido"]},
            {},
            set(),
            ReconciliationPlan(
                orphan_chunk_ids={
                    "identificador-invalido": ["chunk-invalido"],
                },
                stale_manual_ids=[],
            ),
            id="identificador_malformado_huerfano",
        ),
    ],
)
def test_plan_rag_reconciliation_clasifica_la_deriva(
    inventory: dict[str, list[str]],
    expected: dict[str, set[str]],
    alive: set[str],
    plan_esperado: ReconciliationPlan,
) -> None:
    """El plan clasifica el desfase sin modificar manuales vivos de la zona gris."""
    plan = manual_service.plan_rag_reconciliation(
        inventory=inventory,
        expected=expected,
        alive=alive,
    )

    assert plan == plan_esperado


def _patch_manual_lock(
    monkeypatch: pytest.MonkeyPatch,
    *,
    session: object,
) -> None:
    """Sustituye el lock por manual por un contexto que entrega la sesión dada.

    Args:
        monkeypatch (pytest.MonkeyPatch): Parcheador del test.
        session (object): Sesión falsa que debe recibir la reingesta.
    """

    @asynccontextmanager
    async def lock(_manual_id):
        yield session

    monkeypatch.setattr(manual_service, "manual_lock", lock)


def _patch_reindex_http_client(
    monkeypatch: pytest.MonkeyPatch,
    *,
    client: object,
) -> None:
    """Sustituye el cliente HTTP interno por un contexto asíncrono."""
    monkeypatch.setattr(
        manual_service,
        "_internal_http_client",
        lambda: _AsyncContext(client),
    )


def _fail_if_reindex_opens_http() -> _AsyncContext:
    """Falla si la reindexación intenta abrir el cliente HTTP."""
    raise AssertionError("No debía abrirse el cliente HTTP")


@pytest.mark.anyio
async def test_reindex_manual_reingesta_chunks_y_persiste_indice(monkeypatch) -> None:
    """Un manual indexable conserva en Postgres el resultado devuelto por RAG."""
    session = _session()
    manual = SimpleNamespace(status="active", deleted_at=None)
    chunk_id = uuid4()
    chunks = [SimpleNamespace(id=chunk_id)]
    client = object()
    response = {
        "chunk_ids": [str(chunk_id)],
        "chunks_indexed": 1,
        "embedding_model": "test-embedding",
        "indexed_at": "2026-08-16T10:00:00+00:00",
    }
    _patch_manual_lock(monkeypatch, session=session)
    _patch_reindex_http_client(monkeypatch, client=client)
    get_mock = AsyncMock(return_value=manual)
    chunks_mock = AsyncMock(return_value=chunks)
    index_mock = AsyncMock(return_value=response)
    mark_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_mock)
    monkeypatch.setattr(manual_service, "list_manual_chunks_for_ingest", chunks_mock)
    monkeypatch.setattr(manual_service, "_index_manual_in_rag", index_mock)
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_mock)

    await manual_service.reindex_manual(_MANUAL_ID)

    get_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    chunks_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    index_mock.assert_awaited_once_with(client=client, manual=manual, chunks=chunks)
    mark_mock.assert_awaited_once()
    assert mark_mock.await_args.args == (session,)
    assert mark_mock.await_args.kwargs["manual_id"] == _MANUAL_ID
    assert mark_mock.await_args.kwargs["chunk_ids"] == {chunk_id}
    assert mark_mock.await_args.kwargs["embedding_model"] == "test-embedding"
    assert (
        mark_mock.await_args.kwargs["indexed_at"].isoformat()
        == "2026-08-16T10:00:00+00:00"
    )
    assert session.commits == 1


@pytest.mark.parametrize(
    "manual",
    [
        pytest.param(None, id="inexistente"),
        pytest.param(
            SimpleNamespace(status="active", deleted_at=object()),
            id="borrado",
        ),
        pytest.param(
            SimpleNamespace(status="indexing", deleted_at=None),
            id="zona-gris",
        ),
    ],
)
@pytest.mark.anyio
async def test_reindex_manual_ignora_manuales_fuera_del_indice(
    monkeypatch,
    manual: SimpleNamespace | None,
) -> None:
    """Los manuales no indexables no consultan chunks ni abren la frontera HTTP."""
    session = _session()
    _patch_manual_lock(monkeypatch, session=session)
    get_mock = AsyncMock(return_value=manual)
    chunks_mock = AsyncMock(return_value=[SimpleNamespace(id=uuid4())])
    index_mock = AsyncMock()
    mark_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_mock)
    monkeypatch.setattr(manual_service, "list_manual_chunks_for_ingest", chunks_mock)
    monkeypatch.setattr(
        manual_service,
        "_internal_http_client",
        _fail_if_reindex_opens_http,
    )
    monkeypatch.setattr(manual_service, "_index_manual_in_rag", index_mock)
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_mock)

    await manual_service.reindex_manual(_MANUAL_ID)

    get_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    chunks_mock.assert_not_awaited()
    index_mock.assert_not_awaited()
    mark_mock.assert_not_awaited()
    assert session.commits == 0


@pytest.mark.anyio
async def test_reindex_manual_sin_chunks_no_abre_la_frontera_http(monkeypatch) -> None:
    """Un manual sin chunks termina sin llamar a RAG ni persistir cambios."""
    session = _session()
    manual = SimpleNamespace(status="active", deleted_at=None)
    _patch_manual_lock(monkeypatch, session=session)
    get_mock = AsyncMock(return_value=manual)
    chunks_mock = AsyncMock(return_value=[])
    index_mock = AsyncMock()
    mark_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_mock)
    monkeypatch.setattr(manual_service, "list_manual_chunks_for_ingest", chunks_mock)
    monkeypatch.setattr(
        manual_service,
        "_internal_http_client",
        _fail_if_reindex_opens_http,
    )
    monkeypatch.setattr(manual_service, "_index_manual_in_rag", index_mock)
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_mock)

    await manual_service.reindex_manual(_MANUAL_ID)

    get_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    chunks_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)
    index_mock.assert_not_awaited()
    mark_mock.assert_not_awaited()
    assert session.commits == 0


@pytest.mark.anyio
async def test_reindex_manual_registra_api_error_y_permite_reintento(
    monkeypatch,
    caplog,
) -> None:
    """Un fallo controlado de RAG se registra sin propagarse ni confirmar cambios."""
    session = _session()
    manual = SimpleNamespace(status="active", deleted_at=None)
    chunks = [SimpleNamespace(id=uuid4())]
    client = object()
    _patch_manual_lock(monkeypatch, session=session)
    _patch_reindex_http_client(monkeypatch, client=client)
    get_mock = AsyncMock(return_value=manual)
    chunks_mock = AsyncMock(return_value=chunks)
    index_mock = AsyncMock(side_effect=InternalServiceError("detalle interno"))
    mark_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_mock)
    monkeypatch.setattr(manual_service, "list_manual_chunks_for_ingest", chunks_mock)
    monkeypatch.setattr(manual_service, "_index_manual_in_rag", index_mock)
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_mock)

    with caplog.at_level("WARNING", logger=manual_service.__name__):
        await manual_service.reindex_manual(_MANUAL_ID)

    index_mock.assert_awaited_once_with(client=client, manual=manual, chunks=chunks)
    mark_mock.assert_not_awaited()
    assert session.commits == 0
    assert str(_MANUAL_ID) in caplog.text
    assert "No se pudo reindexar" in caplog.text


_RECONCILIATION_MANUAL_A = UUID("11111111-1111-4111-8111-111111111111")
_RECONCILIATION_MANUAL_B = UUID("22222222-2222-4222-8222-222222222222")
_RECONCILIATION_ORPHAN = UUID("99999999-9999-4999-8999-999999999999")
_RECONCILIATION_CHUNK_A = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
_RECONCILIATION_CHUNK_B = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
_RECONCILIATION_ORPHAN_CHUNK = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")


@pytest.mark.anyio
@pytest.mark.parametrize(
    (
        "inventory",
        "expected_rows",
        "alive_rows",
        "expected_orphan_chunk_ids",
        "expected_stale_manual_ids",
    ),
    [
        (
            {
                str(_RECONCILIATION_ORPHAN): [str(_RECONCILIATION_ORPHAN_CHUNK)],
                str(_RECONCILIATION_MANUAL_A): [str(_RECONCILIATION_CHUNK_B)],
            },
            {
                _RECONCILIATION_MANUAL_A: {_RECONCILIATION_CHUNK_A},
            },
            {_RECONCILIATION_MANUAL_A},
            {
                str(_RECONCILIATION_ORPHAN): [str(_RECONCILIATION_ORPHAN_CHUNK)],
            },
            [str(_RECONCILIATION_MANUAL_A)],
        ),
        (
            {
                str(_RECONCILIATION_MANUAL_A): [str(_RECONCILIATION_CHUNK_A)],
                str(_RECONCILIATION_MANUAL_B): [],
            },
            {
                _RECONCILIATION_MANUAL_A: {_RECONCILIATION_CHUNK_A},
                _RECONCILIATION_MANUAL_B: set(),
            },
            {
                _RECONCILIATION_MANUAL_A,
                _RECONCILIATION_MANUAL_B,
            },
            {},
            [],
        ),
    ],
    ids=["indice-desfasado", "indice-sincronizado"],
)
async def test_plan_index_repair_construye_y_registra_el_plan(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    inventory: dict[str, list[str]],
    expected_rows: dict[UUID, set[UUID]],
    alive_rows: set[UUID],
    expected_orphan_chunk_ids: dict[str, list[str]],
    expected_stale_manual_ids: list[str],
) -> None:
    """La planificación combina RAG y Postgres y registra su informe."""
    http_client = MagicMock()
    http_context = MagicMock()
    http_context.__aenter__.return_value = http_client
    http_context.__aexit__.return_value = False
    http_client_factory = MagicMock(return_value=http_context)
    get_json_mock = AsyncMock(return_value={"manuals": inventory})

    session = MagicMock()
    session_context = MagicMock()
    session_context.__aenter__.return_value = session
    session_context.__aexit__.return_value = False
    session_factory = MagicMock(return_value=session_context)
    expected_query = AsyncMock(return_value=expected_rows)
    alive_query = AsyncMock(return_value=alive_rows)

    monkeypatch.setattr(manual_service, "_internal_http_client", http_client_factory)
    monkeypatch.setattr(manual_service.internal_client, "get_json", get_json_mock)
    monkeypatch.setattr(manual_service, "get_sessionmaker", lambda: session_factory)
    monkeypatch.setattr(manual_service, "list_expected_chunk_ids", expected_query)
    monkeypatch.setattr(manual_service, "list_alive_manual_ids", alive_query)

    with caplog.at_level("INFO", logger=manual_service.__name__):
        plan = await manual_service.plan_index_repair()

    assert plan.orphan_chunk_ids == expected_orphan_chunk_ids
    assert plan.stale_manual_ids == expected_stale_manual_ids
    assert f"huérfanos={len(expected_orphan_chunk_ids)}" in caplog.text
    assert f"desfasados={len(expected_stale_manual_ids)}" in caplog.text
    reported_ids = set(expected_orphan_chunk_ids) | set(expected_stale_manual_ids)
    for manual_id in sorted(reported_ids):
        assert manual_id in caplog.text

    http_client_factory.assert_called_once_with()
    get_json_mock.assert_awaited_once_with(
        client=http_client,
        service_name="RAG",
        url=f"{manual_service.config.RAG_URL}/inventory",
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail="Error interno al consultar el inventario RAG.",
    )
    session_factory.assert_called_once_with()
    expected_query.assert_awaited_once_with(session)
    alive_query.assert_awaited_once_with(session)


@pytest.mark.anyio
async def test_reindex_manual_respeta_el_lock_ocupado(monkeypatch) -> None:
    """Si otro proceso tiene el manual, la reingesta se retira sin tocar nada."""

    @asynccontextmanager
    async def lock_ocupado(_manual_id):
        yield None

    monkeypatch.setattr(manual_service, "manual_lock", lock_ocupado)
    get_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_mock)

    await manual_service.reindex_manual(_MANUAL_ID)

    get_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_plan_index_repair_ignora_inventario_malformado(monkeypatch, caplog) -> None:
    """Un inventario sin la forma esperada deja aviso y un plan vacío."""
    client = object()
    _patch_reindex_http_client(monkeypatch, client=client)
    monkeypatch.setattr(
        manual_service.internal_client,
        "get_json",
        AsyncMock(return_value={"otra_clave": []}),
    )
    consulta_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "list_expected_chunk_ids", consulta_mock)

    with caplog.at_level("WARNING", logger=manual_service.__name__):
        plan = await manual_service.plan_index_repair()

    assert plan == ReconciliationPlan(orphan_chunk_ids={}, stale_manual_ids=[])
    consulta_mock.assert_not_awaited()
    assert "malformado" in caplog.text


@pytest.mark.anyio
async def test_plan_index_repair_devuelve_plan_vacio_si_rag_no_responde(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Un fallo transitorio de RAG aplaza la reparación sin consultar Postgres."""
    http_client = MagicMock()
    http_context = MagicMock()
    http_context.__aenter__.return_value = http_client
    http_context.__aexit__.return_value = False
    http_client_factory = MagicMock(return_value=http_context)
    get_json_mock = AsyncMock(
        side_effect=api_exceptions.InternalServiceUnavailableError(
            "Servicio RAG no disponible."
        )
    )
    session_factory = MagicMock()
    expected_query = AsyncMock()
    alive_query = AsyncMock()

    monkeypatch.setattr(manual_service, "_internal_http_client", http_client_factory)
    monkeypatch.setattr(manual_service.internal_client, "get_json", get_json_mock)
    monkeypatch.setattr(manual_service, "get_sessionmaker", lambda: session_factory)
    monkeypatch.setattr(manual_service, "list_expected_chunk_ids", expected_query)
    monkeypatch.setattr(manual_service, "list_alive_manual_ids", alive_query)

    with caplog.at_level("WARNING", logger=manual_service.__name__):
        plan = await manual_service.plan_index_repair()

    assert plan.orphan_chunk_ids == {}
    assert plan.stale_manual_ids == []
    assert "No se pudo consultar el inventario RAG" in caplog.text
    session_factory.assert_not_called()
    expected_query.assert_not_awaited()
    alive_query.assert_not_awaited()
