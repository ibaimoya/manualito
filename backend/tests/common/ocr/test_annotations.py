import pytest

from common.ocr.annotations import correction_annotations

# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — tipo de edición anotada
#   EP1: reemplazo de una palabra anota su span final y el fragmento original.
#   EP2: insercion pura anota la palabra nueva con original vacio.
#   EP3: borrado puro anota un intervalo de ancho cero.
#   EP4: texto identico no genera anotaciones.
# ---------------------------------------------------------------------------


def test_reemplazo_anota_el_fragmento_original():
    """Una palabra cambiada produce una anotación con su span y su original."""
    annotations = correction_annotations(base="el jugadar gana", corrected="el jugador gana")

    assert annotations == ({"start": 3, "end": 10, "original": "jugadar"},)


def test_insercion_anota_con_original_vacio():
    """Una palabra insertada abarca su span final y deja el original vacío."""
    annotations = correction_annotations(base="el gana", corrected="el jugador gana")

    assert annotations == ({"start": 3, "end": 10, "original": ""},)


def test_borrado_anota_un_intervalo_de_ancho_cero():
    """Una palabra eliminada se ancla al inicio de la palabra siguiente."""
    annotations = correction_annotations(base="el jugador gana", corrected="el gana")

    assert annotations == ({"start": 3, "end": 3, "original": "jugador"},)


def test_texto_identico_no_genera_anotaciones():
    """Sin diferencias la tupla de anotaciones queda vacía."""
    assert correction_annotations(base="el jugador gana", corrected="el jugador gana") == ()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — composición sobre la línea
#   EP1: varias ediciones producen anotaciones ordenadas por posicion.
#   EP2: la union desguionada aparece como un unico reemplazo.
#   EP3: los offsets cuentan codepoints y no bytes.
# ---------------------------------------------------------------------------


def test_varias_ediciones_generan_anotaciones_ordenadas():
    """Cada edición separada recibe su propia anotación en orden."""
    annotations = correction_annotations(
        base="el jugadar gana oy",
        corrected="el jugador gana hoy",
    )

    assert annotations == (
        {"start": 3, "end": 10, "original": "jugadar"},
        {"start": 16, "end": 19, "original": "oy"},
    )


def test_union_desguionada_se_anota_como_un_reemplazo():
    """La pareja partida por guion colapsa en una única anotación."""
    annotations = correction_annotations(
        base="construye tus propie- dades",
        corrected="construye tus propiedades",
    )

    assert annotations == ({"start": 14, "end": 25, "original": "propie- dades"},)


def test_los_offsets_cuentan_codepoints_no_bytes():
    """Los caracteres multibyte previos no desplazan los offsets."""
    annotations = correction_annotations(base="los años pasán", corrected="los años pasan")

    assert annotations == ({"start": 9, "end": 14, "original": "pasán"},)


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — ediciones en los bordes de la linea
#   Primera palabra (start 0), ultima palabra (end == len) y borrado final.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("base", "corrected", "expected"),
    [
        ("jugadar gana", "jugador gana", ({"start": 0, "end": 7, "original": "jugadar"},)),
        ("el gana ya", "el gana yá", ({"start": 8, "end": 10, "original": "ya"},)),
    ],
)
def test_edicion_en_los_bordes_de_la_linea(base, corrected, expected):
    """Las ediciones de la primera y la última palabra conservan sus offsets."""
    assert correction_annotations(base=base, corrected=corrected) == expected


def test_borrado_al_final_ancla_en_el_extremo():
    """El borrado tras la última palabra se ancla al final del texto."""
    annotations = correction_annotations(base="el jugador gana", corrected="el jugador")

    assert annotations == ({"start": 10, "end": 10, "original": "gana"},)
