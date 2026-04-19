from __future__ import annotations

import re


def normalize_text(text: str) -> str:
    """
    Normaliza un bloque de texto libre antes del chunking.

    Unifica saltos de línea, colapsa espacios redundantes dentro de cada línea
    y reduce secuencias largas de líneas vacías a dobles saltos de línea.

    Args:
        text (str): Texto completo a normalizar.

    Returns:
        str: Texto normalizado, listo para indexación.
    """
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = "\n".join(_normalize_line(line) for line in normalized.split("\n"))
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def normalize_ocr_lines(lines: list[dict[str, object]]) -> str:
    """
    Convierte líneas OCR estructuradas en un bloque de texto normalizado.

    Descarta líneas cuyo ``text`` no sea una cadena no vacía. Esto evita que
    valores inesperados (``None``, números, etc.) contaminen el corpus al
    coercerse a string ("None", "0", ...).

    Args:
        lines (list[dict[str, object]]): Líneas OCR con al menos la clave
                                         ``text`` y opcionalmente otros metadatos.

    Returns:
        str: Texto consolidado y normalizado a partir de las líneas OCR.
    """
    content = "\n".join(
        _normalize_line(line["text"])
        for line in lines
        if isinstance(line.get("text"), str) and line["text"].strip()
    )
    return normalize_text(content)


def _normalize_line(line: str) -> str:
    """
    Colapsa espacios y recorta una línea individual.

    Args:
        line (str): Línea de texto a limpiar.

    Returns:
        str: Línea sin espacios redundantes en extremos ni secuencias internas.
    """
    return re.sub(r"[ \t]+", " ", line).strip()
