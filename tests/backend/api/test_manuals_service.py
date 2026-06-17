from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import httpx
import pytest
from sqlalchemy.exc import SQLAlchemyError

import api.manuals.retrieval.service as retrieval_service
import api.manuals.service as manual_service
from api.exceptions import InternalServiceError, ManualPageLimitExceededError
from api.manuals.exceptions import GeneratedAnswerTooLongError, ManualTooLargeError
from api.manuals.repository import AuthorizedChunk, DeletedManualAssets
from api.manuals.schemas import GAME_QUESTION_TOP_K_MAX, AnswerResponse
from api.manuals.validation import ValidatedManualImage
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
    """El sobre-fetch que pide API nunca supera el máximo aceptado por RAG."""
    assert GAME_QUESTION_TOP_K_MAX * manual_service.config.RAG_RETRIEVAL_MULTIPLIER <= (
        RAG_RETRIEVAL_TOP_K_MAX
    )


@pytest.mark.anyio
async def test_create_manual_acepta_imagenes_y_crea_paginas_pending(monkeypatch):
    """El caso de uso deja el trabajo pesado para el procesador en segundo plano."""
    session = object()
    image = SimpleNamespace(filename="manual.jpg")
    validated_image = _validated_image()
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=validated_image),
    )
    save_mock = AsyncMock(return_value="manuals/user/manual/page-1.jpg")
    monkeypatch.setattr(manual_service, "save_manual_image", save_mock)
    create_mock = AsyncMock(return_value=SimpleNamespace(id=_MANUAL_ID))
    monkeypatch.setattr(manual_service, "create_manual_with_pending_pages", create_mock)
    auto_follow_mock = AsyncMock()
    monkeypatch.setattr(manual_service.games_repository, "auto_follow_game", auto_follow_mock)
    run_ocr_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)

    result = await manual_service.create_manual(
        session,
        auth=_auth(),
        game_id=_GAME_ID,
        title=" Manual base ",
        visibility="shared",
        language=" es ",
        images=[image],
        pdf=None,
    )

    assert result.manual_id == _MANUAL_ID
    assert result.game_id == _GAME_ID
    assert result.status == "indexing"
    assert result.visibility == "shared"
    assert result.source_type == "images"
    assert result.page_count == 1
    run_ocr_mock.assert_not_awaited()
    save_mock.assert_awaited_once()
    create_mock.assert_awaited_once()
    create_kwargs = create_mock.await_args.kwargs
    assert create_kwargs["title"] == "Manual base"
    assert create_kwargs["language"] == "es"
    assert create_kwargs["source_type"] == "images"
    assert create_kwargs["page_count"] == 1
    assert create_kwargs["images"][0].storage_key == "manuals/user/manual/page-1.jpg"
    auto_follow_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )


