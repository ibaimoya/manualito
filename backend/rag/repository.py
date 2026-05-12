from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

CHROMA_URL = os.getenv("CHROMA_URL", "http://chroma:8000")
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "manualito_manuals")
_repository: ChromaRepository | None = None


class ManualNotFoundError(Exception):
    pass


class ChromaRepository:
    def __init__(self, chroma_url: str, collection_name: str):
        """
        Inicializa el repositorio de acceso a ChromaDB.

        Args:
            chroma_url (str): URL base del servidor Chroma.
            collection_name (str): Nombre de la colección donde se persisten
                                   los chunks de manuales.
        """
        self.chroma_url = chroma_url
        self.collection_name = collection_name
        self._client = None
        self._collection = None

    def upsert_manual(
        self,
        *,
        manual_id: str,
        chunks: list[str],
        embeddings: list[list[float]],
        source_page: int | None = None,
    ) -> int:
        """
        Inserta o reemplaza todos los chunks asociados a un manual.

        El orden es: primero hace ``upsert`` de los nuevos chunks (los IDs
        ``{manual_id}:{i}`` son determinísticos, por lo que Chroma sobrescribe
        atómicamente los que ya existían con esos mismos IDs) y después borra
        únicamente los IDs "huérfanos" de una versión anterior más larga.
        Si el upsert falla a mitad, el manual se queda con la versión vieja
        en vez de quedar vacío.

        Nota: el invariante asumido es que ``manual_id`` es un slug sin ``:``
        (la capa gateway lo construye con ``[a-z0-9-]+``). Si cambia, habrá
        que sanear el ID antes de formar los IDs de chunk.

        Args:
            manual_id (str): Identificador estable del manual.
            chunks (list[str]): Chunks textuales generados para el manual.
            embeddings (list[list[float]]): Embeddings alineados con los chunks.
            source_page (int | None): Página origen, si se conoce.

        Returns:
            int: Número de chunks persistidos.
        """
        collection = self._get_collection()
        ids = [f"{manual_id}:{index}" for index in range(len(chunks))]
        metadatas = [
            {
                "manual_id": manual_id,
                "chunk_index": index,
                "length": len(chunk),
                "source_page": source_page or 1,
            }
            for index, chunk in enumerate(chunks)
        ]

        collection.upsert(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        # Tras asegurar la versión nueva, limpia los chunks huérfanos de
        # revisiones anteriores con más chunks que la actual. Si esta fase
        # falla, queda basura indexada pero el manual sigue respondiendo.
        existing = collection.get(where={"manual_id": manual_id}, include=[])
        new_ids = set(ids)
        orphan_ids = [old_id for old_id in existing["ids"] if old_id not in new_ids]
        if orphan_ids:
            collection.delete(ids=orphan_ids)

        return len(chunks)

    def query_manual(
        self,
        *,
        manual_id: str,
        query_embedding: list[float],
        top_k: int,
    ) -> list[dict[str, object]]:
        """
        Recupera los chunks más relevantes de un manual por similitud vectorial.

        Hace una única llamada a ChromaDB y detecta la ausencia del manual
        por ``result["ids"][0]`` vacío, ahorrando un roundtrip y eliminando
        la race condition entre un hipotético ``manual_exists`` previo y la
        query real.

        El score devuelto es ``max(0, 1 - cosine_distance)``, acotado en
        ``[0, 1]`` (1 = idéntico, 0 = ortogonal o más lejano).

        Args:
            manual_id (str): Manual sobre el que se restringe la búsqueda.
            query_embedding (list[float]): Embedding de la pregunta del usuario.
            top_k (int): Número máximo de chunks a devolver.

        Returns:
            list[dict[str, object]]: Chunks recuperados con metadatos y score.

        Raises:
            ManualNotFoundError: Si el manual no tiene chunks indexados.
        """
        collection = self._get_collection()
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where={"manual_id": manual_id},
        )
        ids = result["ids"][0]
        if not ids:
            raise ManualNotFoundError(manual_id)

        documents = result["documents"][0]
        metadatas = result["metadatas"][0]
        distances = result["distances"][0]
        scores = [max(0.0, 1.0 - float(distance)) for distance in distances]

        chunks: list[dict[str, object]] = []
        for chunk_id, document, metadata, score in zip(
            ids, documents, metadatas, scores, strict=True
        ):
            chunks.append(
                {
                    "id": chunk_id,
                    "text": document,
                    "chunk_index": metadata["chunk_index"],
                    "source_page": metadata["source_page"],
                    "score": round(score, 4),
                }
            )
        return chunks

    def manual_exists(self, manual_id: str) -> bool:
        """
        Comprueba si existe al menos un chunk indexado para un manual.

        Se conserva por si se necesita en tests o introspección, pero ya no
        se invoca desde ``query_manual`` (la detección de "no existe" se hace
        directamente a partir del resultado de la query).

        Args:
            manual_id (str): Identificador del manual.

        Returns:
            bool: ``True`` si el manual existe en la colección, ``False`` si no.
        """
        collection = self._get_collection()
        result = collection.get(where={"manual_id": manual_id}, limit=1, include=[])
        return bool(result["ids"])

    def _get_collection(self):
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

    def _get_client(self):
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
    if _repository is None:
        _repository = ChromaRepository(CHROMA_URL, CHROMA_COLLECTION)
    return _repository
