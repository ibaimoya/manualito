from rag.exceptions import (
    ChunkGenerationError,
    EmptyDocumentError,
    ManualNotFoundError,
    RagError,
    RagIndexingError,
    RagRetrievalError,
)


def test_rag_exceptions_inherit_from_rag_error():
    """Todas las excepciones RAG heredan de su base de dominio."""
    assert issubclass(ManualNotFoundError, RagError)
    assert issubclass(EmptyDocumentError, RagError)
    assert issubclass(ChunkGenerationError, RagError)
    assert issubclass(RagIndexingError, RagError)
    assert issubclass(RagRetrievalError, RagError)
