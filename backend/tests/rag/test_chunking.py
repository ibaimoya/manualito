import pytest

from common.manual_text.chunking import chunk_text


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


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — recursión interna del split
#   Clase 4: Texto entero más corto que chunk_size → un único chunk.
#   Clase 5: Concatenación de partes excede chunk_size, pero cada parte aislada
#            sí cabe → cada parte abre/cierra su chunk sin partir contenido.
#   Clase 6: Una parte individual excede chunk_size → recurre al siguiente
#            separador de la jerarquía hasta encontrar uno que sí divida.
# ---------------------------------------------------------------------------
def test_chunk_text_returns_single_chunk_when_text_fits_in_chunk_size():
    """Un documento que cabe entero en un chunk no se subdivide."""
    chunks = chunk_text("Texto corto del manual.", chunk_size=1024, overlap=0)

    assert chunks == ["Texto corto del manual."]


def test_chunk_text_closes_current_when_next_part_alone_fits():
    """Al exceder el budget, current se cierra y la siguiente parte abre nuevo chunk."""
    # Tres párrafos de 5 chars cada uno separados por "\n\n". Cabe uno por chunk
    # (chunk_size=8), pero dos pegados (5+2+5 = 12 chars con el separador) ya no
    # caben — fuerza a cerrar el chunk actual y abrir uno nuevo con la siguiente
    # parte sin necesidad de recurrir a separadores más finos.
    text = "AAAAA\n\nBBBBB\n\nCCCCC"

    chunks = chunk_text(text, chunk_size=8, overlap=0)

    assert chunks == ["AAAAA", "BBBBB", "CCCCC"]


# Dos posiciones del bloque grande dentro del texto:
#   - "bloque_grande_inicial": activa la rama de recursión con ``current`` vacío
#     (la ruta donde el split salta el cierre del chunk pendiente).
#   - "bloque_grande_final": deja el bucle terminado con ``current`` ya vaciado
#     (la ruta de salida sin chunk pendiente al cerrar el split).
@pytest.mark.parametrize("text", [
    "A" * 30 + ". " + "B" * 5,
    "B" * 5 + ". " + "A" * 30,
], ids=["bloque_grande_inicial", "bloque_grande_final"])
def test_chunk_text_recurses_to_finer_separator_when_part_too_large(text):
    """Una parte individual mayor que chunk_size se subdivide con separadores más finos."""
    chunks = chunk_text(text, chunk_size=10, overlap=0, separators=(". ", " ", ""))

    assert all(len(chunk) <= 10 for chunk in chunks)
    total_a = sum(chunk.count("A") for chunk in chunks)
    total_b = sum(chunk.count("B") for chunk in chunks)
    assert total_a == 30
    assert total_b == 5
