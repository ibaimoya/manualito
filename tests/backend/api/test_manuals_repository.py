from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import anyio
import pytest

from api.manuals.exceptions import ManualContextNotFoundError, ManualNotFoundError
from api.manuals.repository import (
    PreparedChunk,
    create_manual_with_page_and_chunks,
    get_user_manual_detail,
    list_user_manuals,
    load_authorized_chunks,
    mark_manual_failed,
    mark_manual_indexed,
    soft_delete_user_manual,
)
from api.manuals.validation import ValidatedManualImage
from database.models.asset import Asset
from database.models.manual import Manual, ManualChunk, ManualPage

_OWNER_USER_ID = uuid4()
_GAME_ID = uuid4()
_MANUAL_ID = uuid4()
_CHUNK_ID = uuid4()
_INDEXED_AT = datetime(2026, 5, 31, tzinfo=UTC)


class _ScalarOneResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        """Devuelve el único valor escalar preparado para el test."""
        return self.value


class _ScalarsResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        """Devuelve una lista de entidades como haría SQLAlchemy."""
        return self.values


class _OneOrNoneResult:
    def __init__(self, value):
        self.value = value

    def one_or_none(self):
        """Devuelve una fila o None, como SQLAlchemy."""
        return self.value


class _FakeSession:
    def __init__(self, *, execute_results=None, get_result=None):
        self.added = []
        self.executed = []
        self.commits = 0
        self.flushes = 0
        self.execute_results = list(execute_results or [])
        self.get_result = get_result

    def add(self, entity) -> None:
        """Guarda entidades añadidas y simula UUID generado por Postgres."""
        _assign_id(entity)
        self.added.append(entity)

    def add_all(self, entities) -> None:
        """Guarda varias entidades y simula UUID generado por Postgres."""
        for entity in entities:
            _assign_id(entity)
            self.added.append(entity)

    async def flush(self) -> None:
        """Cuenta flushes para comprobar el orden de persistencia."""
        await anyio.lowlevel.checkpoint()
        self.flushes += 1

    async def commit(self) -> None:
        """Cuenta commits para asegurar que la unidad de trabajo cierra."""
        await anyio.lowlevel.checkpoint()
        self.commits += 1

    async def get(self, _model, _entity_id):
        """Devuelve la entidad configurada para session.get."""
        await anyio.lowlevel.checkpoint()
        return self.get_result

    async def execute(self, statement):
        """Devuelve resultados preparados manteniendo la query para inspección."""
        await anyio.lowlevel.checkpoint()
        self.executed.append(statement)
        return self.execute_results.pop(0)

    async def scalar(self, statement):
        """Devuelve un escalar preparado, como AsyncSession.scalar."""
        await anyio.lowlevel.checkpoint()
        self.executed.append(statement)
        result = self.execute_results.pop(0)
        return result.value if isinstance(result, _ScalarOneResult) else result


@pytest.mark.anyio
async def test_list_user_manuals_maps_explicit_rows():
    """El listado de manuales propios devuelve filas sin lazy-loading."""
    row = _manual_row(title="Manual base")
    session = _FakeSession(execute_results=[[row]])

    manuals = await list_user_manuals(
        session,
        owner_user_id=_OWNER_USER_ID,
        limit=50,
        offset=0,
    )

    assert len(manuals) == 1
    assert manuals[0].id == _MANUAL_ID
    assert manuals[0].game_name == "Catan"
    assert manuals[0].title == "Manual base"
    assert manuals[0].chunks_indexed == 2


@pytest.mark.anyio
async def test_get_user_manual_detail_loads_pages_in_order():
    """El detalle carga metadata y páginas OCR con ownership en la query."""
    pages = [
        SimpleNamespace(page_number=1, ocr_status="completed", ocr_lines=[{"text": "A"}]),
        SimpleNamespace(page_number=2, ocr_status="completed", ocr_lines=[{"text": "B"}]),
    ]
    session = _FakeSession(
        execute_results=[
            _OneOrNoneResult(_manual_row(title=None)),
            pages,
        ],
    )

    detail = await get_user_manual_detail(
        session,
        owner_user_id=_OWNER_USER_ID,
        manual_id=_MANUAL_ID,
    )

    assert detail.summary.id == _MANUAL_ID
    assert detail.pages[0].page_number == 1
    assert detail.pages[0].ocr_lines == [{"text": "A"}]
    assert detail.pages[1].page_number == 2


