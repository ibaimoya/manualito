"""Pruebas unitarias de la búsqueda léxica BM25."""

from __future__ import annotations

import pytest

from rag.lexical import build_bm25_index, rank_bm25, tokenize

_GOLDEN_DOCUMENTS: list[list[str]] = [
    ["bosqu", "produc", "mader", "cad", "turn"],
    ["canter", "produc", "piedr"],
]
_GOLDEN_QUERY: list[str] = ["mader", "produc", "bosqu"]
_KNOWN_TOKENIZATIONS: list[tuple[str, list[str]]] = [
    ("¿Cómo se construye una carretera?", ["constru", "carreter"]),
    ("¿Cuántos puntos necesito para ganar?", ["punt", "necesit", "gan"]),
    ("El peón avanza dos casillas", ["peon", "avanz", "dos", "casill"]),
    (
        "Cuantos jugadores pueden jugar con la ampliacion?",
        ["jugador", "pued", "jug", "ampliacion"],
    ),
    ("tira el dado d6 y saca 10 o 2", ["tir", "dad", "d6", "sac", "10"]),
    ("¿y el de la o?", []),
    ("CARRETERAS", ["carreter"]),
    (
        "El bosque produce madera cada turno",
        ["bosqu", "produc", "mader", "cad", "turn"],
    ),
    ("La cantera produce piedra", ["canter", "produc", "piedr"]),
    ("¿Cuánta madera produce el bosque?", ["mader", "produc", "bosqu"]),
]


@pytest.mark.parametrize(("text", "expected"), _KNOWN_TOKENIZATIONS)
def test_tokenize_matches_known_answers(
    text: str,
    expected: list[str],
) -> None:
    """
    Conserva los resultados dorados de normalización y stemming.

    Args:
        text (str): Texto original que se tokeniza.
        expected (list[str]): Tokens dorados esperados.
    """
    assert tokenize(text) == expected


def test_tokenize_empty_text_returns_empty_list() -> None:
    """Devuelve una lista vacía cuando no existe texto."""
    assert tokenize("") == []


def test_tokenize_is_case_insensitive() -> None:
    """Produce los mismos tokens para mayúsculas y minúsculas."""
    assert tokenize("CARRETERAS") == tokenize("carreteras") == ["carreter"]


def test_build_bm25_index_records_statistics() -> None:
    """Conserva las estadísticas del corpus dorado en el índice."""
    index = build_bm25_index(_GOLDEN_DOCUMENTS)

    assert index.doc_count == 2
    assert index.avgdl == 4.0
    assert index.doc_lengths == (5, 3)
    assert index.postings["produc"] == ((0, 1), (1, 1))
    assert index.idf["produc"] > 0.0


def test_rank_bm25_matches_known_scores_and_order() -> None:
    """Obtiene los scores dorados y los ordena de mayor a menor."""
    index = build_bm25_index(_GOLDEN_DOCUMENTS)

    ranking = rank_bm25(index=index, query_tokens=_GOLDEN_QUERY)

    assert [doc_id for doc_id, _ in ranking] == [0, 1]
    assert [round(score, 6) for _, score in ranking] == [1.409992, 0.205433]


def test_rank_bm25_keeps_idf_positive_for_term_in_every_document() -> None:
    """Puntúa ambos documentos cuando el término aparece en todo el corpus."""
    index = build_bm25_index(_GOLDEN_DOCUMENTS)

    scores = dict(rank_bm25(index=index, query_tokens=["produc"]))

    assert index.idf["produc"] > 0.0
    assert set(scores) == {0, 1}
    assert all(score > 0.0 for score in scores.values())


def test_rank_bm25_saturates_term_frequency() -> None:
    """Premia una frecuencia mayor entre documentos de la misma longitud."""
    index = build_bm25_index(
        [
            ["mader", "mader", "mader", "rellen"],
            ["mader", "rellen", "extra", "adicion"],
        ]
    )

    scores = dict(rank_bm25(index=index, query_tokens=["mader"]))

    assert scores[0] > scores[1] > 0.0


def test_rank_bm25_normalizes_document_length() -> None:
    """Premia el documento corto cuando la frecuencia es idéntica."""
    index = build_bm25_index(
        [
            ["mader"],
            ["mader", "rellen", "extra"],
        ]
    )

    scores = dict(rank_bm25(index=index, query_tokens=["mader"]))

    assert scores[0] > scores[1] > 0.0


def test_rank_bm25_preserves_corpus_order_on_exact_tie() -> None:
    """Mantiene el orden original cuando dos documentos empatan."""
    index = build_bm25_index(
        [
            ["mism", "token"],
            ["mism", "token"],
        ]
    )

    ranking = rank_bm25(index=index, query_tokens=["mism"])

    assert [doc_id for doc_id, _ in ranking] == [0, 1]
    assert ranking[0][1] == ranking[1][1]


def test_empty_corpus_builds_usable_index() -> None:
    """Construye un índice vacío que admite búsquedas."""
    index = build_bm25_index([])

    assert index.doc_count == 0
    assert index.avgdl == 0.0
    assert index.doc_lengths == ()
    assert index.postings == {}
    assert index.idf == {}
    assert rank_bm25(index=index, query_tokens=["mader"]) == []


def test_rank_bm25_returns_empty_ranking_for_empty_query() -> None:
    """No devuelve documentos cuando la consulta está vacía."""
    index = build_bm25_index(_GOLDEN_DOCUMENTS)

    assert rank_bm25(index=index, query_tokens=[]) == []


def test_rank_bm25_handles_documents_without_tokens() -> None:
    """Evita divisiones entre cero si ningún documento conserva tokens."""
    documents = [
        tokenize("¿y el de la o?"),
        tokenize("a e u"),
    ]

    index = build_bm25_index(documents)

    assert index.doc_count == 2
    assert index.avgdl == 0.0
    assert rank_bm25(index=index, query_tokens=["mader"]) == []


def test_rank_bm25_ignores_repeated_query_terms() -> None:
    """Un término repetido en la consulta puntúa igual que uno solo."""
    index = build_bm25_index(_GOLDEN_DOCUMENTS)

    single = rank_bm25(index=index, query_tokens=["mader"])
    repeated = rank_bm25(index=index, query_tokens=["mader", "mader", "mader"])

    assert repeated == single


def test_rank_bm25_omits_documents_without_matching_terms() -> None:
    """Devuelve únicamente documentos con un score positivo."""
    index = build_bm25_index([["conoc"], ["distint"]])

    assert rank_bm25(index=index, query_tokens=["ausent"]) == []
    assert [
        doc_id
        for doc_id, _ in rank_bm25(index=index, query_tokens=["conoc"])
    ] == [0]
