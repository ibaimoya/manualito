from rag.normalizer import normalize_ocr_lines, normalize_text


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — normalización de texto libre
#   Clase 1: Mezcla de CRLF, espacios repetidos y líneas vacías largas.
# ---------------------------------------------------------------------------
def test_normalize_text_unifies_newlines_and_spaces():
    """El texto libre se limpia antes del chunking sin perder su estructura."""
    normalized = normalize_text("  Regla   uno\r\n\r\n\r\n  Regla\t dos \rFin ")

    assert normalized == "Regla uno\n\nRegla dos\nFin"


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — normalización de líneas OCR
#   Clase 2: Líneas válidas con espacios redundantes.
#   Clase 3: Entradas inválidas o vacías — se descartan.
# ---------------------------------------------------------------------------
def test_normalize_ocr_lines_discards_invalid_entries():
    """Solo las líneas OCR con texto útil acaban en el documento final."""
    normalized = normalize_ocr_lines(
        [
            {"text": "  Preparación   inicial  "},
            {"text": ""},
            {"text": None},
            {"text": 123},
            {"text": " Fin\tde ronda "},
        ]
    )

    assert normalized == "Preparación inicial\nFin de ronda"
