"""Tokenización en español e índice léxico BM25."""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import cast

import snowballstemmer

_K1 = 1.5
_B = 0.75
_TOKEN_PATTERN: re.Pattern[str] = re.compile(r"\w+")
_STOPWORDS: frozenset[str] = frozenset(
    [
        "el", "la", "los", "las", "un", "una", "unos", "unas",
        "de", "del", "al", "a", "ante", "bajo", "con", "contra",
        "desde", "durante", "en", "entre", "hacia", "hasta", "para",
        "por", "segun", "sin", "sobre", "tras",
        "y", "e", "o", "u", "ni",
        "que", "como", "cual", "cuales", "quien", "quienes",
        "cuando", "donde", "cuanto", "cuanta", "cuantos", "cuantas",
        "se", "si", "es", "son", "era", "eran", "fue", "fueron",
        "hay", "ha", "han", "ser", "estar", "esta", "estan",
        "me", "te", "le", "les", "lo", "su", "sus", "mi", "mis",
        "tu", "tus",
    ]
)


@dataclass(frozen=True)
class Bm25Index:
    """
    Conserva las estadísticas necesarias para calcular BM25.

    Attributes:
        doc_count (int): Número de documentos del corpus.
        avgdl (float): Longitud media de los documentos.
        doc_lengths (tuple[int, ...]): Longitud de cada documento.
        postings (dict[str, tuple[tuple[int, int], ...]]): Documentos y
            frecuencias asociados a cada término.
        idf (dict[str, float]): Frecuencia inversa precomputada por término.
    """

    doc_count: int
    avgdl: float
    doc_lengths: tuple[int, ...]
    postings: dict[str, tuple[tuple[int, int], ...]]
    idf: dict[str, float]


def _remove_accents(text: str) -> str:
    """
    Elimina marcas combinadas de un texto descompuesto con NFD.

    Args:
        text (str): Texto que puede contener acentos o eñes.

    Returns:
        str: Texto sin marcas combinadas.
    """
    return "".join(
        character
        for character in unicodedata.normalize("NFD", text)
        if not unicodedata.combining(character)
    )


def tokenize(text: str) -> list[str]:
    """
    Convierte texto en tokens normalizados mediante Snowball español.

    Args:
        text (str): Texto original con sus acentos.

    Returns:
        list[str]: Tokens filtrados, stemmizados y sin acentos.
    """
    stemmer = snowballstemmer.stemmer("spanish")
    tokens: list[str] = []

    for token in _TOKEN_PATTERN.findall(text.lower()):
        normalized = _remove_accents(token)
        if len(normalized) <= 1 or normalized in _STOPWORDS:
            continue
        stem = cast(str, stemmer.stemWord(token))
        tokens.append(_remove_accents(stem))

    return tokens


def build_bm25_index(documents: list[list[str]]) -> Bm25Index:
    """
    Construye las estadísticas BM25 de un corpus tokenizado.

    Args:
        documents (list[list[str]]): Documentos en su orden original.

    Returns:
        Bm25Index: Índice congelado con longitudes, postings e IDF.
    """
    doc_count = len(documents)
    doc_lengths = tuple(len(document) for document in documents)
    avgdl = sum(doc_lengths) / doc_count if doc_count else 0.0
    posting_lists: defaultdict[str, list[tuple[int, int]]] = defaultdict(list)

    for doc_id, document in enumerate(documents):
        for term, frequency in Counter(document).items():
            posting_lists[term].append((doc_id, frequency))

    postings = {
        term: tuple(entries)
        for term, entries in posting_lists.items()
    }
    idf = {
        term: math.log(
            1.0
            + (doc_count - len(entries) + 0.5)
            / (len(entries) + 0.5)
        )
        for term, entries in postings.items()
    }

    return Bm25Index(
        doc_count=doc_count,
        avgdl=avgdl,
        doc_lengths=doc_lengths,
        postings=postings,
        idf=idf,
    )


def rank_bm25(
    *,
    index: Bm25Index,
    query_tokens: list[str],
) -> list[tuple[int, float]]:
    """
    Ordena los documentos con coincidencias según su score BM25.

    Args:
        index (Bm25Index): Índice construido sobre el corpus.
        query_tokens (list[str]): Tokens de la consulta, los repetidos solo puntúan una vez.

    Returns:
        list[tuple[int, float]]: Posiciones y scores positivos en orden
            descendente, con empates resueltos por orden del corpus.
    """
    if not query_tokens or not index.postings:
        return []

    scores = [0.0] * index.doc_count

    for term in dict.fromkeys(query_tokens):
        term_idf = index.idf.get(term)
        if term_idf is None:
            continue

        for doc_id, frequency in index.postings[term]:
            length_ratio = index.doc_lengths[doc_id] / index.avgdl
            denominator = frequency + _K1 * (
                1.0 - _B + _B * length_ratio
            )
            scores[doc_id] += (
                term_idf * frequency * (_K1 + 1.0) / denominator
            )

    ranking = [
        (doc_id, score)
        for doc_id, score in enumerate(scores)
        if score > 0.0
    ]
    ranking.sort(key=lambda result: (-result[1], result[0]))
    return ranking
