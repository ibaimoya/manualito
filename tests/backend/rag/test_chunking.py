from rag.chunking import chunk_text


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — generación de chunks
#   Clase 1: Texto vacío o solo espacios — no genera chunks.
#   Clase 2: Texto con separadores naturales — conserva el orden.
#   Clase 3: Texto sin separadores útiles — cae al corte por caracteres.
# ---------------------------------------------------------------------------
def test_chunk_text_returns_empty_list_for_blank_input():
    """Una cadena vacía o con solo espacios no produce chunks."""
    assert chunk_text("   \n\t  ") == []


def test_chunk_text_applies_overlap_and_preserves_order():
    """El segundo chunk hereda el tail del primero y mantiene el contenido."""
    text = "A" * 1024 + "\n\n" + "B" * 400

    chunks = chunk_text(text)

    assert len(chunks) == 2
    assert chunks[1].startswith("A" * 128)
    assert chunks[1].endswith("B" * 400)


def test_chunk_text_falls_back_to_character_split_without_separators():
    """Si no encuentra separadores, divide el texto por tamaño bruto."""
    chunks = chunk_text("ABCDEFGHIJ", chunk_size=4, overlap=0, separators=("",))

    assert chunks == ["ABCD", "EFGH", "IJ"]


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — solapamiento entre chunks
#   0 caracteres de overlap: no se modifica la salida base.
# ---------------------------------------------------------------------------
def test_chunk_text_skips_overlap_when_configured_to_zero():
    """Con overlap 0, los chunks quedan tal como salen del split recursivo."""
    chunks = chunk_text("AAAA BBBB CCCC", chunk_size=5, overlap=0)

    assert chunks == ["AAAA", "BBBB", "CCCC"]