@pytest.mark.anyio
async def test_create_manual_borra_fichero_si_falla_postgres(monkeypatch):
    """Si falla la persistencia, se elimina el fichero ya escrito en storage."""
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=_validated_image()),
    )
    monkeypatch.setattr(
        manual_service,
        "save_manual_image",
        AsyncMock(return_value="manuals/user/manual/page-1.jpg"),
    )
    monkeypatch.setattr(
        manual_service,
        "create_manual_with_pending_pages",
        AsyncMock(side_effect=SQLAlchemyError("fallo db")),
    )
    delete_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_mock)

    with pytest.raises(SQLAlchemyError, match="fallo db"):
        await manual_service.create_manual(
            object(),
            auth=_auth(),
            game_id=_GAME_ID,
            title=None,
            visibility="private",
            language=None,
            images=[SimpleNamespace(filename="manual.jpg")],
            pdf=None,
        )

    delete_mock.assert_awaited_once_with("manuals/user/manual/page-1.jpg")


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("page_count", "accepted"),
    [(29, True), (30, True), (31, False)],
    ids=["29_paginas", "30_paginas", "31_paginas"],
)
async def test_store_images_page_count_bva(monkeypatch, page_count, accepted):
    """BVA de páginas por imágenes: se aceptan 30 y se rechazan 31."""
    monkeypatch.setattr(manual_service.config, "MAX_MANUAL_PAGES", 30)
    validate_mock = AsyncMock(return_value=_validated_image())
    save_mock = AsyncMock(side_effect=[f"page-{index}.jpg" for index in range(page_count)])
    monkeypatch.setattr(manual_service, "validate_manual_image", validate_mock)
    monkeypatch.setattr(manual_service, "save_manual_image", save_mock)
    images = [SimpleNamespace(filename=f"page-{index}.jpg") for index in range(page_count)]

    if accepted:
        stored = await manual_service._store_images(owner_user_id=_USER_ID, images=images)
        assert len(stored) == page_count
        assert validate_mock.await_count == page_count
        assert save_mock.await_count == page_count
    else:
        with pytest.raises(ManualPageLimitExceededError):
            await manual_service._store_images(owner_user_id=_USER_ID, images=images)
        validate_mock.assert_not_awaited()
        save_mock.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("total_size", "accepted"),
    [(9, True), (10, True), (11, False)],
    ids=["limite_menos_1", "limite_exacto", "limite_mas_1"],
)
async def test_store_images_total_size_bva(monkeypatch, total_size, accepted):
    """BVA del tamaño total de imágenes: el agregado corta en límite + 1."""
    monkeypatch.setattr(manual_service.config, "MAX_MANUAL_TOTAL_SIZE", 10)
    validate_mock = AsyncMock(return_value=_validated_image(content=b"x" * total_size))
    save_mock = AsyncMock(return_value="page-1.jpg")
    monkeypatch.setattr(manual_service, "validate_manual_image", validate_mock)
    monkeypatch.setattr(manual_service, "save_manual_image", save_mock)

    if accepted:
        stored = await manual_service._store_images(
            owner_user_id=_USER_ID,
            images=[SimpleNamespace(filename="page-1.jpg")],
        )
        assert len(stored) == 1
        save_mock.assert_awaited_once()
    else:
        with pytest.raises(ManualTooLargeError):
            await manual_service._store_images(
                owner_user_id=_USER_ID,
                images=[SimpleNamespace(filename="page-1.jpg")],
            )
        save_mock.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("pdf_size", "accepted"),
    [(9, True), (10, True), (11, False)],
    ids=["limite_menos_1", "limite_exacto", "limite_mas_1"],
)
async def test_store_pdf_total_size_bva(monkeypatch, pdf_size, accepted):
    """BVA del tamaño total para PDF ya validado antes de persistirlo."""
    validated_pdf = SimpleNamespace(content=b"x" * pdf_size, page_count=1)
    monkeypatch.setattr(manual_service.config, "MAX_MANUAL_TOTAL_SIZE", 10)
    monkeypatch.setattr(
        manual_service,
        "validate_manual_pdf",
        AsyncMock(return_value=validated_pdf),
    )
    save_mock = AsyncMock(return_value="manual.pdf")
    monkeypatch.setattr(manual_service, "save_manual_pdf", save_mock)

    if accepted:
        stored_images, source_pdf, source_type, page_count = await manual_service._store_upload(
            owner_user_id=_USER_ID,
            images=None,
            pdf=SimpleNamespace(filename="manual.pdf"),
        )
        assert stored_images == []
        assert source_pdf is not None
        assert source_type == "pdf"
        assert page_count == 1
        save_mock.assert_awaited_once()
    else:
        with pytest.raises(ManualTooLargeError):
            await manual_service._store_upload(
                owner_user_id=_USER_ID,
                images=None,
                pdf=SimpleNamespace(filename="manual.pdf"),
            )
        save_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_process_manual_devuelve_paginas_pending_para_celery(monkeypatch):
    """El orquestador solo lista páginas pendientes y no hace OCR en el request."""
    session = object()
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
async def test_process_manual_page_reclama_pagina_y_ejecuta_ocr(monkeypatch):
    """Una task de página reclama pending -> processing y persiste OCR/chunks."""
    session = object()
    client = object()
    page_id = uuid4()
    manual = _manual(source_type="images")
    page = _image_page(page_id=page_id, page_number=1)
    _patch_sessionmaker(monkeypatch, session=session)
    _patch_http_client(monkeypatch, client=client)
    claim_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(manual_service, "claim_page_for_processing", claim_mock)
    monkeypatch.setattr(manual_service, "get_manual_for_processing", AsyncMock(return_value=manual))
    monkeypatch.setattr(manual_service, "get_page_for_processing", AsyncMock(return_value=page))
    read_stored_file_mock = AsyncMock(return_value=b"image-bytes")
    monkeypatch.setattr(manual_service, "read_stored_file", read_stored_file_mock)
    run_ocr_mock = AsyncMock(return_value=_OCR_LINES)
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    claim_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID, page_id=page_id)
    replace_mock.assert_awaited_once()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["text_quality"] == "ok"
    assert replace_kwargs["chunks"][0].source_page == 1
    assert replace_kwargs["chunks"][0].chunk_index == 0
    read_stored_file_mock.assert_awaited_once_with(page.storage_key)
    assert run_ocr_mock.await_args.kwargs["filename"] == "page-1.jpg"
    assert run_ocr_mock.await_args.kwargs["client"] is client
    ocr_image = run_ocr_mock.await_args.kwargs["image"]
    assert ocr_image.content == b"image-bytes"
    assert ocr_image.sha256 == page.sha256
    assert ocr_image.width == page.width
    assert ocr_image.height == page.height


