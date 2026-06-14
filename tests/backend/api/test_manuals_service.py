from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import anyio
import pytest
from sqlalchemy.exc import SQLAlchemyError

import api.manuals.retrieval.service as retrieval_service
import api.manuals.service as manual_service
from api.exceptions import InternalServiceError, InternalServiceUnavailableError
from api.manuals.exceptions import GeneratedAnswerTooLongError
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
    """El caso de uso deja el trabajo pesado para el procesador background."""
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
async def test_process_manual_procesa_paginas_e_indexa_chunks(monkeypatch):
    """El background reabre sus recursos y actualiza DB antes de llamar a RAG."""
    session = object()
    client = object()
    manual = SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_USER_ID,
        language="es",
        status="indexing",
        source_type="images",
        source_asset_id=None,
    )
    page = SimpleNamespace(
        id=uuid4(),
        page_number=1,
        ocr_status="pending",
        storage_key="manuals/user/manual/page-1.jpg",
        mime_type="image/jpeg",
        width=10,
        height=10,
        sha256="f" * 64,
    )
    chunk = SimpleNamespace(
        id=_CHUNK_ID,
        text="Regla uno. Regla dos.",
        chunk_index=0,
        source_page=1,
        content_hash="a" * 64,
    )
    _patch_process_resources(monkeypatch, session=session, client=client)
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=manual),
    )
    monkeypatch.setattr(
        manual_service,
        "list_pages_for_processing",
        AsyncMock(return_value=[page]),
    )
    monkeypatch.setattr(
        manual_service,
        "read_stored_file",
        AsyncMock(return_value=b"image-bytes"),
    )
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(manual_service, "next_chunk_index", AsyncMock(return_value=0))
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)
    monkeypatch.setattr(
        manual_service,
        "resolve_manual_processed_status",
        AsyncMock(return_value="active"),
    )
    monkeypatch.setattr(
        manual_service,
        "list_manual_chunks_for_ingest",
        AsyncMock(return_value=[chunk]),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(
            return_value={
                "chunks_indexed": 1,
                "embedding_model": "test-model",
                "indexed_at": _INDEXED_AT,
                "chunk_ids": [str(_CHUNK_ID)],
            }
        ),
    )
    mark_indexed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_indexed_mock)

    await manual_service.process_manual(_MANUAL_ID)

    replace_mock.assert_awaited_once()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["text_quality"] == "ok"
    assert replace_kwargs["chunks"][0].source_page == 1
    mark_indexed_mock.assert_awaited_once()
    assert mark_indexed_mock.await_args.kwargs["status"] == "active"


@pytest.mark.anyio
async def test_process_manual_hace_rollback_antes_de_marcar_pagina_fallida(monkeypatch):
    """Tras un fallo SQL, la sesion debe limpiarse antes de seguir usandola."""
    events: list[str] = []
    session = SimpleNamespace(rollback=AsyncMock(side_effect=lambda: events.append("rollback")))
    manual = SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_USER_ID,
        language="es",
        status="indexing",
        source_type="images",
        source_asset_id=None,
    )
    page = SimpleNamespace(
        id=uuid4(),
        page_number=1,
        ocr_status="pending",
        storage_key="manuals/user/manual/page-1.jpg",
        mime_type="image/jpeg",
        width=10,
        height=10,
        sha256="f" * 64,
    )

    _patch_process_resources(monkeypatch, session=session, client=object())
    monkeypatch.setattr(manual_service, "get_manual_for_processing", AsyncMock(return_value=manual))
    monkeypatch.setattr(manual_service, "list_pages_for_processing", AsyncMock(return_value=[page]))
    monkeypatch.setattr(manual_service, "read_stored_file", AsyncMock(return_value=b"image-bytes"))
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(manual_service, "next_chunk_index", AsyncMock(return_value=0))
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
    monkeypatch.setattr(
        manual_service,
        "resolve_manual_processed_status",
        AsyncMock(return_value="failed"),
    )
    monkeypatch.setattr(manual_service, "mark_manual_failed", AsyncMock())

    await manual_service.process_manual(_MANUAL_ID)

    assert events == ["rollback", "mark_page_failed"]


@pytest.mark.anyio
async def test_process_manual_no_hace_nada_si_otro_worker_tiene_el_lock(monkeypatch):
    """Si otro proceso reclama el manual, esta ejecucion sale sin tocar recursos."""
    monkeypatch.setattr(manual_service, "manual_lock", lambda _manual_id: _AsyncContext(None))
    get_manual_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "get_manual_for_processing", get_manual_mock)
    async_client_mock = MagicMock()
    monkeypatch.setattr(manual_service.httpx, "AsyncClient", async_client_mock)

    await manual_service.process_manual(_MANUAL_ID)

    get_manual_mock.assert_not_awaited()
    async_client_mock.assert_not_called()


