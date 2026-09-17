from __future__ import annotations

from typing import TypedDict

from rag.repository import (
    ChromaCollection,
    ChromaGetResult,
    ChromaMetadata,
    ChromaQueryResult,
    ChromaWhere,
)


class FakeChromaRecord(TypedDict):
    """Representa un registro almacenado por la colección falsa."""

    id: str
    document: str
    embedding: list[float]
    metadata: ChromaMetadata


class FakeUpsertCall(TypedDict):
    """Registra los argumentos de una operación de escritura."""

    ids: list[str]
    documents: list[str]
    embeddings: list[list[float]]
    metadatas: list[ChromaMetadata]


class FakeGetCall(TypedDict):
    """Registra los argumentos de una consulta por metadatos."""

    include: list[str]
    where: ChromaWhere | None
    limit: int | None
    offset: int | None


class FakeQueryCall(TypedDict):
    """Registra los argumentos de una consulta por similitud."""

    query_embeddings: list[list[float]]
    n_results: int
    where: ChromaWhere


class FakeChromaCollection(ChromaCollection):
    """
    Mantiene registros de Chroma en memoria para probar el repositorio.

    Args:
        records (list[FakeChromaRecord] | None): Registros iniciales.
        query_order (list[str] | None): Orden fijo de IDs para las consultas.
        query_distances (list[float] | None): Distancias asociadas al orden fijo.
        omit_documents (bool): Indica si ``get`` debe omitir los documentos.
        omit_metadatas (bool): Indica si ``get`` debe omitir los metadatos.

    Raises:
        ValueError: Si el orden y las distancias tienen longitudes distintas.
    """

    def __init__(
        self,
        *,
        records: list[FakeChromaRecord] | None = None,
        query_order: list[str] | None = None,
        query_distances: list[float] | None = None,
        omit_documents: bool = False,
        omit_metadatas: bool = False,
    ) -> None:
        self.records = [
            {
                "id": record["id"],
                "document": record["document"],
                "embedding": list(record["embedding"]),
                "metadata": dict(record["metadata"]),
            }
            for record in records or []
        ]
        self._query_order = list(query_order) if query_order is not None else None
        distance_order = (
            query_order
            if query_order is not None
            else [record["id"] for record in self.records]
        )
        if (
            query_distances is not None
            and len(distance_order) != len(query_distances)
        ):
            raise ValueError(
                "El orden de consulta y sus distancias deben tener igual longitud."
            )
        self._query_distances = (
            dict(zip(distance_order, query_distances, strict=True))
            if query_distances is not None
            else {}
        )
        self._omit_documents = omit_documents
        self._omit_metadatas = omit_metadatas
        self.upsert_calls: list[FakeUpsertCall] = []
        self.get_calls: list[FakeGetCall] = []
        self.query_calls: list[FakeQueryCall] = []
        self.delete_calls: list[list[str]] = []

    def upsert(
        self,
        *,
        ids: list[str],
        documents: list[str],
        embeddings: list[list[float]],
        metadatas: list[ChromaMetadata],
    ) -> None:
        """
        Inserta registros nuevos y reemplaza los que comparten ID.

        Args:
            ids (list[str]): Identificadores de los registros.
            documents (list[str]): Textos asociados.
            embeddings (list[list[float]]): Vectores asociados.
            metadatas (list[ChromaMetadata]): Metadatos asociados.
        """
        self.upsert_calls.append(
            {
                "ids": list(ids),
                "documents": list(documents),
                "embeddings": [list(embedding) for embedding in embeddings],
                "metadatas": [dict(metadata) for metadata in metadatas],
            }
        )
        positions = {
            record["id"]: position for position, record in enumerate(self.records)
        }

        for record_id, document, embedding, metadata in zip(
            ids,
            documents,
            embeddings,
            metadatas,
            strict=True,
        ):
            record: FakeChromaRecord = {
                "id": record_id,
                "document": document,
                "embedding": list(embedding),
                "metadata": dict(metadata),
            }
            position = positions.get(record_id)
            if position is None:
                positions[record_id] = len(self.records)
                self.records.append(record)
            else:
                self.records[position] = record

    def get(
        self,
        *,
        include: list[str],
        where: ChromaWhere | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> ChromaGetResult:
        """
        Recupera registros filtrados y paginados en orden de almacenamiento.

        Args:
            include (list[str]): Campos opcionales que debe incluir la respuesta.
            where (ChromaWhere | None): Filtro de igualdad o pertenencia.
            limit (int | None): Número máximo de registros.
            offset (int | None): Posición inicial de la página.

        Returns:
            ChromaGetResult: Página solicitada con los campos incluidos.
        """
        self.get_calls.append(
            {
                "include": list(include),
                "where": dict(where) if where is not None else None,
                "limit": limit,
                "offset": offset,
            }
        )
        matching = [
            record
            for record in self.records
            if where is None or self._matches_where(record, where)
        ]
        start = offset or 0
        stop = None if limit is None else start + limit
        page = matching[start:stop]
        result: ChromaGetResult = {
            "ids": [record["id"] for record in page],
        }

        if "documents" in include and not self._omit_documents:
            result["documents"] = [record["document"] for record in page]
        if "metadatas" in include and not self._omit_metadatas:
            result["metadatas"] = [
                dict(record["metadata"]) for record in page
            ]

        return result

    def query(
        self,
        *,
        query_embeddings: list[list[float]],
        n_results: int,
        where: ChromaWhere,
    ) -> ChromaQueryResult:
        """
        Devuelve registros filtrados con un orden y distancias deterministas.

        Args:
            query_embeddings (list[list[float]]): Vectores consultados.
            n_results (int): Número máximo de resultados.
            where (ChromaWhere): Filtro aplicado antes de ordenar.

        Returns:
            ChromaQueryResult: IDs, metadatos y distancias de la consulta.
        """
        self.query_calls.append(
            {
                "query_embeddings": [
                    list(embedding) for embedding in query_embeddings
                ],
                "n_results": n_results,
                "where": dict(where),
            }
        )
        matching = [
            record for record in self.records if self._matches_where(record, where)
        ]

        if self._query_order is not None:
            by_id = {record["id"]: record for record in matching}
            ordered = [
                by_id[record_id]
                for record_id in self._query_order
                if record_id in by_id
            ]
            matching = ordered

        selected = matching[:n_results]
        distances = [
            self._query_distances.get(record["id"], (position + 1) / 10)
            for position, record in enumerate(selected)
        ]
        return {
            "ids": [[record["id"] for record in selected]],
            "metadatas": [
                [dict(record["metadata"]) for record in selected]
            ],
            "distances": [distances],
        }

    def delete(self, *, ids: list[str]) -> None:
        """
        Elimina los registros cuyos IDs aparecen en la petición.

        Args:
            ids (list[str]): Identificadores que deben eliminarse.
        """
        self.delete_calls.append(list(ids))
        deleted_ids = set(ids)
        self.records = [
            record for record in self.records if record["id"] not in deleted_ids
        ]

    @staticmethod
    def _matches_where(
        record: FakeChromaRecord,
        where: ChromaWhere,
    ) -> bool:
        """
        Comprueba filtros simples y filtros con el operador ``$in``.

        Args:
            record (FakeChromaRecord): Registro que se quiere comprobar.
            where (ChromaWhere): Condiciones exigidas.

        Returns:
            bool: True cuando el registro satisface todas las condiciones.
        """
        for key, expected in where.items():
            actual = record["metadata"].get(key)
            if isinstance(expected, str):
                if actual != expected:
                    return False
            elif actual not in expected.get("$in", []):
                return False
        return True
