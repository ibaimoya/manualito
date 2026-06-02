from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import pytest

import api.manuals.retrieval.service as retrieval_service
import api.manuals.service as manual_service
from api.exceptions import InternalServiceError, InternalServiceUnavailableError
from api.manuals.exceptions import GeneratedAnswerTooLongError, ManualWithoutTextError
from api.manuals.repository import (
    AuthorizedChunk,
    DeletedManualAssets,
    PersistedManual,
)
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
_INDEXED_AT = "2026-05-31T10:00:00+00:00"
_OCR_LINES = [{"text": "Regla uno. Regla dos.", "confidence": 0.9}]


def test_retrieval_top_k_limits_keep_api_and_rag_in_sync():
    """El sobre-fetch que pide API nunca supera el máximo aceptado por RAG."""
    assert GAME_QUESTION_TOP_K_MAX * manual_service.config.RAG_RETRIEVAL_MULTIPLIER <= (
        RAG_RETRIEVAL_TOP_K_MAX
    )


@pytest.mark.anyio
async def test_create_manual_persiste_en_postgres_y_luego_indexa_en_rag(monkeypatch):
    """El caso de uso hace commit en Postgres antes de sincronizar Chroma."""
    session = object()
    client = object()
    image = SimpleNamespace(filename="manual.jpg")
    validated_image = _validated_image()
    persisted = PersistedManual(
        manual=SimpleNamespace(id=_MANUAL_ID),
        chunks=[
            SimpleNamespace(
                id=_CHUNK_ID,
                text="Regla uno. Regla dos.",
                chunk_index=0,
                source_page=1,
                content_hash="a" * 64,
            )
        ],
    )
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=validated_image),
    )
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(
        manual_service,
        "save_manual_image",
        AsyncMock(return_value="manuals/user/manual/page-1.jpg"),
    )
    create_mock = AsyncMock(return_value=persisted)
    monkeypatch.setattr(manual_service, "create_manual_with_page_and_chunks", create_mock)
    post_json_mock = AsyncMock(
        return_value={
            "manual_id": str(_MANUAL_ID),
            "chunks_indexed": 1,
            "status": "indexed",
            "embedding_model": "test-model",
            "indexed_at": _INDEXED_AT,
            "chunk_ids": [str(_CHUNK_ID)],
        }
    )
    monkeypatch.setattr(retrieval_service.internal_client, "post_json", post_json_mock)
    mark_indexed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_indexed", mark_indexed_mock)

    result = await manual_service.create_manual(
        session,
        auth=_auth(),
        game_id=_GAME_ID,
        title=" Manual base ",
        visibility="shared",
        language=" es ",
        image=image,
        client=client,
    )

    assert result.manual_id == _MANUAL_ID
    assert result.game_id == _GAME_ID
    assert result.status == "active"
    assert result.visibility == "shared"
    assert result.chunks_indexed == 1
    assert [line.model_dump() for line in result.ocr_lines] == _OCR_LINES
    create_mock.assert_awaited_once()
    create_kwargs = create_mock.await_args.kwargs
    assert create_kwargs["title"] == "Manual base"
    assert create_kwargs["language"] == "es"
    assert create_kwargs["storage_key"] == "manuals/user/manual/page-1.jpg"
    assert create_kwargs["chunks"][0].source_page == manual_service.DEFAULT_SOURCE_PAGE
    post_json_mock.assert_awaited_once()
    assert post_json_mock.await_args.kwargs["payload"] == {
        "manual_id": str(_MANUAL_ID),
        "game_id": str(_GAME_ID),
        "owner_user_id": str(_USER_ID),
        "language": "es",
        "chunks": [
            {
                "id": str(_CHUNK_ID),
                "text": "Regla uno. Regla dos.",
                "chunk_index": 0,
                "source_page": 1,
                "content_hash": "a" * 64,
            }
        ],
    }
    mark_indexed_mock.assert_awaited_once()
    assert mark_indexed_mock.await_args.kwargs["chunk_ids"] == {_CHUNK_ID}
    assert mark_indexed_mock.await_args.kwargs["embedding_model"] == "test-model"
    assert isinstance(mark_indexed_mock.await_args.kwargs["indexed_at"], datetime)


@pytest.mark.anyio
async def test_create_manual_borra_fichero_si_falla_postgres(monkeypatch):
    """Si falla la persistencia, se elimina el fichero ya escrito en storage."""
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=_validated_image()),
    )
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(
        manual_service,
        "save_manual_image",
        AsyncMock(return_value="manuals/user/manual/page-1.jpg"),
    )
    monkeypatch.setattr(
        manual_service,
        "create_manual_with_page_and_chunks",
        AsyncMock(side_effect=RuntimeError("fallo db")),
    )
    delete_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "delete_stored_file", delete_mock)

    with pytest.raises(RuntimeError, match="fallo db"):
        await manual_service.create_manual(
            object(),
            auth=_auth(),
            game_id=_GAME_ID,
            title=None,
            visibility="private",
            language=None,
            image=SimpleNamespace(filename="manual.jpg"),
            client=object(),
        )

    delete_mock.assert_awaited_once_with("manuals/user/manual/page-1.jpg")


