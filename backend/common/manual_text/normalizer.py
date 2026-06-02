from __future__ import annotations

import re


def _normalize_text(text: str) -> str:
    """
    Normaliza un bloque de texto libre antes del chunking.

    Unifica saltos de línea, colapsa espacios redundantes dentro de cada línea
    y reduce secuencias largas de líneas vacías a dobles saltos de línea.
    """
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(_normalize_line(line) for line in normalized.split("\n"))
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def normalize_ocr_lines(lines: list[dict[str, object]]) -> str:
    """
    Convierte líneas OCR estructuradas en un bloque de texto normalizado.

    Descarta líneas cuyo ``text`` no sea una cadena no vacía para no contaminar
    el corpus con valores inesperados.
    """
    normalized_lines = []
    for line in lines:
        text = line.get("text")
        if isinstance(text, str) and text.strip():
            normalized_lines.append(_normalize_line(text))
    content = "\n".join(normalized_lines)
    return _normalize_text(content)


def _normalize_line(line: str) -> str:
    """Colapsa espacios y recorta una línea individual."""
    return re.sub(r"[ \t]+", " ", line).strip()
