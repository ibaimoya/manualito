"""Consenso por mayoría de ediciones de palabras entre candidatos del LLM."""

from __future__ import annotations

import difflib
import re
from collections.abc import Sequence
from dataclasses import dataclass

_MAJORITY_VOTES = 2
_DIGIT_PATTERN = re.compile(r"\d+")


@dataclass(frozen=True, slots=True)
class WordEdit:
    start: int
    end: int
    replacement: tuple[str, ...]


def word_edits(original: str, candidate: str) -> tuple[WordEdit, ...]:
    """Extrae las ediciones a nivel de palabra entre el original y un candidato."""
    original_words = original.split()
    candidate_words = candidate.split()
    matcher = difflib.SequenceMatcher(None, original_words, candidate_words)
    edits = []
    for tag, start, end, candidate_start, candidate_end in matcher.get_opcodes():
        if tag != "equal":
            replacement = tuple(candidate_words[candidate_start:candidate_end])
            edits.append(WordEdit(start, end, replacement))
    return tuple(edits)


def apply_word_edits(original: str, edits: Sequence[WordEdit]) -> str:
    """Aplica las ediciones al original de atrás hacia delante."""
    words = original.split()
    for edit in sorted(edits, key=lambda item: -item.start):
        words[edit.start : edit.end] = list(edit.replacement)
    return " ".join(words)


def consensus_correction(original: str, candidates: Sequence[str]) -> str:
    """Aplica solo las ediciones votadas por la mayoría que superan los candados."""
    edit_lists = [word_edits(original, candidate) for candidate in candidates]
    original_words = original.split()
    approved: list[WordEdit] = []
    for edit in dict.fromkeys(edit for edits in edit_lists for edit in edits):
        votes = sum(edit in edits for edits in edit_lists)
        if votes < _MAJORITY_VOTES:
            continue
        if not edit.replacement:
            continue
        if not _keeps_digit_sequence(original_words[edit.start : edit.end], edit.replacement):
            continue
        if _overlaps_any(edit, approved):
            continue
        approved.append(edit)
    return apply_word_edits(original, approved)


def _keeps_digit_sequence(original_span: Sequence[str], replacement: Sequence[str]) -> bool:
    return _DIGIT_PATTERN.findall(" ".join(original_span)) == _DIGIT_PATTERN.findall(
        " ".join(replacement)
    )


def _overlaps_any(edit: WordEdit, approved: Sequence[WordEdit]) -> bool:
    return any(edit.start < other.end and other.start < edit.end for other in approved)