@pytest.mark.anyio
async def test_create_manual_marca_failed_si_rag_falla(monkeypatch):
    """Si Chroma falla tras el commit, el manual queda marcado para reintento."""
    persisted = PersistedManual(
        manual=SimpleNamespace(id=_MANUAL_ID),
        chunks=[
            SimpleNamespace(
                id=_CHUNK_ID,
                text="Regla uno.",
                chunk_index=0,
                source_page=1,
                content_hash="a" * 64,
            )
        ],
    )
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=_validated_image()),
    )
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(manual_service, "save_manual_image", AsyncMock(return_value="key"))
    monkeypatch.setattr(
        manual_service,
        "create_manual_with_page_and_chunks",
        AsyncMock(return_value=persisted),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(side_effect=RuntimeError("respuesta inesperada de RAG")),
    )
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_failed", mark_failed_mock)
    session = object()

    with pytest.raises(InternalServiceError):
        await manual_service.create_manual(
            session,
            auth=_auth(),
            game_id=_GAME_ID,
            title=None,
            visibility="private",
            language=None,
            image=SimpleNamespace(filename="manual.jpg"),
            client=object(),
        )

    mark_failed_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)


@pytest.mark.anyio
async def test_create_manual_propaga_error_de_dominio_si_rag_no_disponible(monkeypatch):
    """Los errores controlados del cliente interno se conservan para el handler HTTP."""
    persisted = PersistedManual(
        manual=SimpleNamespace(id=_MANUAL_ID),
        chunks=[
            SimpleNamespace(
                id=_CHUNK_ID,
                text="Regla uno.",
                chunk_index=0,
                source_page=1,
                content_hash="a" * 64,
            )
        ],
    )
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=_validated_image()),
    )
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(manual_service, "save_manual_image", AsyncMock(return_value="key"))
    monkeypatch.setattr(
        manual_service,
        "create_manual_with_page_and_chunks",
        AsyncMock(return_value=persisted),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(side_effect=InternalServiceUnavailableError("RAG no disponible.")),
    )
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_failed", mark_failed_mock)
    session = object()

    with pytest.raises(InternalServiceUnavailableError):
        await manual_service.create_manual(
            session,
            auth=_auth(),
            game_id=_GAME_ID,
            title=None,
            visibility="private",
            language=None,
            image=SimpleNamespace(filename="manual.jpg"),
            client=object(),
        )

    mark_failed_mock.assert_awaited_once_with(session, manual_id=_MANUAL_ID)


@pytest.mark.anyio
async def test_create_manual_marca_failed_si_rag_responde_payload_invalido(monkeypatch):
    """Un 200 mal formado de RAG no deja el manual atascado en indexing."""
    persisted = PersistedManual(
        manual=SimpleNamespace(id=_MANUAL_ID),
        chunks=[
            SimpleNamespace(
                id=_CHUNK_ID,
                text="Regla uno.",
                chunk_index=0,
                source_page=1,
                content_hash="a" * 64,
            )
        ],
    )
    monkeypatch.setattr(
        manual_service,
        "validate_manual_image",
        AsyncMock(return_value=_validated_image()),
    )
    monkeypatch.setattr(manual_service, "run_ocr", AsyncMock(return_value=_OCR_LINES))
    monkeypatch.setattr(manual_service, "save_manual_image", AsyncMock(return_value="key"))
    monkeypatch.setattr(
        manual_service,
        "create_manual_with_page_and_chunks",
        AsyncMock(return_value=persisted),
    )
    monkeypatch.setattr(
        manual_service.internal_client,
        "post_json",
        AsyncMock(return_value={"status": "indexed"}),
    )
    mark_failed_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "mark_manual_failed", mark_failed_mock)
    session = object()

    with pytest.raises(InternalServiceError):
        await manual_service.create_manual(
            session,
            auth=_auth(),
            game_id=_GAME_ID,
            title=None,
            visibility="private",
            language=None,
            image=SimpleNamespace(filename="manual.jpg"),
            client=object(),
        )

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
            ),
            AuthorizedChunk(
                id=_DUPLICATE_CHUNK_ID,
                text="Texto duplicado",
                content_hash="same-hash",
            ),
            AuthorizedChunk(
                id=_UNIQUE_CHUNK_ID,
                text="Texto B",
                content_hash="unique-hash",
            ),
        ]
    )
    monkeypatch.setattr(retrieval_service, "load_authorized_chunks", load_chunks_mock)

    session = _session()

    result = await retrieval_service.generate_game_answer(
        session,
        auth=_auth(),
        game_id=_GAME_ID,
        question="¿Cómo se gana?",
        top_k=2,
        client=object(),
    )

    assert result == AnswerResponse(answer="Se gana con 10 puntos.")
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
                AuthorizedChunk(id=_CHUNK_ID, text="Texto A", content_hash="hash")
            ]
        ),
    )

    with pytest.raises(GeneratedAnswerTooLongError):
        await retrieval_service.generate_game_answer(
            _session(),
            auth=_auth(),
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
            auth=_auth(),
            game_id=_GAME_ID,
            question="¿Cómo se gana?",
            top_k=3,
            client=object(),
        )


def test_prepare_chunks_raises_when_ocr_has_no_text():
    """OCR vacío no puede producir chunks indexables."""
    with pytest.raises(ManualWithoutTextError):
        manual_service._prepare_chunks([{"text": "   "}])


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


def test_optional_strip_normalizes_blank_values():
    """Campos opcionales vacíos se guardan como NULL."""
    assert manual_service._optional_strip("  es  ") == "es"
    assert manual_service._optional_strip("   ") is None
    assert manual_service._optional_strip(None) is None


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