@pytest.mark.anyio
async def test_process_manual_marca_failed_si_falla_el_background(monkeypatch):
    """Un fallo no controlado no deja el manual bloqueado en indexing."""
    _patch_process_resources(monkeypatch, session=object(), client=object())
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(side_effect=RuntimeError("fallo inesperado")),
    )
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "_mark_manual_failed_safely", mark_failed_mock)

    with pytest.raises(RuntimeError, match="fallo inesperado"):
        await manual_service.process_manual(_MANUAL_ID)

    mark_failed_mock.assert_awaited_once_with(_MANUAL_ID)


@pytest.mark.anyio
async def test_replace_page_text_marks_empty_pages_without_text_source(monkeypatch):
    """Si no hay texto util, la pagina queda completed/empty pero sin fuente."""
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "next_chunk_index", AsyncMock(return_value=0))
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
async def test_process_manual_usa_texto_pdf_aprovechable_sin_ocr(monkeypatch):
    """Una pagina PDF con texto bueno no se degrada pasandola por OCR."""
    session = object()
    client = object()
    source_asset_id = uuid4()
    manual = SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_USER_ID,
        language="es",
        status="indexing",
        source_type="pdf",
        source_asset_id=source_asset_id,
    )
    page = SimpleNamespace(
        id=uuid4(),
        page_number=1,
        ocr_status="pending",
        storage_key=None,
        mime_type=None,
        width=None,
        height=None,
        sha256=None,
    )
    text = " ".join(f"regla-{index}" for index in range(40))
    chunk = SimpleNamespace(
        id=_CHUNK_ID,
        text=text,
        chunk_index=0,
        source_page=1,
        content_hash="a" * 64,
    )
    _patch_process_resources(monkeypatch, session=session, client=client)
    monkeypatch.setattr(manual_service, "get_manual_for_processing", AsyncMock(return_value=manual))
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    monkeypatch.setattr(manual_service, "read_stored_file", AsyncMock(return_value=b"%PDF-"))
    monkeypatch.setattr(manual_service, "list_pages_for_processing", AsyncMock(return_value=[page]))
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=text))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda value: value == text)
    run_ocr_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "run_ocr", run_ocr_mock)
    render_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "render_pdf_page", render_mock)
    monkeypatch.setattr(manual_service, "next_chunk_index", AsyncMock(return_value=0))
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)
    monkeypatch.setattr(
        manual_service,
        "resolve_manual_processed_status",
        AsyncMock(return_value="active"),
    )
    monkeypatch.setattr(
        manual_service,
        "list_manual_chunks_for_ingest",
        AsyncMock(return_value=[chunk]),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(
            return_value={
                "chunks_indexed": 1,
                "embedding_model": "test-model",
                "indexed_at": _INDEXED_AT,
                "chunk_ids": [str(_CHUNK_ID)],
            }
        ),
    )
    monkeypatch.setattr(manual_service, "mark_manual_indexed", AsyncMock())

    await manual_service.process_manual(_MANUAL_ID)

    replace_mock.assert_awaited_once()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["ocr_lines"] == [{"text": text, "confidence": None}]
    assert replace_kwargs["text_source"] == "pdf_text"
    assert replace_kwargs["ocr_confidence_mean"] is None
    run_ocr_mock.assert_not_awaited()
    render_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_process_manual_renderiza_pdf_si_el_texto_no_es_aprovechable(monkeypatch):
    """Una pagina PDF sin texto bueno se renderiza y sigue el OCR normal."""
    session = object()
    client = object()
    source_asset_id = uuid4()
    manual = SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_USER_ID,
        language="es",
        status="indexing",
        source_type="pdf",
        source_asset_id=source_asset_id,
    )
    page = SimpleNamespace(
        id=uuid4(),
        page_number=2,
        ocr_status="pending",
        storage_key=None,
        mime_type=None,
        width=None,
        height=None,
        sha256=None,
    )
    image = _validated_image()
    chunk = SimpleNamespace(
        id=_CHUNK_ID,
        text="Regla uno. Regla dos.",
        chunk_index=0,
        source_page=2,
        content_hash="a" * 64,
    )
    _patch_process_resources(monkeypatch, session=session, client=client)
    monkeypatch.setattr(manual_service, "get_manual_for_processing", AsyncMock(return_value=manual))
    monkeypatch.setattr(
        manual_service,
        "get_asset_for_processing",
        AsyncMock(return_value="manuals/user/manual/source.pdf"),
    )
    monkeypatch.setattr(manual_service, "read_stored_file", AsyncMock(return_value=b"%PDF-"))
    monkeypatch.setattr(manual_service, "list_pages_for_processing", AsyncMock(return_value=[page]))
    monkeypatch.setattr(manual_service, "extract_pdf_page_text", AsyncMock(return_value=""))
    monkeypatch.setattr(manual_service, "pdf_text_is_usable", lambda _value: False)
    monkeypatch.setattr(manual_service, "render_pdf_page", AsyncMock(return_value=image))
    save_mock = AsyncMock(return_value="manuals/user/manual/page-2.jpg")
    monkeypatch.setattr(manual_service, "save_manual_image", save_mock)
    attach_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "attach_page_image_asset", attach_mock)
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(manual_service, "next_chunk_index", AsyncMock(return_value=0))
    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "replace_page_result", replace_mock)
    monkeypatch.setattr(
        manual_service,
        "resolve_manual_processed_status",
        AsyncMock(return_value="active"),
    )
    monkeypatch.setattr(
        manual_service,
        "list_manual_chunks_for_ingest",
        AsyncMock(return_value=[chunk]),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(
            return_value={
                "chunks_indexed": 1,
                "embedding_model": "test-model",
                "indexed_at": _INDEXED_AT,
                "chunk_ids": [str(_CHUNK_ID)],
            }
        ),
    )
    monkeypatch.setattr(manual_service, "mark_manual_indexed", AsyncMock())

    await manual_service.process_manual(_MANUAL_ID)

    save_mock.assert_awaited_once_with(image, owner_user_id=_USER_ID, page_number=2)
    attach_mock.assert_awaited_once()
    assert attach_mock.await_args.kwargs["storage_key"] == "manuals/user/manual/page-2.jpg"
    replace_mock.assert_awaited_once()
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "ocr"
    assert replace_kwargs["chunks"][0].source_page == 2


