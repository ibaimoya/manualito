from common.ocr.lexicon import spanish_lexicon

# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — carga del lexico vendorizado
#   EP1: palabras frecuentes del dominio presentes en minuscula.
#   EP2: tokens que no son palabras no aparecen.
#   EP3: la carga se cachea y devuelve siempre el mismo objeto.
# ---------------------------------------------------------------------------


def test_lexico_contiene_palabras_del_dominio():
    """El léxico contiene en minúsculas palabras frecuentes de manuales."""
    lexicon = spanish_lexicon()

    assert {"jugador", "cartas", "propiedades", "necesarias"} <= lexicon


def test_lexico_no_contiene_uniones_invalidas():
    """Una fusión incorrecta de columnas no aparece en el léxico."""
    assert "bétisufrió" not in spanish_lexicon()


def test_lexico_se_cachea():
    """Cargas sucesivas comparten el mismo frozenset inmutable."""
    assert spanish_lexicon() is spanish_lexicon()
    assert isinstance(spanish_lexicon(), frozenset)
