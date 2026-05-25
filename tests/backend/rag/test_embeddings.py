import sys
from types import SimpleNamespace
from typing import ClassVar

import pytest

import rag.embeddings as embeddings


class _FakeVectors:
    def __init__(self, values):
        self._values = values

    def tolist(self):
        return self._values


class _FakeSentenceTransformer:
    created_with: ClassVar[list[str]] = []
    encoded_batches: ClassVar[list[list[str]]] = []

    def __init__(self, model_id: str):
        self.model_id = model_id
        self.__class__.created_with.append(model_id)

    def encode(self, texts, *, convert_to_numpy, show_progress_bar):
        assert convert_to_numpy is True
        assert show_progress_bar is False
        self.__class__.encoded_batches.append(list(texts))
        return _FakeVectors([[float(len(text))] for text in texts])


@pytest.fixture(autouse=True)
def reset_embedding_singletons(monkeypatch):
    """Reinicia el singleton global del servicio entre tests."""
    monkeypatch.setattr(embeddings, "_embedder", None)
    yield
    monkeypatch.setattr(embeddings, "_embedder", None)


@pytest.fixture
def fake_sentence_transformers(monkeypatch):
    """Sustituye sentence_transformers por un doble ligero y determinista."""
    _FakeSentenceTransformer.created_with = []
    _FakeSentenceTransformer.encoded_batches = []
    monkeypatch.setitem(
        sys.modules,
        "sentence_transformers",
        SimpleNamespace(SentenceTransformer=_FakeSentenceTransformer),
    )
    yield
    sys.modules.pop("sentence_transformers", None)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — generación de embeddings
#   Clase 1: Pasajes — se prefijan con "passage: ".
#   Clase 2: Query — se prefija con "query: ".
# ---------------------------------------------------------------------------
def test_embed_passages_applies_e5_prefix(fake_sentence_transformers):
    """Los pasajes se codifican con el prefijo requerido por el modelo E5."""
    service = embeddings.EmbeddingService("modelo-prueba")

    vectors = service.embed_passages(["Regla uno", "Regla dos"])

    assert vectors == [[18.0], [18.0]]
    assert _FakeSentenceTransformer.created_with == ["modelo-prueba"]
    assert _FakeSentenceTransformer.encoded_batches == [
        ["passage: Regla uno", "passage: Regla dos"]
    ]


def test_embed_query_applies_query_prefix(fake_sentence_transformers):
    """La pregunta del usuario se codifica con el prefijo de query."""
    service = embeddings.EmbeddingService("modelo-prueba")

    vector = service.embed_query("¿Cómo se gana?")

    assert vector == [21.0]
    assert _FakeSentenceTransformer.encoded_batches == [["query: ¿Cómo se gana?"]]


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — reutilización del modelo cargado
#   Dos llamadas consecutivas deben reutilizar la misma instancia.
# ---------------------------------------------------------------------------
def test_warm_up_reuses_cached_model(fake_sentence_transformers):
    """El warmup carga SentenceTransformers una sola vez por servicio."""
    service = embeddings.EmbeddingService("modelo-prueba")

    service.warm_up()
    service.warm_up()

    assert _FakeSentenceTransformer.created_with == ["modelo-prueba"]


def test_get_embedding_service_returns_singleton():
    """La factoría global devuelve siempre la misma instancia compartida."""
    first = embeddings.get_embedding_service()
    second = embeddings.get_embedding_service()

    assert first is second
