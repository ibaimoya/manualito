from __future__ import annotations

import logging
from typing import Protocol, TypedDict
from urllib.parse import urlparse

from rag import config
from rag.exceptions import ContextNotFoundError
from rag.schemas import IngestChunk

logger = logging.getLogger(__name__)

ChromaMetadata = dict[str, str | int]


class ChromaGetResult(TypedDict):
    ids: list[str]


class ChromaQueryResult(TypedDict):
    ids: list[list[str]]
    metadatas: list[list[ChromaMetadata]]
    distances: list[list[float]]


class RetrievedChunkData(TypedDict):
    id: str
    chunk_index: int
    source_page: int
    score: float


class ChromaCollection(Protocol):
    def upsert(
        self,
        *,
        ids: list[str],
        documents: list[str],
        embeddings: list[list[float]],
        metadatas: list[ChromaMetadata],
    ) -> None: ...

    def get(
        self,
        *,
        where: dict[str, str],
        include: list[str],
        limit: int | None = None,
    ) -> ChromaGetResult: ...

    def query(
        self,
        *,
        query_embeddings: list[list[float]],
        n_results: int,
        where: dict[str, str],
    ) -> ChromaQueryResult: ...

    def delete(self, *, ids: list[str]) -> None: ...


class ChromaClient(Protocol):
    def get_or_create_collection(
        self,
        *,
        name: str,
        metadata: dict[str, str],
    ) -> ChromaCollection: ...


_repository: ChromaRepository | None = None


class ChromaRepository:
    def __init__(self, chroma_url: str, collection_name: str):
        """
        Inicializa el repositorio de acceso a ChromaDB.

        Args:
            chroma_url (str): URL base del servidor Chroma.
            collection_name (str): Nombre de la colección donde se indexan chunks.
        """
        self.chroma_url = chroma_url
        self.collection_name = collection_name
        self._client: ChromaClient | None = None
        self._collection: ChromaCollection | None = None

    def upsert_manual(
        self,
        *,
        manual_id: str,
        game_id: str,
        owner_user_id: str,
        language: str | None,
        chunks: list[IngestChunk],
        embeddings: list[list[float]],
    ) -> int:
        """
        Inserta o reemplaza chunks cuyo ID canónico viene de Postgres.

        Args:
            manual_id (str): Identificador del manual persistido.
            game_id (str): Identificador del juego usado para filtrar en Chroma.
            owner_user_id (str): Propietario del manual para metadata derivada.
            language (str | None): Idioma del manual, si se conoce.
            chunks (list[IngestChunk]): Chunks ya creados y guardados por API.
            embeddings (list[list[float]]): Vectores alineados con ``chunks``.

        Returns:
            int: Número de chunks indexados.
        """
        collection = self._get_collection()
        ids = [chunk.id for chunk in chunks]
        documents = [chunk.text for chunk in chunks]
        metadatas = [
            _metadata(
                manual_id=manual_id,
                game_id=game_id,
                owner_user_id=owner_user_id,
                language=language,
                chunk=chunk,
            )
            for chunk in chunks
        ]

        collection.upsert(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        existing = collection.get(where={"manual_id": manual_id}, include=[])
        new_ids = set(ids)
        orphan_ids = [old_id for old_id in existing["ids"] if old_id not in new_ids]
        if orphan_ids:
            collection.delete(ids=orphan_ids)

        return len(chunks)

    def query_game(
        self,
        *,
        game_id: str,
        query_embedding: list[float],
        top_k: int,
    ) -> list[RetrievedChunkData]:
        """
        Recupera candidatos por juego; API rehidrata el texto desde Postgres.

        Args:
            game_id (str): Juego sobre el que se restringe la búsqueda.
            query_embedding (list[float]): Embedding de la pregunta del usuario.
            top_k (int): Número máximo de candidatos a devolver.

        Returns:
            list[RetrievedChunkData]: IDs rehidratables con score y metadatos.
        """
        collection = self._get_collection()
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where={"game_id": game_id},
        )
        ids = result["ids"][0]
        if not ids:
            raise ContextNotFoundError(game_id)

        metadatas = result["metadatas"][0]
        distances = result["distances"][0]
        scores = [max(0.0, 1.0 - float(distance)) for distance in distances]

        chunks: list[RetrievedChunkData] = []
        for chunk_id, metadata, score in zip(ids, metadatas, scores, strict=True):
            chunks.append(
                {
                    "id": chunk_id,
                    "chunk_index": int(metadata["chunk_index"]),
                    "source_page": int(metadata["source_page"]),
                    "score": round(score, 4),
                }
            )
        return chunks

    def delete_manual(self, *, manual_id: str, chunk_ids: list[str]) -> int:
        """
        Borra de Chroma los chunks derivados de un manual.

        Args:
            manual_id (str): Manual que se está eliminando en Postgres.
            chunk_ids (list[str]): IDs canónicos de chunks a borrar, si se conocen.

        Returns:
            int: Número de chunks eliminados del índice.
        """
        collection = self._get_collection()
        ids = chunk_ids or collection.get(where={"manual_id": manual_id}, include=[])["ids"]
        if not ids:
            return 0
        collection.delete(ids=ids)
        return len(ids)

    def manual_exists(self, manual_id: str) -> bool:
        """
        Comprueba si existe al menos un chunk indexado para un manual.

        Args:
            manual_id (str): Identificador del manual.

        Returns:
            bool: True si hay al menos un vector asociado.
        """
        collection = self._get_collection()
        result = collection.get(where={"manual_id": manual_id}, limit=1, include=[])
        return bool(result["ids"])

    def _get_collection(self) -> ChromaCollection:
        """
        Devuelve la colección de trabajo, creándola si es necesario.

        Returns:
            Collection: Colección Chroma inicializada.
        """
        if self._collection is None:
            client = self._get_client()
            self._collection = client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    def warm_up(self) -> None:
        """Inicializa la colección si todavía no está cargada."""
        self._get_collection()

    def _get_client(self) -> ChromaClient:
        """
        Crea perezosamente el cliente HTTP hacia ChromaDB.

        Returns:
            HttpClient: Cliente listo para operar contra el servidor Chroma.
        """
        if self._client is None:
            import chromadb

            parsed = urlparse(self.chroma_url)
            host = parsed.hostname or "chroma"
            port = parsed.port or 8000
            logger.info("Conectando con ChromaDB en %s:%s", host, port)
            self._client = chromadb.HttpClient(host=host, port=port)
        return self._client


def get_repository() -> ChromaRepository:
    """
    Devuelve la instancia singleton del repositorio de Chroma.

    Returns:
        ChromaRepository: Repositorio reutilizable para ingesta y recuperación.
    """
    global _repository
    repo = _repository
    if repo is None:
        repo = ChromaRepository(config.CHROMA_URL, config.CHROMA_COLLECTION)
        _repository = repo
    return repo


def _metadata(
    *,
    manual_id: str,
    game_id: str,
    owner_user_id: str,
    language: str | None,
    chunk: IngestChunk,
) -> ChromaMetadata:
    """Construye metadata denormalizada para filtrar sin joins en Chroma."""
    metadata: ChromaMetadata = {
        "manual_id": manual_id,
        "game_id": game_id,
        "owner_user_id": owner_user_id,
        "source_page": chunk.source_page,
        "chunk_index": chunk.chunk_index,
        "content_hash": chunk.content_hash,
        "language": language or "",
    }
    return metadata
