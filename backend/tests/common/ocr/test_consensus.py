import pytest

from common.ocr.consensus import apply_word_edits, consensus_correction, word_edits

# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — extraccion y aplicacion de ediciones
#   EP1: sustitucion simple de una palabra.
#   EP2: opcodes adyacentes se funden en una unica edicion (semantica E1).
#   EP3: candidato identico al original no produce ediciones.
# ---------------------------------------------------------------------------


def test_ediciones_de_sustitucion_simple():
    """Una palabra cambiada produce una única edición con su posición."""
    edits = word_edits("el jugadar tira", "el jugador tira")

    assert len(edits) == 1
    assert edits[0].start == 1
    assert edits[0].end == 2
    assert edits[0].replacement == ("jugador",)


def test_ediciones_adyacentes_se_funden():
    """Dos palabras contiguas cambiadas cuentan como una sola edición."""
    edits = word_edits("el jugadar tira dados", "el jugador lanza dados")

    assert len(edits) == 1
    assert edits[0].replacement == ("jugador", "lanza")


def test_candidato_identico_no_produce_ediciones():
    """Sin diferencias no hay ediciones y al aplicarlas se devuelve el original."""
    assert word_edits("el jugador tira", "el jugador tira") == ()
    assert apply_word_edits("el jugador tira", ()) == "el jugador tira"


def test_aplicar_varias_ediciones_disjuntas():
    """Las ediciones disjuntas se aplican todas en sus posiciones."""
    original = "el jugadar tira los dodos"
    edits = word_edits(original, "el jugador tira los dados")

    assert len(edits) == 2
    assert apply_word_edits(original, edits) == "el jugador tira los dados"


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — ediciones en los extremos de la linea
#   Primera palabra (start 0) y ultima palabra (end len) se aplican bien.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("original", "candidate"),
    [
        ("jugadar tira los dados", "jugador tira los dados"),
        ("el jugador tira dodos", "el jugador tira dados"),
    ],
)
def test_ediciones_en_los_extremos(original, candidate):
    """Las ediciones de la primera y la última palabra se aplican."""
    assert apply_word_edits(original, word_edits(original, candidate)) == candidate


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — consenso por mayoria 2-de-3 con candados
#   EP1: edicion con 2 votos se aplica y con 1 voto no.
#   EP2: edicion unanime se aplica.
#   EP3: candado de borrado descarta incluso con 3 votos.
#   EP4: candado de digitos descarta cambios de numeracion.
#   EP5: candidatos identicos al original devuelven el original.
#   EP6: candidato vacio equivale a borrado total y se descarta.
# ---------------------------------------------------------------------------


def test_consenso_aplica_mayoria_y_descarta_minoria():
    """La edición con dos votos se aplica y la de uno se descarta."""
    original = "el jugadar tira 10 dados"
    candidates = [
        "el jugador tira 10 dados",
        "el jugador tira 10 dado",
        "el jugadar tira 10 dados",
    ]

    assert consensus_correction(original, candidates) == "el jugador tira 10 dados"


def test_consenso_aplica_edicion_unanime():
    """Con tres votos idénticos se aplica la corrección completa."""
    original = "cada jugodor roba dos cortas"
    candidates = ["cada jugador roba dos cartas"] * 3

    assert consensus_correction(original, candidates) == "cada jugador roba dos cartas"


def test_candado_de_borrado_descarta_con_tres_votos():
    """El candado bloquea incluso el borrado unánime de una palabra real."""
    original = "II y el templo de Narsingh"
    candidates = ["y el templo de Narsingh"] * 3

    assert consensus_correction(original, candidates) == original


def test_candado_de_digitos_descarta_cambios_numericos():
    """El cambio de la secuencia numérica se bloquea aunque sea unánime."""
    original = "coge 3 cartas del mazo"
    candidates = ["coge 8 cartas del mazo"] * 3

    assert consensus_correction(original, candidates) == original


def test_candado_de_digitos_permite_conservar_numeros():
    """Una edición que respeta la secuencia numérica sí se aplica."""
    original = "tira 2 dodos rojos"
    candidates = ["tira 2 dados rojos"] * 3

    assert consensus_correction(original, candidates) == "tira 2 dados rojos"


def test_consenso_sin_cambios_devuelve_el_original():
    """Los candidatos idénticos al original no alteran nada."""
    original = "el juego se juega con 106 fichas"

    assert consensus_correction(original, [original] * 3) == original


def test_candidato_vacio_se_trata_como_borrado():
    """Un candidato vacío no puede vaciar la línea original."""
    original = "linea legitima"
    candidates = ["", "", "linea legitima"]

    assert consensus_correction(original, candidates) == original


def test_consenso_de_ediciones_fundidas_exige_igualdad_exacta():
    """Una edición fundida solo suma votos con otra idéntica."""
    original = "el jugadar tira dados"
    candidates = [
        "el jugador tira dados",
        "el jugador tira dados",
        "el jugador lanza dados",
    ]

    assert consensus_correction(original, candidates) == "el jugador tira dados"