@pytest.mark.anyio
async def test_process_manual_marca_failed_si_rag_responde_payload_invalido(monkeypatch):
    """Un fallo de indexado deja el manual marcado para reintento."""
    session = object()
    _patch_process_resources(monkeypatch, session=session, client=object())
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(
            return_value=SimpleNamespace(
                id=_MANUAL_ID,
                game_id=_GAME_ID,
                owner_user_id=_USER_ID,
                language=None,
                status="indexing",
                source_type="images",
                source_asset_id=None,
            )
        ),
    )
    monkeypatch.setattr(manual_service, "list_pages_for_processing", AsyncMock(return_value=[]))
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
        await manual_service.process_manual(_MANUAL_ID)

    mark_failed_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)


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
            ),
            AuthorizedChunk(
                id=_DUPLICATE_CHUNK_ID,
                text="Texto duplicado",
                content_hash="same-hash",
                manual_id=_MANUAL_ID,
                manual_title=_MANUAL_TITLE,
                source_page=1,
            ),
            AuthorizedChunk(
                id=_UNIQUE_CHUNK_ID,
                text="Texto B",
                content_hash="unique-hash",
                manual_id=_MANUAL_ID,
                manual_title=_MANUAL_TITLE,
                source_page=2,
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
            {"manual_id": _MANUAL_ID, "manual_title": _MANUAL_TITLE, "page": 1},
            {"manual_id": _MANUAL_ID, "manual_title": _MANUAL_TITLE, "page": 2},
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
    """El borrado confirma Postgres antes de limpiar índice y storage."""
    deleted = DeletedManualAssets(
        manual_id=_MANUAL_ID,
        chunk_ids=[_CHUNK_ID],
        storage_keys=["manuals/user/manual/page-1.jpg"],
    )
    soft_delete_mock = AsyncMock(return_value=deleted)
    post_json_mock = AsyncMock(return_value={"status": "deleted", "chunks_deleted": 1})
    delete_file_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(manual_service, "soft_delete_user_manual", soft_delete_mock)
    monkeypatch.setattr(manual_service.internal_client, "post_json", post_json_mock)
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_file_mock)
    session = object()
    client = object()

    await manual_service.delete_manual(
        session,
        auth=_auth(),
        manual_id=_MANUAL_ID,
        client=client,
    )

    soft_delete_mock.assert_awaited_once_with(
        session,
        owner_user_id=_USER_ID,
        manual_id=_MANUAL_ID,
    )
    post_json_mock.assert_awaited_once()
    assert post_json_mock.await_args.kwargs["payload"] == {
        "manual_id": str(_MANUAL_ID),
        "chunk_ids": [str(_CHUNK_ID)],
    }
    delete_file_mock.assert_awaited_once_with("manuals/user/manual/page-1.jpg")


@pytest.mark.anyio
async def test_delete_manual_continues_when_rag_cleanup_fails(monkeypatch):
    """Un fallo limpiando Chroma no impide borrar el fichero ya no activo."""
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
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(side_effect=InternalServiceUnavailableError("RAG no disponible.")),
    )
    delete_file_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_file_mock)

    await manual_service.delete_manual(
        object(),
        auth=_auth(),
        manual_id=_MANUAL_ID,
        client=object(),
    )

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
    """Inyecta recursos propios del procesador background."""
    monkeypatch.setattr(manual_service, "manual_lock", lambda _manual_id: _AsyncContext(session))
    monkeypatch.setattr(
        manual_service.httpx,
        "AsyncClient",
        lambda: _AsyncContext(client),
    )


def _validated_image() -> ValidatedManualImage:
    """Devuelve una imagen validada mínima para el servicio."""
    return ValidatedManualImage(
        content=b"image-bytes",
        mime_type="image/jpeg",
        extension=".jpg",
        width=10,
        height=10,
        sha256="f" * 64,
    )
