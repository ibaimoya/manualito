from dataclasses import replace

import pytest

from common.ocr.correction_rules import (
    OcrCorrectionConfig,
    apply_confidence_gate,
    apply_correction_rules,
    collapse_guide_dots,
    merge_hyphenated_lines,
    needs_llm_correction,
    page_vocabulary,
    strip_bullet_artifact,
)


@pytest.fixture
def correction_config() -> OcrCorrectionConfig:
    return OcrCorrectionConfig(discard_below=0.5, llm_below=0.85)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — gate de confianza en 3 zonas
#   EP1: confianza None (texto PDF embebido) pasa intacta y sin franja LLM.
#   EP2: confianza < 0.5 se descarta (mayoritariamente no-texto medido).
#   EP3: confianza en [0.5, 0.85) sobrevive y entra en la franja LLM.
#   EP4: confianza >= 0.85 sobrevive intacta fuera de la franja.
# ---------------------------------------------------------------------------


def test_gate_conserva_lineas_sin_confianza(correction_config):
    """Una línea sin confianza numérica no se filtra ni entra en la franja."""
    lines = [{"text": "Texto embebido del PDF", "confidence": None}]

    assert apply_confidence_gate(lines, config=correction_config) == lines
    assert needs_llm_correction(lines[0], config=correction_config) is False


def test_gate_descarta_la_franja_de_ruido(correction_config):
    """Las líneas por debajo del umbral de descarte desaparecen."""
    lines = [
        {"text": "nn. se", "confidence": 0.145},
        {"text": "Preparación inicial", "confidence": 0.92},
    ]

    assert apply_confidence_gate(lines, config=correction_config) == [
        {"text": "Preparación inicial", "confidence": 0.92},
    ]


def test_gate_marca_solo_la_franja_media(correction_config):
    """Solo la franja media requiere corrección del LLM y la alta queda fuera."""
    media = {"text": "deben rostarse antes de la", "confidence": 0.544}
    alta = {"text": "19 hexágonos", "confidence": 0.92}

    assert apply_confidence_gate([media, alta], config=correction_config) == [media, alta]
    assert needs_llm_correction(media, config=correction_config) is True
    assert needs_llm_correction(alta, config=correction_config) is False


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — umbrales 0.5 y 0.85
#   0.49 se descarta / 0.50 sobrevive y es franja.
#   0.84 es franja / 0.85 queda fuera de la franja.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("confidence", "survives", "in_band"),
    [
        (0.49, False, False),
        (0.50, True, True),
        (0.84, True, True),
        (0.85, True, False),
    ],
)
def test_gate_en_los_limites(correction_config, confidence, survives, in_band):
    """La franja incluye el umbral inferior y excluye el superior."""
    line = {"text": "linea de prueba", "confidence": confidence}

    survivors = apply_confidence_gate([line], config=correction_config)

    assert (line in survivors) is survives
    assert needs_llm_correction(line, config=correction_config) is in_band


def test_gate_respeta_umbrales_configurados(correction_config):
    """Subir el umbral de descarte elimina líneas antes conservadas."""
    strict_config = replace(correction_config, discard_below=0.6)
    line = {"text": "linea dudosa", "confidence": 0.55}

    assert apply_confidence_gate([line], config=strict_config) == []


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — viñeta leida como letra al inicio de linea
#   EP1: marcador de viñeta + mayuscula se elimina (74 lineas reales medidas).
#   EP2: la misma letra ante minuscula es palabra y se conserva.
#   EP3: lineas sin marcador quedan intactas.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("e Construir", "Construir"),
        ("* Decidid quién empieza a jugar.", "Decidid quién empieza a jugar."),
        ("• Coloca el tablero", "Coloca el tablero"),
        ("« Ganar la partida", "Ganar la partida"),
        ("+ Ábrelo con cuidado", "Ábrelo con cuidado"),
    ],
)
def test_vineta_leida_como_letra_se_elimina(text, expected):
    """El falso marcador de viñeta desaparece ante una mayúscula."""
    assert strip_bullet_artifact(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "e coloca el tablero",
        "el jugador naranja",
        "Construir una carretera",
        "2 jugadores",
    ],
)
def test_vineta_no_toca_palabras_reales(text):
    """Sin marcador ante una mayúscula la línea queda exactamente igual."""
    assert strip_bullet_artifact(text) == text


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — puntos de guia de indice
#   Tres puntos son puntuacion legitima y se conservan.
#   Cuatro o mas son guia de indice y colapsan a un punto.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Espera...", "Espera..."),
        ("Espera....", "Espera."),
        ("Introducción....... 4", "Introducción. 4"),
        ("a.......b......c", "a.b.c"),
    ],
)
def test_puntos_de_guia_colapsan(text, expected):
    """Las secuencias largas de puntos se colapsan sin alterar las elipsis."""
    assert collapse_guide_dots(text) == expected


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — des-guionado de fin de linea con guarda
#   EP1: la union valida contra el lexico, se aplica y queda registrada.
#   EP2: la union valida solo contra el vocabulario de la pagina y se aplica.
#   EP3: la union no valida (salto de columna) y el guion se conserva.
#   EP4: guion en la ultima linea de la pagina se conserva.
#   EP5: la base de la linea recortada se reinicia a su resto.
# ---------------------------------------------------------------------------


def test_desguionado_une_palabra_del_lexico():
    """Una palabra partida por guion se une y su base registra la pareja."""
    lines = [
        {"text": "construye tus propie-", "confidence": 0.9},
        {"text": "dades favoritas", "confidence": 0.8},
    ]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"propiedades"}))

    assert result.lines == [
        {"text": "construye tus propiedades", "confidence": 0.9},
        {"text": "favoritas", "confidence": 0.8},
    ]
    assert result.bases == ("construye tus propie- dades", "favoritas")
    assert result.hyphen_joins == (frozenset({"propie- dades"}), frozenset())


