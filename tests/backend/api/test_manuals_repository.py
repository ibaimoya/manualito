from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

from api.manuals.exceptions import ManualContextNotFoundError, ManualNotFoundError
from api.manuals.repository import (
    StoredManualImage,
    StoredManualPdf,
    _authorized_chunks_query,
    _manual_summary_query,
    attach_page_image_asset,
    create_manual_with_pending_pages,
    get_asset_for_processing,
    get_user_manual_detail,
    get_user_manual_processing_status,
    list_user_manuals,
    load_authorized_chunks,
    mark_manual_failed,
    mark_manual_indexed,
    next_chunk_index,
    resolve_manual_processed_status,
    soft_delete_user_manual,
)
from api.manuals.validation import ValidatedManualImage, ValidatedManualPdf
from database.models.asset import Asset
from database.models.manual import ManualPage

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

    def scalar_one(self):
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
    assert manuals[0].source_type == "images"
    assert manuals[0].page_count == 2
    assert manuals[0].chunks_indexed == 2


def test_manual_summary_query_selects_public_upload_metadata():
    """El resumen selecciona metadatos de origen para lista y detalle."""
    compiled = str(
        _manual_summary_query(_OWNER_USER_ID).compile(dialect=postgresql.dialect())
    )

    assert "manuals.source_type" in compiled
    assert "manuals.page_count" in compiled


