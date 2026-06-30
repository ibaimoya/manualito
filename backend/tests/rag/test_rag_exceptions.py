from rag.exceptions import (
    ContextNotFoundError,
    RagDeletionError,
    RagError,
    RagIndexingError,
    RagRetrievalError,
)


def test_rag_exceptions_inherit_from_rag_error():
    """Todas las excepciones RAG heredan de su base de dominio."""
    assert issubclass(ContextNotFoundError, RagError)
    assert issubclass(RagIndexingError, RagError)
    assert issubclass(RagRetrievalError, RagError)
    assert issubclass(RagDeletionError, RagError)