@pytest.mark.anyio
async def test_get_user_manual_detail_raises_for_missing_manual():
    """Si el manual no existe o no pertenece al usuario, devuelve error de dominio."""
    session = _FakeSession(execute_results=[_OneOrNoneResult(None)])

    with pytest.raises(ManualNotFoundError):
        await get_user_manual_detail(
            session,
            owner_user_id=_OWNER_USER_ID,
            manual_id=_MANUAL_ID,
        )


@pytest.mark.anyio
async def test_soft_delete_user_manual_marks_manual_and_assets_deleted():
    """El borrado lógico recoge chunks y ficheros para limpieza posterior."""
    manual = SimpleNamespace(id=_MANUAL_ID, status="active", deleted_at=None)
    asset = SimpleNamespace(storage_key="manuals/user/manual/page-1.jpg", deleted_at=None)
    session = _FakeSession(
        execute_results=[
            _ScalarOneResult(manual),
            _ScalarsResult([_CHUNK_ID]),
            _ScalarsResult([asset]),
        ],
    )

    result = await soft_delete_user_manual(
        session,
        owner_user_id=_OWNER_USER_ID,
        manual_id=_MANUAL_ID,
    )

    assert manual.status == "hidden"
    assert manual.deleted_at is not None
    assert asset.deleted_at == manual.deleted_at
    assert result.manual_id == _MANUAL_ID
    assert result.chunk_ids == [_CHUNK_ID]
    assert result.storage_keys == ["manuals/user/manual/page-1.jpg"]
    assert session.commits == 1


@pytest.mark.anyio
async def test_soft_delete_user_manual_raises_when_not_owned_or_missing():
    """El borrado no revela si el manual existe para otro usuario."""
    session = _FakeSession(execute_results=[_ScalarOneResult(None)])

    with pytest.raises(ManualNotFoundError):
        await soft_delete_user_manual(
            session,
            owner_user_id=_OWNER_USER_ID,
            manual_id=_MANUAL_ID,
        )


@pytest.mark.anyio
async def test_create_manual_with_page_and_chunks_persists_expected_rows():
    """La transacción crea manual, asset, página OCR y chunks en Postgres."""
    session = _FakeSession(execute_results=[_ScalarOneResult(_GAME_ID)])

    result = await create_manual_with_page_and_chunks(
        session,
        owner_user_id=_OWNER_USER_ID,
        game_id=_GAME_ID,
        title="Manual base",
        visibility="shared",
        language="es",
        image=_validated_image(),
        storage_key="manuals/user/manual/page-1.jpg",
        ocr_lines=[{"text": "Regla uno", "confidence": 0.9}],
        chunks=[
            PreparedChunk(
                text="Regla uno",
                chunk_index=0,
                source_page=1,
                content_hash="a" * 64,
            )
        ],
    )

    manual = _first_added(session, Manual)
    asset = _first_added(session, Asset)
    page = _first_added(session, ManualPage)
    chunk = _first_added(session, ManualChunk)
    assert result.manual is manual
    assert result.chunks == [chunk]
    assert manual.owner_user_id == _OWNER_USER_ID
    assert manual.game_id == _GAME_ID
    assert manual.status == "indexing"
    assert manual.visibility == "shared"
    assert asset.storage_key == "manuals/user/manual/page-1.jpg"
    assert asset.sha256 == "f" * 64
    assert page.manual_id == manual.id
    assert page.image_asset_id == asset.id
    assert page.ocr_lines == [{"text": "Regla uno", "confidence": 0.9}]
    assert chunk.manual_id == manual.id
    assert chunk.page_id == page.id
    assert session.flushes == 4
    assert session.commits == 1


@pytest.mark.anyio
async def test_create_manual_with_page_and_chunks_trusts_validated_game_id():
    """La validación de juego vive en dependencias; el repo solo persiste."""
    session = _FakeSession()

    await create_manual_with_page_and_chunks(
        session,
        owner_user_id=_OWNER_USER_ID,
        game_id=_GAME_ID,
        title=None,
        visibility="private",
        language=None,
        image=_validated_image(),
        storage_key="manuals/user/manual/page-1.jpg",
        ocr_lines=[],
        chunks=[],
    )

    assert session.commits == 1


