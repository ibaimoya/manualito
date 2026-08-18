_RRF_K = 60


def fuse_rrf(
    *,
    semantic: list[str],
    lexical: list[str],
) -> list[tuple[str, float]]:
    """
    Fusiona dos rankings deduplicados mediante Reciprocal Rank Fusion.

    Args:
        semantic (list[str]): Hashes ordenados por relevancia semántica.
        lexical (list[str]): Hashes ordenados por relevancia léxica.

    Returns:
        list[tuple[str, float]]: Hashes fusionados con su puntuación RRF.
    """
    semantic_positions = {
        content_hash: position
        for position, content_hash in enumerate(semantic, start=1)
    }
    lexical_positions = {
        content_hash: position
        for position, content_hash in enumerate(lexical, start=1)
    }
    content_hashes = semantic_positions.keys() | lexical_positions.keys()
    scores = {
        content_hash: sum(
            1 / (_RRF_K + positions[content_hash])
            for positions in (semantic_positions, lexical_positions)
            if content_hash in positions
        )
        for content_hash in content_hashes
    }
    semantic_fallback = len(semantic) + 1
    lexical_fallback = len(lexical) + 1

    def sort_key(content_hash: str) -> tuple[float, bool, int, int, str]:
        return (
            -scores[content_hash],
            content_hash not in semantic_positions,
            semantic_positions.get(content_hash, semantic_fallback),
            lexical_positions.get(content_hash, lexical_fallback),
            content_hash,
        )

    return [
        (content_hash, scores[content_hash])
        for content_hash in sorted(content_hashes, key=sort_key)
    ]
