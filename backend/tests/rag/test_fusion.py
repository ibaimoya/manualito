from rag.fusion import fuse_rrf


def test_fuse_rrf_combines_overlapping_rankings() -> None:
    """Combina las puntuaciones de los hashes presentes en ambas patas."""
    assert fuse_rrf(
        semantic=["h1", "h2", "h3"],
        lexical=["h2", "h4"],
    ) == [
        ("h2", 1 / 62 + 1 / 61),
        ("h1", 1 / 61),
        ("h4", 1 / 62),
        ("h3", 1 / 63),
    ]


def test_fuse_rrf_prefers_semantic_result_on_simple_tie() -> None:
    """Prioriza la pata semántica cuando dos puntuaciones empatan."""
    result = fuse_rrf(semantic=["h1"], lexical=["h2"])

    assert [content_hash for content_hash, _score in result] == ["h1", "h2"]


def test_fuse_rrf_uses_semantic_position_on_crossed_tie() -> None:
    """Usa el puesto semántico para resolver un empate cruzado."""
    result = fuse_rrf(semantic=["a", "b"], lexical=["b", "a"])

    assert [content_hash for content_hash, _score in result] == ["a", "b"]


def test_fuse_rrf_keeps_semantic_order_when_lexical_is_empty() -> None:
    """Conserva el orden semántico cuando no hay resultados léxicos."""
    result = fuse_rrf(semantic=["h1", "h2", "h3"], lexical=[])

    assert [content_hash for content_hash, _score in result] == [
        "h1",
        "h2",
        "h3",
    ]


def test_fuse_rrf_keeps_lexical_order_when_semantic_is_empty() -> None:
    """Conserva el orden léxico cuando no hay resultados semánticos."""
    result = fuse_rrf(semantic=[], lexical=["h1", "h2", "h3"])

    assert [content_hash for content_hash, _score in result] == [
        "h1",
        "h2",
        "h3",
    ]


def test_fuse_rrf_returns_empty_result_for_empty_rankings() -> None:
    """Devuelve una lista vacía cuando ambas patas están vacías."""
    assert fuse_rrf(semantic=[], lexical=[]) == []


def test_fuse_rrf_keeps_all_disjoint_candidates() -> None:
    """Conserva los cuarenta candidatos de dos patas disjuntas."""
    semantic = [f"semantic-{position}" for position in range(20)]
    lexical = [f"lexical-{position}" for position in range(20)]

    result = fuse_rrf(semantic=semantic, lexical=lexical)

    assert len(result) == 40
    assert {content_hash for content_hash, _score in result} == {
        *semantic,
        *lexical,
    }