@pytest.mark.anyio
async def test_mark_manual_indexed_updates_manual_and_chunks():
    """Tras indexar en Chroma se guardan modelo, fecha y estado activo."""
    manual = SimpleNamespace(status="indexing", chunks_indexed=0, indexed_at=None)
    chunk = SimpleNamespace(embedding_model=None, indexed_at=None)
    session = _FakeSession(
        get_result=manual,
        execute_results=[_ScalarsResult([chunk])],
    )

    await mark_manual_indexed(
        session,
        manual_id=_MANUAL_ID,
        chunk_ids={_CHUNK_ID},
        embedding_model="test-model",
        indexed_at=_INDEXED_AT,
    )

    assert chunk.embedding_model == "test-model"
    assert chunk.indexed_at == _INDEXED_AT
    assert manual.status == "active"
    assert manual.chunks_indexed == 1
    assert manual.indexed_at == _INDEXED_AT
    assert session.commits == 1


@pytest.mark.anyio
async def test_mark_manual_indexed_raises_when_manual_is_missing():
    """Actualizar un manual inexistente produce error de dominio."""
    session = _FakeSession(get_result=None)

    with pytest.raises(ManualContextNotFoundError):
        await mark_manual_indexed(
            session,
            manual_id=_MANUAL_ID,
            chunk_ids={_CHUNK_ID},
            embedding_model="test-model",
            indexed_at=_INDEXED_AT,
        )


@pytest.mark.anyio
async def test_mark_manual_failed_sets_status_when_manual_exists():
    """Un fallo de RAG deja el manual marcado como failed para reintento."""
    manual = SimpleNamespace(status="indexing")
    session = _FakeSession(get_result=manual)

    await mark_manual_failed(session, manual_id=_MANUAL_ID)

    assert manual.status == "failed"
    assert session.commits == 1


@pytest.mark.anyio
async def test_mark_manual_failed_ignores_missing_manual():
    """Si no existe la fila, el marcado fallido es idempotente."""
    session = _FakeSession(get_result=None)

    await mark_manual_failed(session, manual_id=_MANUAL_ID)

    assert session.commits == 0


@pytest.mark.anyio
async def test_load_authorized_chunks_preserves_requested_order():
    """Los chunks autorizados se devuelven en el orden pedido por Chroma."""
    chunk_a = uuid4()
    chunk_b = uuid4()
    rows = [
        SimpleNamespace(
            id=chunk_b,
            text="Texto B",
            chunk_index=1,
            source_page=2,
            content_hash="b" * 64,
        ),
        SimpleNamespace(
            id=chunk_a,
            text="Texto A",
            chunk_index=0,
            source_page=1,
            content_hash="a" * 64,
        ),
    ]
    session = _FakeSession(execute_results=[rows])

    chunks = await load_authorized_chunks(
        session,
        game_id=_GAME_ID,
        current_user_id=_OWNER_USER_ID,
        chunk_ids=[chunk_a, chunk_b],
    )

    assert [chunk.id for chunk in chunks] == [chunk_a, chunk_b]
    assert [chunk.text for chunk in chunks] == ["Texto A", "Texto B"]
    assert session.executed


@pytest.mark.parametrize("chunk_ids,execute_results", [([], []), ([uuid4()], [[]])])
@pytest.mark.anyio
async def test_load_authorized_chunks_raises_without_authorized_context(
    chunk_ids,
    execute_results,
):
    """Sin candidatos o sin permiso, el servicio no puede construir contexto."""
    session = _FakeSession(execute_results=execute_results)

    with pytest.raises(ManualContextNotFoundError):
        await load_authorized_chunks(
            session,
            game_id=_GAME_ID,
            current_user_id=_OWNER_USER_ID,
            chunk_ids=chunk_ids,
        )


def _validated_image() -> ValidatedManualImage:
    """Devuelve una imagen validada mínima para persistencia."""
    return ValidatedManualImage(
        content=b"image-bytes",
        mime_type="image/jpeg",
        extension=".jpg",
        width=10,
        height=10,
        sha256="f" * 64,
    )


def _manual_row(*, title: str | None):
    """Construye una fila explícita del listado de manuales."""
    return SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        game_name="Catan",
        title=title,
        status="active",
        visibility="private",
        language="es",
        chunks_indexed=2,
        created_at=_INDEXED_AT,
        indexed_at=_INDEXED_AT,
    )


def _assign_id(entity) -> None:
    """Simula el UUID server-side que Postgres asigna en flush."""
    if getattr(entity, "id", None) is None:
        entity.id = uuid4()


def _first_added(session: _FakeSession, model):
    """Recupera la primera entidad añadida de un tipo concreto."""
    return next(entity for entity in session.added if isinstance(entity, model))