@pytest.mark.anyio
async def test_process_manual_page_no_toca_nada_si_no_reclama(monkeypatch):
    """Si otro worker ya ganó la página, esta task queda en no-op idempotente."""
    session = object()
    _patch_sessionmaker(monkeypatch, session=session)
    monkeypatch.setattr(manual_service, "claim_page_for_processing", AsyncMock(return_value=False))
    get_manual_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_manual_mock)

    await manual_service.process_manual_page(_MANUAL_ID, uuid4())

    get_manual_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_process_manual_page_hace_rollback_antes_de_marcar_pagina_fallida(monkeypatch):
    """Tras un fallo SQL, la sesión debe limpiarse antes de seguir usándola."""
    events: list[str] = []
    page_id = uuid4()
    session = SimpleNamespace(rollback=AsyncMock(side_effect=lambda: events.append("rollback")))
    _patch_sessionmaker(monkeypatch, session=session)
    _patch_http_client(monkeypatch, client=object())
    monkeypatch.setattr(manual_service, "claim_page_for_processing", AsyncMock(return_value=True))
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="images")),
    )
    monkeypatch.setattr(
        manual_service,
        "get_page_for_processing",
        AsyncMock(return_value=_image_page(page_id=page_id, page_number=1)),
    )
    monkeypatch.setattr(manual_service, "read_stored_file", AsyncMock(return_value=b"image-bytes"))
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

    assert events == ["rollback", "mark_page_failed"]


@pytest.mark.anyio
async def test_finalize_manual_no_cierra_si_quedan_paginas_abiertas(monkeypatch):
    """El finalizador es idempotente y espera a pending/processing."""
    session = object()
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
async def test_process_manual_page_usa_texto_pdf_aprovechable_sin_ocr(monkeypatch):
    """Una página PDF con texto bueno no se degrada pasándola por OCR."""
    session = object()
    client = object()
    page_id = uuid4()
    source_asset_id = uuid4()
    manual = _manual(source_type="pdf", source_asset_id=source_asset_id)
    text = " ".join(f"regla-{index}" for index in range(40))
    _patch_sessionmaker(monkeypatch, session=session)
    _patch_http_client(monkeypatch, client=client)
    monkeypatch.setattr(manual_service, "claim_page_for_processing", AsyncMock(return_value=True))
    monkeypatch.setattr(manual_service, "get_manual_for_processing", AsyncMock(return_value=manual))
    monkeypatch.setattr(
        manual_service,
        "get_page_for_processing",
        AsyncMock(return_value=_pdf_page(page_id=page_id, page_number=1)),
    )
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    monkeypatch.setattr(manual_service, "read_stored_file", AsyncMock(return_value=b"%PDF-"))
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=text))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda value: value == text)
    run_ocr_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    render_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "render_pdf_page", render_mock)
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["ocr_lines"] == [{"text": text, "confidence": None}]
    assert replace_kwargs["text_source"] == "pdf_text"
    assert replace_kwargs["ocr_confidence_mean"] is None
    run_ocr_mock.assert_not_awaited()
    render_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_process_manual_page_renderiza_pdf_si_el_texto_no_es_aprovechable(monkeypatch):
    """Una página PDF sin texto bueno se renderiza y sigue el OCR normal."""
    session = object()
    client = object()
    page_id = uuid4()
    image = _validated_image()
    _patch_sessionmaker(monkeypatch, session=session)
    _patch_http_client(monkeypatch, client=client)
    monkeypatch.setattr(manual_service, "claim_page_for_processing", AsyncMock(return_value=True))
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_manual(source_type="pdf", source_asset_id=uuid4())),
    )
    monkeypatch.setattr(
        manual_service,
        "get_page_for_processing",
        AsyncMock(return_value=_pdf_page(page_id=page_id, page_number=2)),
    )
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    monkeypatch.setattr(manual_service, "read_stored_file", AsyncMock(return_value=b"%PDF-"))
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=""))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda _value: False)
    monkeypatch.setattr(manual_service, "render_pdf_page", AsyncMock(return_value=image))
    save_mock = AsyncMock(return_value="manuals/user/manual/page-2.jpg")
    monkeypatch.setattr(manual_service, "save_manual_image", save_mock)
    attach_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "attach_page_image_asset", attach_mock)
    run_ocr_mock = AsyncMock(return_value=_OCR_LINES)
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)

    await manual_service.process_manual_page(_MANUAL_ID, page_id)

    save_mock.assert_awaited_once_with(image, owner_user_id=_USER_ID, page_number=2)
    attach_mock.assert_awaited_once()
    assert attach_mock.await_args.kwargs["storage_key"] == "manuals/user/manual/page-2.jpg"
    assert attach_mock.await_args.kwargs["image"] is image
    assert run_ocr_mock.await_args.kwargs["image"] is image
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["chunks"][0].source_page == 2