@pytest.mark.anyio
async def test_get_user_manual_detail_loads_pages_in_order():
    """El detalle carga metadata y páginas OCR con ownership en la query."""
    pages = [
        SimpleNamespace(
            page_number=1,
            ocr_status="completed",
            text_source="ocr",
            text_quality="ok",
            ocr_confidence_mean=0.9,
            ocr_lines=[{"text": "A"}],
        ),
        SimpleNamespace(
            page_number=2,
            ocr_status="completed",
            text_source="pdf_text",
            text_quality="ok",
            ocr_confidence_mean=None,
            ocr_lines=[{"text": "B"}],
        ),
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
    assert detail.pages[0].text_source == "ocr"
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
async def test_get_user_manual_processing_status_loads_lightweight_progress():
    """El progreso no trae ocr_lines completas."""
    pages = [
        SimpleNamespace(page_number=1, ocr_status="completed", text_quality="ok"),
        SimpleNamespace(page_number=2, ocr_status="pending", text_quality=None),
    ]
    session = _FakeSession(
        execute_results=[
            _OneOrNoneResult(
                SimpleNamespace(id=_MANUAL_ID, status="indexing", page_count=2)
            ),
            pages,
        ],
    )

    manual, loaded_pages = await get_user_manual_processing_status(
        session,
        owner_user_id=_OWNER_USER_ID,
        manual_id=_MANUAL_ID,
    )

    assert manual.id == _MANUAL_ID
    assert manual.status == "indexing"
    assert manual.page_count == 2
    assert loaded_pages == pages


@pytest.mark.anyio
async def test_get_user_manual_processing_status_raises_for_missing_manual():
    """El progreso mantiene el mismo 404 que el detalle."""
    session = _FakeSession(execute_results=[_OneOrNoneResult(None)])

    with pytest.raises(ManualNotFoundError):
        await get_user_manual_processing_status(
            session,
            owner_user_id=_OWNER_USER_ID,
            manual_id=_MANUAL_ID,
        )


@pytest.mark.anyio
async def test_soft_delete_user_manual_marks_manual_and_assets_deleted():
    """El borrado lógico recoge chunks y ficheros para limpieza posterior."""
    manual = SimpleNamespace(
        id=_MANUAL_ID,
        source_asset_id=None,
        status="active",
        deleted_at=None,
    )
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
async def test_soft_delete_user_manual_includes_source_asset():
    """El PDF original colgado del manual tambien se limpia al borrar."""
    source_asset_id = uuid4()
    manual = SimpleNamespace(
        id=_MANUAL_ID,
        source_asset_id=source_asset_id,
        status="active",
        deleted_at=None,
    )
    page_asset = SimpleNamespace(
        storage_key="manuals/user/manual/page-1.jpg",
        deleted_at=None,
    )
    source_asset = SimpleNamespace(
        storage_key="manuals/user/manual/source.pdf",
        deleted_at=None,
    )
    session = _FakeSession(
        execute_results=[
            _ScalarOneResult(manual),
            _ScalarsResult([_CHUNK_ID]),
            _ScalarsResult([page_asset, source_asset]),
        ],
    )

    result = await soft_delete_user_manual(
        session,
        owner_user_id=_OWNER_USER_ID,
        manual_id=_MANUAL_ID,
    )

    assert source_asset.deleted_at == manual.deleted_at
    assert result.storage_keys == [
        "manuals/user/manual/page-1.jpg",
        "manuals/user/manual/source.pdf",
    ]


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
async def test_create_manual_with_pending_pages_persists_images_in_order():
    """El alta multipagina crea assets y paginas pendientes en el orden recibido."""
    session = _FakeSession()

    manual = await create_manual_with_pending_pages(
        session,
        owner_user_id=_OWNER_USER_ID,
        game_id=_GAME_ID,
        title="Manual base",
        visibility="private",
        language="es",
        source_type="images",
        page_count=2,
        images=[
            StoredManualImage(
                page_number=1,
                image=_validated_image(),
                storage_key="manuals/user/manual/page-1.jpg",
            ),
            StoredManualImage(
                page_number=2,
                image=_validated_image(),
                storage_key="manuals/user/manual/page-2.jpg",
            ),
        ],
    )

    pages = [entity for entity in session.added if isinstance(entity, ManualPage)]
    assets = [entity for entity in session.added if isinstance(entity, Asset)]
    assert manual.source_type == "images"
    assert manual.page_count == 2
    assert [asset.storage_key for asset in assets] == [
        "manuals/user/manual/page-1.jpg",
        "manuals/user/manual/page-2.jpg",
    ]
    assert [page.page_number for page in pages] == [1, 2]
    assert [page.ocr_status for page in pages] == ["pending", "pending"]
    assert [page.text_source for page in pages] == ["none", "none"]
    assert session.commits == 1


@pytest.mark.anyio
async def test_create_manual_with_pending_pages_persists_pdf_source_and_empty_pages():
    """El PDF original queda como asset fuente y sus paginas nacen pendientes."""
    session = _FakeSession()

    manual = await create_manual_with_pending_pages(
        session,
        owner_user_id=_OWNER_USER_ID,
        game_id=_GAME_ID,
        title=None,
        visibility="private",
        language=None,
        source_type="pdf",
        page_count=2,
        images=[],
        source_pdf=StoredManualPdf(
            pdf=_validated_pdf(),
            storage_key="manuals/user/manual/source.pdf",
        ),
    )

    source_asset = _first_added(session, Asset)
    pages = [entity for entity in session.added if isinstance(entity, ManualPage)]
    assert manual.source_type == "pdf"
    assert manual.page_count == 2
    assert manual.source_asset_id == source_asset.id
    assert source_asset.kind == "manual_source_pdf"
    assert source_asset.storage_key == "manuals/user/manual/source.pdf"
    assert [page.page_number for page in pages] == [1, 2]
    assert [page.image_asset_id for page in pages] == [None, None]
    assert session.commits == 1


@pytest.mark.anyio
async def test_get_asset_for_processing_returns_active_storage_key():
    """El procesador background solo necesita el storage_key del asset fuente."""
    session = _FakeSession(execute_results=[_ScalarOneResult("manuals/user/source.pdf")])

    storage_key = await get_asset_for_processing(session, asset_id=uuid4())

    assert storage_key == "manuals/user/source.pdf"
    assert session.executed


@pytest.mark.anyio
async def test_next_chunk_index_uses_highest_existing_index():
    """El siguiente indice no depende de contar filas tras reintentos."""
    session = _FakeSession(execute_results=[_ScalarOneResult(5)])

    result = await next_chunk_index(session, manual_id=_MANUAL_ID)

    assert result == 5
    assert session.executed


@pytest.mark.anyio
async def test_resolve_manual_processed_status_fails_without_chunks():
    """Un manual sin texto util termina como failed aunque las paginas existan."""
    session = _FakeSession(execute_results=[_ScalarOneResult(None)])

    status = await resolve_manual_processed_status(session, manual_id=_MANUAL_ID)

    assert status == "failed"


@pytest.mark.anyio
async def test_resolve_manual_processed_status_marks_review_for_partial_issues():
    """Si hay texto util pero alguna pagina es dudosa, requiere revision."""
    session = _FakeSession(
        execute_results=[
            _ScalarOneResult(_CHUNK_ID),
            [
                SimpleNamespace(ocr_status="completed", text_quality="ok"),
                SimpleNamespace(ocr_status="completed", text_quality="low_confidence"),
            ],
        ],
    )

    status = await resolve_manual_processed_status(session, manual_id=_MANUAL_ID)

    assert status == "pending_review"


@pytest.mark.anyio
async def test_attach_page_image_asset_persists_rendered_pdf_page():
    """Una pagina PDF renderizada queda asociada como imagen reutilizable."""
    page = SimpleNamespace(image_asset_id=None)
    session = _FakeSession(get_result=page)

    await attach_page_image_asset(
        session,
        owner_user_id=_OWNER_USER_ID,
        page_id=uuid4(),
        image=_validated_image(),
        storage_key="manuals/user/manual/page-1.jpg",
    )

    asset = _first_added(session, Asset)
    assert asset.owner_user_id == _OWNER_USER_ID
    assert asset.kind == "manual_page_image"
    assert asset.storage_key == "manuals/user/manual/page-1.jpg"
    assert page.image_asset_id == asset.id
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
            manual_id=_MANUAL_ID,
            manual_title="Reglamento B",
            chunk_index=1,
            source_page=2,
            content_hash="b" * 64,
            is_own=False,
        ),
        SimpleNamespace(
            id=chunk_a,
            text="Texto A",
            manual_id=_MANUAL_ID,
            manual_title="Reglamento A",
            chunk_index=0,
            source_page=1,
            content_hash="a" * 64,
            is_own=True,
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
    assert [chunk.manual_title for chunk in chunks] == ["Reglamento A", "Reglamento B"]
    assert [chunk.source_page for chunk in chunks] == [1, 2]
    assert [chunk.is_own for chunk in chunks] == [True, False]
    assert session.executed


def test_authorized_chunks_query_selects_ownership_flag():
    """La query calcula si cada fuente pertenece al usuario actual."""
    stmt = _authorized_chunks_query(_GAME_ID, _OWNER_USER_ID, [_CHUNK_ID])

    compiled = str(stmt.compile(dialect=postgresql.dialect()))

    assert "manuals.owner_user_id =" in compiled
    assert "AS is_own" in compiled


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


def _validated_pdf() -> ValidatedManualPdf:
    """Devuelve un PDF validado minimo para persistencia."""
    return ValidatedManualPdf(
        content=b"pdf-bytes",
        mime_type="application/pdf",
        extension=".pdf",
        page_count=2,
        sha256="e" * 64,
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
        source_type="images",
        page_count=2,
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
