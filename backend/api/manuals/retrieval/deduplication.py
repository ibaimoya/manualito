"""Deduplicación de chunks antes de construir contexto."""

from collections.abc import Iterable

from api.manuals.repository import AuthorizedChunk


def deduplicate_chunks(chunks: Iterable[AuthorizedChunk]) -> list[AuthorizedChunk]:
    """Descarta chunks con el mismo content_hash preservando el orden."""
    seen_hashes: set[str] = set()
    unique_chunks: list[AuthorizedChunk] = []
    for chunk in chunks:
        if chunk.content_hash in seen_hashes:
            continue
        seen_hashes.add(chunk.content_hash)
        unique_chunks.append(chunk)
    return unique_chunks