def test_desguionado_vacia_y_elimina_la_linea_siguiente():
    """La línea siguiente desaparece con su base y sus uniones en paralelo."""
    lines = [
        {"text": "fue una jugada necesa-", "confidence": 0.7},
        {"text": "rias", "confidence": 0.6},
    ]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"necesarias"}))

    assert result.lines == [{"text": "fue una jugada necesarias", "confidence": 0.7}]
    assert result.bases == ("fue una jugada necesa- rias",)
    assert result.hyphen_joins == (frozenset({"necesa- rias"}),)


def test_desguionado_une_aunque_siga_puntuacion():
    """La puntuación pegada al fragmento viaja con la pareja registrada."""
    lines = [
        {"text": "compra tus propie-", "confidence": 0.9},
        {"text": "dades, después cobra", "confidence": 0.8},
    ]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"propiedades"}))

    assert result.lines == [
        {"text": "compra tus propiedades,", "confidence": 0.9},
        {"text": "después cobra", "confidence": 0.8},
    ]
    assert result.bases == ("compra tus propie- dades,", "después cobra")
    assert result.hyphen_joins == (frozenset({"propie- dades,"}), frozenset())


def test_desguionado_conserva_el_guion_fuera_de_vocabulario():
    """El salto de columna no se une y las bases quedan como el texto."""
    lines = [
        {"text": "gana el Bétisu-", "confidence": 0.7},
        {"text": "frió una derrota", "confidence": 0.7},
    ]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"derrota"}))

    assert result.lines == lines
    assert result.bases == ("gana el Bétisu-", "frió una derrota")
    assert result.hyphen_joins == (frozenset(), frozenset())


def test_desguionado_conserva_guion_en_la_ultima_linea():
    """Un guion final sin línea siguiente se conserva."""
    lines = [{"text": "continuará en la si-", "confidence": 0.9}]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"siguiente"}))

    assert result.lines == lines


def test_desguionado_ignora_entradas_sin_texto():
    """Una entrada sin texto conserva el guion previo y deja una base vacía."""
    lines = [
        {"text": "corta la si-", "confidence": 0.9},
        {"confidence": 0.8},
    ]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"siguiente"}))

    assert result.lines == lines
    assert result.bases == ("corta la si-", "")
    assert page_vocabulary([{"confidence": 0.8}]) == frozenset()


@pytest.mark.parametrize(
    ("current", "following"),
    [
        ("acaba en 5-", "cinco puntos"),
        ("junta propie-", "“dades raras"),
    ],
)
def test_desguionado_descarta_fragmentos_no_alfabeticos(current, following):
    """Sin letras a ambos lados del guion no hay unión posible."""
    lines = [
        {"text": current, "confidence": 0.9},
        {"text": following, "confidence": 0.9},
    ]

    result = merge_hyphenated_lines(lines, vocabulary=frozenset({"propiedades", "cinco"}))

    assert result.lines == lines


def test_vocabulario_de_pagina_alimenta_el_desguionado():
    """Las palabras de la propia página permiten uniones ausentes del léxico."""
    lines = [
        {"text": "los zargos dominan el juego", "confidence": 0.9},
        {"text": "coloca tus zar-", "confidence": 0.8},
        {"text": "gos en el tablero", "confidence": 0.8},
    ]

    vocabulary = page_vocabulary(lines)
    result = merge_hyphenated_lines(lines, vocabulary=vocabulary)

    assert "zargos" in vocabulary
    assert result.lines[1] == {"text": "coloca tus zargos", "confidence": 0.8}
    assert result.bases == (
        "los zargos dominan el juego",
        "coloca tus zar- gos",
        "en el tablero",
    )


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — orquestador de reglas
#   EP1: gate + vineta + guia + des-guionado encadenados sobre lineas reales.
#   EP2: las lineas de entrada no se mutan.
# ---------------------------------------------------------------------------


def test_orquestador_encadena_todas_las_reglas(correction_config):
    """El flujo completo limpia una página realista sin interferencias entre reglas."""
    lines = [
        {"text": "nn. se", "confidence": 0.145},
        {"text": "e Construir propie-", "confidence": 0.84},
        {"text": "dades del tablero", "confidence": 0.9},
        {"text": "Índice....... 4", "confidence": 0.9},
    ]

    result = apply_correction_rules(
        lines,
        config=correction_config,
        vocabulary=frozenset({"propiedades"}),
    )

    assert result.lines == [
        {"text": "Construir propiedades", "confidence": 0.84},
        {"text": "del tablero", "confidence": 0.9},
        {"text": "Índice. 4", "confidence": 0.9},
    ]
    assert result.bases == ("Construir propie- dades", "del tablero", "Índice. 4")
    assert result.hyphen_joins == (frozenset({"propie- dades"}), frozenset(), frozenset())
    assert lines[1] == {"text": "e Construir propie-", "confidence": 0.84}


def test_orquestador_descarta_lineas_sin_texto_o_vaciadas(correction_config):
    """Las entradas sin texto o vaciadas por la limpieza no llegan al desguionado."""
    lines = [
        {"confidence": 0.9},
        {"text": "   ", "confidence": 0.9},
        {"text": "Regla válida", "confidence": 0.9},
    ]

    result = apply_correction_rules(lines, config=correction_config, vocabulary=frozenset())

    assert result.lines == [{"text": "Regla válida", "confidence": 0.9}]