@pytest.mark.anyio
async def test_finalize_manual_marca_failed_si_rag_responde_payload_invalido(monkeypatch):
    """Un fallo de indexado deja el manual marcado para reintento."""
    session = object()
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
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_failed", mark_failed_mock)

    with pytest.raises(InternalServiceError):
        await manual_service.finalize_manual(_MANUAL_ID)

    mark_failed_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)


@pytest.mark.anyio
async def test_recover_stale_manual_pages_usa_cutoff_del_hard_limit(monkeypatch):
    """El sweeper falla páginas abandonadas con margen sobre el hard limit."""
    session = object()
    _patch_sessionmaker(monkeypatch, session=session)
    mark_mock = AsyncMock(return_value=[_MANUAL_ID])
    monkeypatch.setattr(manual_service, "mark_stale_processing_pages_failed", mark_mock)

    result = await manual_service.recover_stale_manual_pages()

    assert result == [_MANUAL_ID]
    cutoff = mark_mock.await_args.kwargs["cutoff"]
    assert cutoff.tzinfo is not None
    assert cutoff < manual_service.datetime.now(manual_service.UTC)


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

    session = _session()

    result = await retrieval_service.generate_game_answer(
        session,
        current_user_id=_USER_ID,
        game_id=_GAME_ID,
        question="¿Cómo se gana?",
        top_k=2,
        client=object(),
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
    assert rag_payload["top_k"] == 8
    assert load_chunks_mock.await_args.kwargs["chunk_ids"] == [
        _CHUNK_ID,
        _DUPLICATE_CHUNK_ID,
        _UNIQUE_CHUNK_ID,
    ]
    assert session.rollbacks == 1
    assert "manual_id" not in llm_payload
    assert llm_payload["context_chunks"] == ["Texto A", "Texto B"]


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

    with pytest.raises(GeneratedAnswerTooLongError):
        await retrieval_service.generate_game_answer(
            _session(),
            current_user_id=_USER_ID,
            game_id=_GAME_ID,
            question="¿Cómo se gana?",
            top_k=3,
            client=object(),
        )


@pytest.mark.anyio
async def test_answer_game_question_rechaza_ids_invalidos_de_rag(monkeypatch):
    """Un vector corrupto en Chroma no provoca un crash sin controlar."""
    monkeypatch.setattr(
        retrieval_service.internal_client,
        "post_json",
        AsyncMock(return_value={"chunks": [{"id": "no-es-uuid"}]}),
    )

    with pytest.raises(InternalServiceError):
        await retrieval_service.generate_game_answer(
            _session(),
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
    soft_delete_mock = AsyncMock(return_value=deleted)
    delete_file_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(manual_service, "soft_delete_user_manual", soft_delete_mock)
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_file_mock)
    session = object()

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

    chunk_ids = await manual_service.delete_manual(
        object(),
        auth=_auth(),
        manual_id=_MANUAL_ID,
    )

    assert chunk_ids == [_CHUNK_ID]
    delete_file_mock.assert_awaited_once_with("manuals/user/manual/page-1.jpg")


def _auth():
    """Crea un objeto de auth mínimo para casos de uso de manuales."""
    return SimpleNamespace(user=SimpleNamespace(id=_USER_ID))


def _session():
    """Crea una sesión falsa con rollback observable."""

    async def rollback():
        await anyio.lowlevel.checkpoint()
        session.rollbacks += 1

    session = SimpleNamespace(rollbacks=0)
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
    return SimpleNamespace(
        id=page_id,
        page_number=page_number,
        ocr_status="processing",
        storage_key=f"manuals/user/manual/page-{page_number}.jpg",
        mime_type="image/jpeg",
        width=10,
        height=10,
        sha256="f" * 64,
    )


def _pdf_page(*, page_id, page_number: int):
    """Construye una página PDF aún sin imagen renderizada."""
    return SimpleNamespace(
        id=page_id,
        page_number=page_number,
        ocr_status="processing",
        storage_key=None,
        mime_type=None,
        width=None,
        height=None,
        sha256=None,
    )


def _validated_image(*, content: bytes = b"image-bytes") -> ValidatedManualImage:
    """Devuelve una imagen validada mínima para el servicio."""
    return ValidatedManualImage(
        content=content,
        mime_type="image/jpeg",
        extension=".jpg",
        width=10,
        height=10,
        sha256="f" * 64,
    )
