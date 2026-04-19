from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
_embedder: "EmbeddingService | None" = None


class EmbeddingService:
    def __init__(self, model_id: str):
        """
        Inicializa el servicio de embeddings basado en SentenceTransformers.

        Args:
            model_id (str): Identificador del modelo a cargar desde caché o Hub.
        """
        self.model_id = model_id
        self._model: "SentenceTransformer | None" = None

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        """
        Genera embeddings de pasajes usando el prefijo requerido por E5.

        Args:
            texts (list[str]): Chunks o pasajes a vectorizar.

        Returns:
            list[list[float]]: Vectores densos, uno por pasaje.
        """
        return self._encode([f"passage: {text}" for text in texts])

    def embed_query(self, text: str) -> list[float]:
        """
        Genera el embedding de una consulta usando el prefijo de query.

        Args:
            text (str): Pregunta del usuario.

        Returns:
            list[float]: Vector denso correspondiente a la consulta.
        """
        return self._encode([f"query: {text}"])[0]

    def _encode(self, texts: list[str]) -> list[list[float]]:
        """
        Codifica una lista de textos con el modelo cargado.

        Args:
            texts (list[str]): Textos preparados para el modelo.

        Returns:
            list[list[float]]: Embeddings en formato serializable.
        """
        model = self._load_model()
        vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return vectors.tolist()

    def _load_model(self) -> "SentenceTransformer":
        """
        Carga perezosamente el modelo de embeddings y lo reutiliza.

        Returns:
            SentenceTransformer: Instancia singleton del modelo configurado.
        """
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            logger.info("Cargando modelo de embeddings: %s", self.model_id)
            self._model = SentenceTransformer(self.model_id)
        return self._model


def get_embedding_service() -> EmbeddingService:
    """
    Devuelve la instancia singleton del servicio de embeddings.

    Returns:
        EmbeddingService: Servicio reutilizable para pasajes y queries.
    """
    global _embedder
    if _embedder is None:
        _embedder = EmbeddingService(EMBEDDING_MODEL)
    return _embedder
