"""Mide la suite v2 de LLM de Manualito con jueces externos.

Se conserva el protocolo completo de generación, evaluación y consolidación
del notebook. La ejecución guarda solo los datos JSON en un directorio nuevo.
La reevaluación opcional del notebook no forma parte de este script.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.dont_write_bytecode = True
from pathlib import Path

YELLOW = "\033[33m"


CYAN = "\033[36m"


GREEN = "\033[32m"


RED = "\033[31m"


RESET = "\033[0m"


def info(text: str, highlight: object = "", after: str = "") -> None:
    """Resalta un dato y devuelve el resto del mensaje al cian."""
    message = text.rstrip(". ")
    if highlight != "":
        message += f" {GREEN}{highlight}{CYAN}"
    if after:
        message += f" {after.rstrip('. ')}"
    print(f"{YELLOW}[*]{RESET} {CYAN}{message}.{RESET}")


def error(text: str) -> None:
    print(f"{RED}[!] ERROR: {text.rstrip('. ')}.{RESET}")


def add_run_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--run",
        action="store_true",
        required=True,
        help="Confirma que se desea ejecutar la medición, que puede tardar horas.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        metavar="DIR",
        help="Directorio nuevo donde se guardará el JSON de resultados.",
    )


def prepare_output_dir(output_dir: Path, script_path: Path) -> Path:
    """Crea una carpeta nueva fuera de los resultados conservados."""
    benchmarks_root = script_path.resolve().parents[2]
    target = output_dir.expanduser().resolve()
    if target.is_relative_to(benchmarks_root):
        raise ValueError(f"--output-dir no puede estar dentro de {benchmarks_root}")

    if target.exists():
        raise FileExistsError(f"el directorio de salida ya existe: {target}")
    target.mkdir(parents=True)
    os.chdir(target)
    return target


def parse_and_prepare(
    description: str,
    script_path: Path,
    argv: list[str] | None = None,
) -> tuple[argparse.Namespace, Path]:
    parser = argparse.ArgumentParser(description=description)
    add_run_arguments(parser)
    args = parser.parse_args(argv)
    try:
        output_dir = prepare_output_dir(args.output_dir, script_path)
    except (FileExistsError, OSError, ValueError) as exc:
        parser.error(str(exc))
    return args, output_dir

if __name__ == "__main__":
    _ARGS, _OUTPUT_DIR = parse_and_prepare("Mide la suite v2 de LLM de Manualito.", Path(__file__))
    import httpx
    import numpy as np

import itertools
import json
import re
import statistics
import time
import warnings
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeAlias

warnings.filterwarnings("ignore")

Registro: TypeAlias = dict[str, Any]
PredicadoRegistro: TypeAlias = Callable[[Registro], bool]

# ── Formato de salida con colores ANSI ──────────────────────────────────
_ESC = chr(27)
_Y = f"{_ESC}[33m"  # amarillo
_C = f"{_ESC}[36m"  # cian
_R = f"{_ESC}[31m"  # rojo
_G = f"{_ESC}[32m"  # verde
_DIM = f"{_ESC}[2m"  # tenue (detalles secundarios)
_0 = f"{_ESC}[0m"  # reset


def _safe_print(linea: str) -> None:
    """print robusto: si la consola no es UTF-8 (cp1252 en Windows), sustituye
    los caracteres no representables (p. ej. κ) en vez de lanzar excepción."""
    try:
        print(linea)
    except Exception:
        try:
            print(linea.encode("ascii", "replace").decode("ascii"))
        except Exception:
            pass


def seccion(titulo: str) -> None:
    """Cabecera de fase en cian, con salida limpia y lista para anexo."""
    barra = "─" * 70
    _safe_print(f"\n{_C}{barra}{_0}")
    _safe_print(f"{_C}  {titulo}{_0}")
    _safe_print(f"{_C}{barra}{_0}")


def seccion_ok(titulo: str) -> None:
    """Cabecera de resultado en verde (modelo elegido)."""
    barra = "═" * 70
    _safe_print(f"\n{_G}{barra}{_0}")
    _safe_print(f"{_G}  ★ {titulo}{_0}")
    _safe_print(f"{_G}{barra}{_0}")


def fila(etiqueta: str, valor: object, ancho: int = 24) -> None:
    """Alinea el valor mediante espacios tras la etiqueta."""
    et = str(etiqueta)
    relleno = " " * max(3, ancho - len(et))
    _safe_print(f"  {et} {_DIM}{relleno}{_0} {valor}")


# Fallos transitorios tolerados (timeouts, parseos): se cuentan, NO se imprimen en
# rojo y se resumen al final, para no manchar la información útil de la salida.
INCIDENCIAS: list[str] = []


def incidencia(msg: str) -> None:
    INCIDENCIAS.append(str(msg))


info("Entorno y helpers de salida cargados.")

HARDWARE = {"gpu": "NVIDIA GeForce RTX 4070 SUPER", "vram_total_gb": 12.0}

OLLAMA_URL = "http://localhost:11434"
TIMEOUT = 300.0

# ── 8 modelos evaluados (paleta Catppuccin Mocha; familias con tonos afines) ──
MODELOS: list[Registro] = [
    {
        "id": "llama3.1:8b-instruct-q4_K_M",
        "nombre": "llama3.1:8b",
        "etiqueta": "llama3.1\n8B-Q4",
        "familia": "Meta",
        "descripcion": "Meta Llama 3.1 8B Instruct Q4_K_M, base heredada de v1",
        "color": "#89b4fa",
    },
    {
        "id": "qwen3:14b",
        "nombre": "qwen3:14b",
        "etiqueta": "qwen3\n14B",
        "familia": "Alibaba",
        "descripcion": "Alibaba Qwen3 14B, el 'Qwen viejo' (referencia)",
        "color": "#cba6f7",
    },
    {
        "id": "phi4:14b",
        "nombre": "phi4:14b",
        "etiqueta": "phi4\n14B",
        "familia": "Microsoft",
        "descripcion": "Microsoft Phi-4 14B, ganador de v1 y modelo a batir",
        "color": "#f38ba8",
    },
    {
        "id": "qwen3.5:9b",
        "nombre": "qwen3.5:9b",
        "etiqueta": "qwen3.5\n9B",
        "familia": "Alibaba",
        "descripcion": "Alibaba Qwen3.5 9B (feb 2026), el 'Qwen nuevo'",
        "color": "#b4befe",
    },
    {
        "id": "gemma4:e4b",
        "nombre": "gemma4:e4b",
        "etiqueta": "gemma4\ne4B",
        "familia": "Google",
        "descripcion": "Google Gemma 4 E4B MoE (abr 2026), el más ligero",
        "color": "#fab387",
    },
    {
        "id": "gemma4:26b",
        "nombre": "gemma4:26b",
        "etiqueta": "gemma4\n26B",
        "familia": "Google",
        "descripcion": "Google Gemma 4 26B MoE (abr 2026), sustituye a gemma3:12b",
        "color": "#a6e3a1",
    },
    {
        "id": "deepseek-r1:14b",
        "nombre": "deepseek-r1:14b",
        "etiqueta": "deepseek-r1\n14B",
        "familia": "DeepSeek",
        "descripcion": "DeepSeek-R1-Distill-Qwen 14B, razonamiento",
        "color": "#f9e2af",
    },
    {
        "id": "ministral-3:14b",
        "nombre": "ministral-3:14b",
        "etiqueta": "ministral-3\n14B",
        "familia": "Mistral",
        "descripcion": "Mistral Ministral-3 14B (2026), orientado a velocidad",
        "color": "#94e2d5",
    },
]

# ── Panel de 3 jueces externos (voto mayoritario) ───────────────────────
JUECES: list[Registro] = [
    {"id": "aya-expanse:8b", "nombre": "aya-expanse:8b", "familia": "Cohere", "color": "#f9e2af"},
    {
        "id": "mistral-nemo:12b",
        "nombre": "mistral-nemo:12b",
        "familia": "Mistral",
        "color": "#94e2d5",
    },
    {"id": "granite3.3:8b", "nombre": "granite3.3:8b", "familia": "IBM", "color": "#eba0ac"},
]

# ── Parámetros de generación ────────────────────────────────────────────
N_REPETICIONES = 3
TEMP_GEN = 0.1
NUM_PREDICT_GEN = 512
THINKING = False  # razonamiento desactivado: config realista del pipeline TTS
VERBOSE = False  # False = salida compacta apta para anexo; True = detalle por prueba
REUTILIZAR_RESPUESTAS_EXISTENTES = True
RESULTS_PATH = Path("results.json")

PROMPT_TEMPLATE = """Eres un asistente que responde preguntas sobre manuales de juegos de mesa. Usa EXCLUSIVAMENTE la información del contexto. Si la respuesta no aparece en el contexto, responde literalmente "No aparece en el manual." Responde siempre en español, de forma breve.

Contexto:
{contexto}

Pregunta:
{pregunta}

Respuesta:"""

info("Configuración base lista:", f"{len(MODELOS)} modelos, {len(JUECES)} jueces.")

# ── Suite de pruebas: 24 = 18 heredadas (v1) + 6 nuevas/endurecidas ─────
# Campos: id, categoria, es_adversarial, dificultad (facil|dificil), pregunta,
# contexto, veredicto_esperado, y opcional "criterio" (rúbrica específica que se
# inyecta en el prompt del juez para esa prueba).
PRUEBAS: list[Registro] = [
    # ===================== GRUPO A, fáciles (heredadas v1) =====================
    {
        "id": "factual_jugadores",
        "categoria": "factual",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Cuántos jugadores pueden jugar a Catan?",
        "contexto": "Catan es un juego de mesa para 3 o 4 jugadores. Con la expansión 5-6 jugadores puede ampliarse hasta seis participantes.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "factual_duracion",
        "categoria": "factual",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Cuánto dura aproximadamente una partida de Azul?",
        "contexto": "Azul es un juego para 2 a 4 jugadores. Una partida típica dura entre 30 y 45 minutos. El objetivo es decorar el palacio real.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "multi_recursos_poblado",
        "categoria": "multi_fact",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Qué recursos necesito para construir un poblado?",
        "contexto": "Para construir un poblado necesitas una madera, una arcilla, una lana y un trigo. Para una ciudad necesitas dos trigos y tres minerales.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "multi_ladron",
        "categoria": "multi_fact",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Cuándo se activa el ladrón y qué efecto tiene?",
        "contexto": "El ladrón se activa cuando un jugador saca un 7 con los dados o cuando se usa una carta de caballero. Al moverlo, el hexágono donde se coloca deja de producir recursos y el jugador puede robar una carta a un rival con poblado o ciudad adyacente.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "planted_puntos_8",
        "categoria": "planted_fact",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Con cuántos puntos de victoria se gana la partida?",
        "contexto": "La partida de Catan termina cuando un jugador alcanza 8 puntos de victoria al comenzar su turno.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "planted_ciudad_5_minerales",
        "categoria": "planted_fact",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Qué recursos necesito para construir una ciudad?",
        "contexto": "Para construir una ciudad en Catan necesitas cinco minerales y un trigo. La ciudad reemplaza a un poblado existente.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "fuera_mundial",
        "categoria": "fuera_contexto",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Quién ganó el mundial de fútbol de 2022?",
        "contexto": "Catan es un juego de mesa para 3 o 4 jugadores. El objetivo es alcanzar 10 puntos de victoria.",
        "veredicto_esperado": "RECHAZO",
    },
    {
        "id": "fuera_capital",
        "categoria": "fuera_contexto",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Cuál es la capital de Alemania?",
        "contexto": "Azul es un juego para 2 a 4 jugadores. Los jugadores colocan azulejos en su tablero personal para decorar el palacio.",
        "veredicto_esperado": "RECHAZO",
    },
    {
        "id": "distractor_comercio",
        "categoria": "distractor",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Cuándo puedo comerciar con otros jugadores?",
        "contexto": "En Catan el turno se compone de tres fases: tirada de dados, comercio e intercambios, y construcción. El comercio solo se permite durante tu propio turno. Al inicio del juego cada jugador recibe dos poblados y dos carreteras. El tablero se forma con 19 hexágonos.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "distractor_muralla",
        "categoria": "distractor",
        "es_adversarial": False,
        "dificultad": "facil",
        "pregunta": "¿Cuánto cuesta construir una muralla?",
        "contexto": "En la expansión Ciudades y Caballeros, la muralla cuesta dos arcillas y protege a la ciudad del ataque bárbaro. Las cartas de progreso se obtienen con minerales, lana y trigo. Los caballeros cuestan una lana y un mineral y se activan con un trigo. Solo se pueden construir murallas en ciudades, no en poblados.",
        "veredicto_esperado": "CORRECTA",
    },
    # ===================== GRUPO A', fáciles DIFÍCILES (nuevas v2) =====================
    {
        "id": "factual_dificil_viaje",
        "categoria": "factual_dificil",
        "es_adversarial": False,
        "dificultad": "dificil",
        "pregunta": "¿Cuántos jugadores admite la versión de viaje de Catan?",
        "contexto": "El club tiene tres ediciones en la estantería. Catan estándar es para 3 o 4 jugadores. Catan: Espacial admite de 2 a 4 jugadores. La versión de viaje de Catan está pensada solo para 2 jugadores y cabe en una caja pequeña.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "factual_dificil_duracion_azul",
        "categoria": "factual_dificil",
        "es_adversarial": False,
        "dificultad": "dificil",
        "pregunta": "¿Cuánto dura una partida de Azul a 2 jugadores?",
        "contexto": "Tiempos de partida estimados en la caja: Catan, 75 minutos. Carcassonne, 35 minutos. Azul, entre 30 y 45 minutos con 3 o 4 jugadores; a 2 jugadores baja a unos 20-30 minutos.",
        "veredicto_esperado": "CORRECTA",
    },
    # ===================== GRUPO B, adversariales (heredadas v1) =====================
    {
        "id": "contra_ladron_turnos",
        "categoria": "contradiccion",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuándo actúa exactamente el ladrón?",
        "contexto": "En Catan el ladrón actúa de forma inmediata cuando un jugador saca un 7 con los dados: se mueve y bloquea un hexágono al instante.\n\nCada jugador juega en el sentido horario. El ladrón, sin embargo, se activa solo al final del turno del jugador activo, momento en el que se mueve a un nuevo hexágono.\n\nEl tablero se compone de 19 hexágonos de recursos.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "contra_jugadores_max",
        "categoria": "contradiccion",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuántos jugadores máximo pueden jugar?",
        "contexto": "Catan es un juego para 3 o 4 jugadores. El tablero se forma con hexágonos de recursos.\n\nEn la expansión incluida en esta misma caja, se añaden piezas para permitir que jueguen hasta 6 participantes sin alterar el resto de las reglas.\n\nLos jugadores compiten por ser los primeros en alcanzar 10 puntos de victoria.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "comp_9_cartas_7",
        "categoria": "composicion",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "Si el jugador activo saca un 7 y otro jugador de la mesa tiene 9 cartas en la mano, ¿qué ocurre con ese jugador?",
        "contexto": "En Catan, cuando el jugador activo saca un 7 con los dados al inicio de su turno, ocurren dos cosas en este orden:\n1. Todos los jugadores que tengan más de 7 cartas en la mano deben descartar la mitad (redondeando hacia abajo).\n2. El jugador activo mueve el ladrón a cualquier hexágono y puede robar una carta aleatoria a un rival adyacente.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "comp_ciudad_desde_cero",
        "categoria": "composicion",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuántos recursos necesito en total para tener una ciudad construida, partiendo desde cero y sin poblado previo?",
        "contexto": "En Catan hay dos construcciones jerárquicas:\n- Un poblado cuesta 1 madera, 1 ladrillo, 1 lana y 1 trigo.\n- Una ciudad sustituye a un poblado existente y cuesta 2 trigos y 3 minerales. No se puede construir una ciudad sin un poblado previo en la misma intersección.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "parcial_coste_puerto",
        "categoria": "info_parcial",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Qué coste tienen los puertos 3:1 y 2:1?",
        "contexto": "En Catan hay puertos en los bordes del tablero. El puerto 2:1 (específico) permite cambiar 2 unidades del recurso indicado por 1 recurso cualquiera. Solo está disponible para el jugador que tenga un poblado o ciudad tocando ese puerto; no tiene coste adicional.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "parcial_fin_azul",
        "categoria": "info_parcial",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cómo se puntúa el final de Azul y cuánto dura una partida típica?",
        "contexto": "Azul termina cuando un jugador completa una fila horizontal de azulejos en su tablero personal. Se hace un recuento final en el que cada fila completa añade 2 puntos extra, cada columna completa 7 puntos, y cada conjunto de 5 colores iguales 10 puntos. El jugador con más puntos gana.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "num_2_carreteras_1_ciudad",
        "categoria": "numero_trampa",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuántos recursos en total necesito para construir 2 carreteras y 1 ciudad (sin contar el poblado previo de la ciudad)?",
        "contexto": "En Catan los costes de construcción son:\n- Carretera: 1 madera + 1 ladrillo.\n- Poblado: 1 madera + 1 ladrillo + 1 lana + 1 trigo.\n- Ciudad: 2 trigos + 3 minerales (sustituye un poblado existente).",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "num_3_poblados_2_desarrollo",
        "categoria": "numero_trampa",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuántos recursos en total para construir 3 poblados y comprar 2 cartas de desarrollo?",
        "contexto": "Costes en Catan:\n- Poblado: 1 madera + 1 ladrillo + 1 lana + 1 trigo.\n- Carta de desarrollo: 1 lana + 1 trigo + 1 mineral.",
        "veredicto_esperado": "CORRECTA",
    },
    # ===================== GRUPO B', adversariales NUEVAS v2 =====================
    {
        "id": "contra_estricta_carretera",
        "categoria": "contradiccion_estricta",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuánto cuesta exactamente una carretera?",
        "contexto": "En la sección de construcción se indica que una carretera cuesta 1 madera y 1 ladrillo.\n\nMás adelante, en la tabla de costes resumida, la carretera figura como 2 maderas.\n\nAmbas indicaciones aparecen en el mismo manual y no se dice cuál prevalece.",
        "criterio": "El contexto se contradice a propósito (1 madera + 1 ladrillo frente a 2 maderas). La respuesta SOLO es CORRECTA si SEÑALA EXPLÍCITAMENTE que hay una contradicción o presenta ambas versiones. Si da una sola cifra como definitiva sin mencionar la otra, márcala INCOMPLETA.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "contra_estricta_mano_max",
        "categoria": "contradiccion_estricta",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "¿Cuál es el límite de cartas en mano sin penalización?",
        "contexto": "El reglamento base dice que puedes guardar hasta 7 cartas en la mano sin descartar.\n\nEn la hoja de erratas incluida en la caja, ese límite se corrige a 8 cartas.\n\nNo se indica explícitamente cuál de las dos prevalece.",
        "criterio": "El contexto se contradice a propósito (7 frente a 8). La respuesta SOLO es CORRECTA si SEÑALA EXPLÍCITAMENTE la contradicción o presenta ambas cifras. Si da una sola como definitiva sin mencionar la otra, márcala INCOMPLETA.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "condicional_aserradero",
        "categoria": "condicional",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "Si controlo un aserradero, ¿cuánta madera necesito para una carretera?",
        "contexto": "Una carretera cuesta normalmente 2 maderas y 1 ladrillo. Excepción: si controlas un aserradero, la madera necesaria para construir carreteras se reduce a la mitad, redondeando hacia abajo.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "condicional_handicap",
        "categoria": "condicional",
        "es_adversarial": True,
        "dificultad": "dificil",
        "pregunta": "Si voy en cabeza, ¿cuántos puntos de victoria necesito para ganar?",
        "contexto": "La partida se gana al alcanzar 10 puntos de victoria. Regla de hándicap opcional activada en esta partida: el jugador que vaya en cabeza al inicio de cada ronda necesita 2 puntos de victoria adicionales para poder ganar.",
        "veredicto_esperado": "CORRECTA",
    },
]


def validar_configuracion() -> None:
    """Falla temprano si la suite o el panel estan mal definidos."""
    campos_prueba = {
        "id",
        "categoria",
        "es_adversarial",
        "dificultad",
        "pregunta",
        "contexto",
        "veredicto_esperado",
    }
    veredictos_esperados = {"CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO"}
    dificultades = {"facil", "dificil"}

    ids: list[str] = []
    for pos, prueba in enumerate(PRUEBAS, 1):
        faltan = sorted(campos_prueba - set(prueba))
        if faltan:
            raise ValueError(f"PRUEBAS[{pos}] no tiene campos obligatorios: {faltan}")
        pid = prueba.get("id")
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError(f"PRUEBAS[{pos}] tiene id invalido: {pid!r}")
        ids.append(pid)
        if prueba.get("veredicto_esperado") not in veredictos_esperados:
            raise ValueError(
                f"{pid}: veredicto_esperado invalido: {prueba.get('veredicto_esperado')!r}"
            )
        if prueba.get("dificultad") not in dificultades:
            raise ValueError(f"{pid}: dificultad invalida: {prueba.get('dificultad')!r}")
        if not isinstance(prueba.get("es_adversarial"), bool):
            raise ValueError(f"{pid}: es_adversarial debe ser bool")
        for campo in ("pregunta", "contexto", "categoria"):
            valor = prueba.get(campo)
            if not isinstance(valor, str) or not valor.strip():
                raise ValueError(f"{pid}: {campo} debe ser texto no vacio")

    repetidos = sorted({pid for pid in ids if ids.count(pid) > 1})
    if repetidos:
        raise ValueError(f"Ids de prueba duplicados: {repetidos}")
    if N_REPETICIONES < 1:
        raise ValueError("N_REPETICIONES debe ser >= 1")
    if len(JUECES) < 2:
        raise ValueError("Se necesitan al menos 2 jueces para voto mayoritario")


validar_configuracion()

PRUEBAS_POR_ID: dict[str, Registro] = {str(p["id"]): p for p in PRUEBAS}
n_faciles = sum(1 for p in PRUEBAS if not p["es_adversarial"])
n_advers = sum(1 for p in PRUEBAS if p["es_adversarial"])

# Subconjunto GOLD opcional: etiqueta a mano prueba_id -> veredicto correcto para
# medir la EXACTITUD de cada juez frente a un humano (no solo el acuerdo entre
# jueces). Si queda vacío, el bloque de calibración (§6) se omite.
GOLD: dict[str, str] = {}

info(
    "Suite lista:",
    f"{len(PRUEBAS)} pruebas ({n_faciles} fáciles + {n_advers} adversariales), {N_REPETICIONES} runs.",
)


# ── Helpers de Ollama ───────────────────────────────────────────────────
def modelos_instalados() -> list[str]:
    """Devuelve los tags de modelos ya descargados en Ollama."""
    try:
        r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=10.0)
        return [m["name"] for m in r.json().get("models", [])]
    except Exception as err:
        error(f"No se pudo contactar con Ollama en {OLLAMA_URL}: {err}")
        return []


def pull_modelo(modelo: str) -> bool:
    """Descarga un modelo con ollama pull. Devuelve True si termina OK."""
    info("-> ollama pull (puede tardar varios minutos):", modelo)
    try:
        with httpx.stream(
            "POST", f"{OLLAMA_URL}/api/pull", json={"name": modelo, "stream": True}, timeout=None
        ) as resp:
            resp.raise_for_status()
            ultimo = ""
            for linea in resp.iter_lines():
                if not linea:
                    continue
                try:
                    ev = json.loads(linea)
                except json.JSONDecodeError:
                    continue
                st = ev.get("status", "")
                if st and st != ultimo:
                    print(f"    {st}")
                    ultimo = st
                if ev.get("error"):
                    error(ev["error"])
                    return False
        info("Descargado:", modelo)
        return True
    except Exception as err:
        error(f"al descargar {modelo}: {err}")
        return False


def vram_en_uso_gb(modelo: str) -> float:
    """VRAM actual del modelo cargado (GB). Requiere que esté en memoria."""
    try:
        r = httpx.get(f"{OLLAMA_URL}/api/ps", timeout=5.0)
        for m in r.json().get("models", []):
            if m["name"] == modelo:
                return round(m.get("size_vram", 0) / 1024**3, 2)
    except Exception:
        pass
    return 0.0


def descargar_modelo(modelo: str) -> None:
    """Libera el modelo de VRAM con keep_alive=0 para no saturar la tarjeta."""
    try:
        httpx.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": modelo, "prompt": "", "keep_alive": 0},
            timeout=15.0,
        )
    except Exception:
        pass


def generar(modelo: str, prompt: str) -> dict:
    """Llamada bloqueante a /api/generate. think=THINKING; reintenta sin 'think'
    si el modelo no soporta ese campo. Devuelve el JSON con métricas de Ollama."""
    base = {
        "model": modelo,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": TEMP_GEN, "num_predict": NUM_PREDICT_GEN},
    }
    try:
        r = httpx.post(
            f"{OLLAMA_URL}/api/generate", json={**base, "think": THINKING}, timeout=TIMEOUT
        )
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError:
        r = httpx.post(f"{OLLAMA_URL}/api/generate", json=base, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()


_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def limpiar_respuesta(texto: str) -> str:
    """Quita la traza de razonamiento <think>...</think> y espacios sobrantes."""
    return _THINK_RE.sub("", texto or "").strip()


def tokens_por_segundo(data: dict) -> float:
    n = data.get("eval_count", 0)
    dur = data.get("eval_duration", 0)
    return round(n / (dur / 1e9), 2) if dur else 0.0


def ttft_ms(data: dict) -> float:
    """Tiempo de procesado del prompt (aprox. Time To First Token, ms)."""
    return round(data.get("prompt_eval_duration", 0) / 1e6, 1)


def total_ms(data: dict) -> float:
    return round(data.get("total_duration", 0) / 1e6, 1)


def percentil(valores: list[float], p: float) -> float:
    if not valores:
        return 0.0
    return round(float(np.percentile(valores, p)), 1)


info("Helpers de Ollama definidos.")

# ── LLM-as-judge ─────────────────────────────────────────────────────────
PROMPT_JUEZ = """Eres un evaluador imparcial. Evalúa la respuesta de un asistente RAG sobre manuales de juegos de mesa.

REGLA CRÍTICA: juzga basándote EXCLUSIVAMENTE en el contexto proporcionado. Ignora tu conocimiento del mundo. Si el contexto dice que Catan se gana con 8 puntos, eso es la verdad para esta evaluación.

PRECONDICIÓN DE IDIOMA: antes de evaluar el contenido, comprueba que la respuesta está en español natural. Marca IDIOMA_INCORRECTO si CUALQUIERA de:
 - La respuesta está total o mayoritariamente en otro idioma que no sea español.
 - Más del 20 % de las palabras son inglés (sin contar nombres propios ni siglas técnicas inevitables).
 - Hay code-switching sistemático con anglicismos claros ("el setup inicial", "el pool de cartas", "rankear", "tip", "mood").
 - La sintaxis es manifiestamente calcada del inglés (orden de palabra rígido, ausencia de subjuntivo donde el español lo exige).
Errores menores aislados (un anglicismo suelto, una concordancia rota puntual) NO bastan para marcar IDIOMA_INCORRECTO. Evalúa el contenido normalmente.

En preguntas con varias partes, acepta como CORRECTA una respuesta que conteste la parte que SÍ aparece en el contexto y declare explícitamente que la otra parte no aparece. Si inventa datos para la parte que no aparece, es ALUCINADA.

En preguntas aritméticas, la suma debe cuadrar con los costes del contexto para ser CORRECTA.

Clasifica la respuesta en una de estas categorías:
- IDIOMA_INCORRECTO: la respuesta no está en español natural (ver precondición). Prevalece sobre el resto.
- CORRECTA: usa solo información del contexto y responde acertadamente a la pregunta.
- INCOMPLETA: usa información del contexto pero faltan datos clave para responder por completo.
- ALUCINADA: contiene información que NO está en el contexto (inventa o usa conocimiento externo).
- RECHAZO: indica que no puede responder o que la información no está disponible.
{criterio}
Pregunta: {pregunta}

Contexto:
{contexto}

Respuesta del asistente:
{respuesta}

El campo "veredicto" debe ser EXACTAMENTE una de las etiquetas anteriores.

Devuelve SOLO este JSON, sin texto adicional:
{{"veredicto": "CORRECTA", "razon": "breve justificación de una frase"}}"""

VEREDICTOS_VALIDOS = {"CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO"}


def campo_str(reg: Registro, clave: str, default: str = "") -> str:
    valor = reg.get(clave, default)
    return valor if isinstance(valor, str) else default


def campo_bool(reg: Registro, clave: str, default: bool = False) -> bool:
    valor = reg.get(clave, default)
    return valor if isinstance(valor, bool) else default


def campo_float(reg: Registro, clave: str, default: float = 0.0) -> float:
    valor = reg.get(clave, default)
    if isinstance(valor, bool):
        return default
    try:
        return float(valor)
    except (TypeError, ValueError):
        return default


def campo_int(reg: Registro, clave: str, default: int = 0) -> int:
    valor = reg.get(clave, default)
    if isinstance(valor, bool):
        return default
    try:
        return int(valor)
    except (TypeError, ValueError):
        return default


def veredicto_de(reg: Registro) -> str:
    return campo_str(reg, "veredicto", "ERROR")


def veredictos_en_posicion(listas_por_juez: list[list[Registro]], i: int) -> set[str]:
    return {veredicto_de(lst[i]) for lst in listas_por_juez if i < len(lst)}


def unanimidad(listas_por_juez: list[list[Registro]]) -> float:
    if len(listas_por_juez) < 2:
        return 0.0
    n_items = min((len(lst) for lst in listas_por_juez), default=0)
    if n_items == 0:
        return 0.0
    iguales = sum(1 for i in range(n_items) if len(veredictos_en_posicion(listas_por_juez, i)) == 1)
    return round(iguales / n_items, 3)


def valores_float(
    items: list[Registro], clave: str, pred: PredicadoRegistro | None = None
) -> list[float]:
    return [campo_float(item, clave) for item in items if pred is None or pred(item)]


def evaluar_con_juez(
    juez_id: str, pregunta: str, contexto: str, respuesta: str, criterio: str = ""
) -> Registro:
    """Llama al juez con temperatura 0 (Zheng et al., 2023) y parsea el JSON."""
    crit = f"\nCRITERIO ESPECÍFICO PARA ESTA PRUEBA: {criterio}\n" if criterio else ""
    prompt = PROMPT_JUEZ.format(
        criterio=crit, pregunta=pregunta, contexto=contexto, respuesta=respuesta
    )
    payload = {
        "model": juez_id,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.0, "num_predict": 200},
    }
    try:
        r = httpx.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=TIMEOUT)
        r.raise_for_status()
        parsed = json.loads(r.json().get("response", "{}"))
        ver = str(parsed.get("veredicto", "")).upper().strip()
        if "|" in ver:
            partes = [p.strip() for p in ver.split("|")]
            exactas = [p for p in partes if p in VEREDICTOS_VALIDOS]
            ver = exactas[0] if len(exactas) == 1 else "ERROR"
        if ver not in VEREDICTOS_VALIDOS:
            ver = "ERROR"
        return {"veredicto": ver, "razon": str(parsed.get("razon", ""))[:160]}
    except Exception as err:
        return {"veredicto": "ERROR", "razon": f"parse/HTTP: {err}"[:160]}


def calibrar_juez_idioma(juez_id: str) -> bool:
    """Descarta jueces que confunden español obvio con IDIOMA_INCORRECTO."""
    prueba = evaluar_con_juez(
        juez_id,
        "¿Qué recursos necesito para construir un poblado?",
        "Para construir un poblado necesitas una madera, una arcilla, una lana y un trigo.",
        "Una madera, una arcilla, una lana y un trigo.",
    )
    return veredicto_de(prueba) != "IDIOMA_INCORRECTO"


def puntuar(veredicto: str, esperado: str) -> float:
    """Nota 0-1. IDIOMA_INCORRECTO=0 (precondición); DISCREPA=0.5; acierto=1;
    INCOMPLETA cuando se esperaba CORRECTA=0.5; resto=0."""
    if veredicto == "IDIOMA_INCORRECTO":
        return 0.0
    if veredicto == "DISCREPA":
        return 0.5
    if veredicto == esperado:
        return 1.0
    if esperado == "CORRECTA" and veredicto == "INCOMPLETA":
        return 0.5
    return 0.0


def consolidar_veredictos(listas_por_juez: list[list[Registro]]) -> list[Registro]:
    """Voto mayoritario (>=2 de N). Si no hay mayoría -> DISCREPA. ERROR se ignora
    salvo que todos sean ERROR."""
    if not listas_por_juez:
        return []
    n = min(len(lst) for lst in listas_por_juez)
    if any(len(lst) != n for lst in listas_por_juez):
        incidencia("consolidacion: listas de jueces desalineadas; se usa el prefijo comun")
    out: list[Registro] = []
    for i in range(n):
        votos = [veredicto_de(lst[i]) for lst in listas_por_juez]
        validos = [v for v in votos if v != "ERROR"]
        if not validos:
            ver = "ERROR"
        else:
            top, c = Counter(validos).most_common(1)[0]
            ver = top if c >= 2 else "DISCREPA"
        ref = listas_por_juez[0][i]
        esperado = campo_str(ref, "esperado", "CORRECTA")
        out.append(
            {
                "prueba_id": campo_str(ref, "prueba_id"),
                "categoria": campo_str(ref, "categoria"),
                "es_adversarial": campo_bool(ref, "es_adversarial"),
                "dificultad": campo_str(ref, "dificultad"),
                "run": campo_int(ref, "run"),
                "esperado": esperado,
                "veredicto": ver,
                "nota": puntuar(ver, esperado),
                "raw": votos,
            }
        )
    return out


def kappa_cohen(vs_a: list[Registro], vs_b: list[Registro]) -> float:
    """κ de Cohen (1960) entre DOS jueces sobre las mismas respuestas."""
    cats = ["CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO", "ERROR"]
    n = min(len(vs_a), len(vs_b))
    if n == 0:
        return 0.0
    a_items = vs_a[:n]
    b_items = vs_b[:n]
    p_o = sum(1 for a, b in zip(a_items, b_items) if veredicto_de(a) == veredicto_de(b)) / n
    p_e = 0.0
    for c in cats:
        p_a = sum(1 for a in a_items if veredicto_de(a) == c) / n
        p_b = sum(1 for b in b_items if veredicto_de(b) == c) / n
        p_e += p_a * p_b
    return 1.0 if p_e >= 1.0 else round((p_o - p_e) / (1 - p_e), 3)


def kappa_fleiss(listas_por_juez: list[list[Registro]]) -> float:
    """κ de Fleiss (1971) para N jueces (>=2) sobre los mismos ítems."""
    cats = ["CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO", "ERROR"]
    idx = {c: j for j, c in enumerate(cats)}
    n_raters = len(listas_por_juez)
    n_items = min((len(lst) for lst in listas_por_juez), default=0)
    if n_items == 0 or n_raters < 2:
        return 0.0
    M = np.zeros((n_items, len(cats)))
    for r in range(n_raters):
        for i in range(n_items):
            M[i, idx.get(veredicto_de(listas_por_juez[r][i]), idx["ERROR"])] += 1
    P_i = ((M**2).sum(axis=1) - n_raters) / (n_raters * (n_raters - 1))
    P_bar = P_i.mean()
    p_j = M.sum(axis=0) / (n_items * n_raters)
    P_e = float((p_j**2).sum())
    return 1.0 if P_e >= 1.0 else round((P_bar - P_e) / (1 - P_e), 3)


def bootstrap_ci(notas: list[float], B: int = 2000, alpha: float = 0.05) -> tuple[float, float]:
    """IC percentil (95 %) para la media de 'notas' por re-muestreo."""
    if not notas:
        return (0.0, 0.0)
    arr = np.asarray(notas, dtype=float)
    n = len(arr)
    medias = [arr[np.random.randint(0, n, n)].mean() for _ in range(B)]
    lo, hi = np.percentile(medias, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return (round(float(lo), 3), round(float(hi), 3))


def estabilidad(cons: list[Registro]) -> float:
    """Fracción de pruebas cuyo veredicto consolidado es idéntico en todos los runs."""
    by_id: dict[str, list[str]] = {}
    for v in cons:
        prueba_id = campo_str(v, "prueba_id")
        if prueba_id:
            by_id.setdefault(prueba_id, []).append(veredicto_de(v))
    if not by_id:
        return 0.0
    return round(sum(1 for vs in by_id.values() if len(set(vs)) == 1) / len(by_id), 3)


if __name__ == "__main__":
    # Run principal: genera respuestas y las evalúa con el panel de jueces. La salida
    # es COMPACTA (una línea por modelo/juez), pensada para anexo. Los fallos
    # transitorios NO se pintan en rojo: se cuentan en INCIDENCIAS y se resumen al
    # final. Pon VERBOSE=True (celda de config) para el detalle por prueba.
    respuestas_por_modelo: dict[str, list[Registro]] = {}
    info_por_modelo: dict[str, Registro] = {}
    veredictos_por_modelo_juez: dict[str, dict[str, list[Registro]]] = {}
    INCIDENCIAS.clear()
    t_inicio = time.perf_counter()

    seccion("BENCHMARK LLM v2, selección de modelo para el RAG de Manualito")
    fila("Modelos evaluados", len(MODELOS))
    fila("Pruebas", f"{len(PRUEBAS)} ({n_faciles} fáciles + {n_advers} adversariales)")
    fila("Repeticiones / prueba", N_REPETICIONES)
    fila("Panel de jueces", ", ".join(j["nombre"] for j in JUECES))
    fila("Hardware", HARDWARE["gpu"])

    disponibles = modelos_instalados()
    fila("Instalados en Ollama", f"{len(disponibles)} modelos")
    faltan = [
        m for m in [c["id"] for c in MODELOS] + [j["id"] for j in JUECES] if m not in disponibles
    ]
    if faltan:
        info("Descargando lo que falta:", ", ".join(faltan))
        for m in faltan:
            try:
                pull_modelo(m)
            except Exception as err:
                incidencia(f"pull {m}: {err}")
        disponibles = modelos_instalados()

    # ── Fase 1/3: generación ─────────────────────────────────────────────────
    seccion("Fase 1/3, Generación de respuestas")
    for k, cfg in enumerate(MODELOS, 1):
        nombre = cfg["nombre"]
        pref = f"[{k}/{len(MODELOS)}] {nombre}"
        if cfg["id"] not in disponibles:
            incidencia(f"{nombre}: no instalado")
            fila(pref, f"{_DIM}omitido (no instalado){_0}")
            continue
        try:
            t0 = time.perf_counter()
            generar(cfg["id"], "Hola.")
            carga_s = round(time.perf_counter() - t0, 2)
        except Exception as err:
            incidencia(f"{nombre}: warm-up ({err})")
            fila(pref, f"{_DIM}omitido (sin respuesta){_0}")
            continue
        try:
            vram = vram_en_uso_gb(cfg["id"])
        except Exception:
            vram = 0.0
        respuestas: list[Registro] = []
        tps_acc: list[float] = []
        fallos = 0
        for p in PRUEBAS:
            try:
                prompt = PROMPT_TEMPLATE.format(contexto=p["contexto"], pregunta=p["pregunta"])
            except Exception as err:
                incidencia(f"{nombre}/{p['id']}: prompt ({err})")
                continue
            ok = 0
            for run in range(N_REPETICIONES):
                try:
                    data = generar(cfg["id"], prompt)
                    limpia = limpiar_respuesta(data.get("response", ""))
                    tps = tokens_por_segundo(data)
                    respuestas.append(
                        {
                            "prueba_id": p["id"],
                            "categoria": p["categoria"],
                            "es_adversarial": p["es_adversarial"],
                            "dificultad": p["dificultad"],
                            "run": run,
                            "respuesta": limpia,
                            "tps": tps,
                            "ttft": ttft_ms(data),
                            "total_ms": total_ms(data),
                            "palabras": len(limpia.split()),
                        }
                    )
                    tps_acc.append(tps)
                    ok += 1
                except Exception as err:
                    fallos += 1
                    incidencia(f"{nombre}/{p['id']}/r{run}: {err}")
            if VERBOSE:
                tag = "A" if p["es_adversarial"] else "F"
                _safe_print(f"     {_DIM}[{tag}] {p['id']:30} {ok}/{N_REPETICIONES}{_0}")
        respuestas_por_modelo[nombre] = respuestas
        info_por_modelo[nombre] = {"carga_s": carga_s, "vram_gb": vram, "cfg": cfg}
        try:
            descargar_modelo(cfg["id"])
        except Exception:
            pass
        tps_med = statistics.mean(tps_acc) if tps_acc else 0.0
        extra = f"  {_DIM}({fallos} reintento(s)){_0}" if fallos else ""
        fila(pref, f"{len(respuestas):>3} resp, {tps_med:5.1f} tps, {vram:4.1f} GB{extra}")

    # ── Fase 2/3: panel de jueces ────────────────────────────────────────────
    seccion("Fase 2/3, Evaluación por el panel de jueces")
    veredictos_por_modelo_juez = {n: {} for n in respuestas_por_modelo}
    for juez in JUECES:
        jn = juez["nombre"]
        if juez["id"] not in disponibles:
            incidencia(f"juez {jn}: no instalado")
            fila(jn, f"{_DIM}omitido (no instalado){_0}")
            continue
        try:
            generar(juez["id"], "Hola.")
        except Exception as err:
            incidencia(f"warm-up juez {jn}: {err}")
        total_v = 0
        sin_parsear = 0
        for nombre, respuestas in respuestas_por_modelo.items():
            vs: list[Registro] = []
            for r in respuestas:
                try:
                    prueba_id = campo_str(r, "prueba_id")
                    prueba = PRUEBAS_POR_ID.get(prueba_id, {})
                    v = evaluar_con_juez(
                        campo_str(juez, "id"),
                        campo_str(prueba, "pregunta"),
                        campo_str(prueba, "contexto"),
                        campo_str(r, "respuesta"),
                        campo_str(prueba, "criterio"),
                    )
                    if v.get("veredicto") == "ERROR":
                        sin_parsear += 1
                    v.update(
                        {
                            "prueba_id": prueba_id,
                            "categoria": campo_str(r, "categoria"),
                            "es_adversarial": campo_bool(r, "es_adversarial"),
                            "dificultad": campo_str(r, "dificultad"),
                            "run": campo_int(r, "run"),
                            "esperado": campo_str(prueba, "veredicto_esperado", "CORRECTA"),
                        }
                    )
                    vs.append(v)
                    total_v += 1
                except Exception as err:
                    incidencia(f"juez {jn}/{r.get('prueba_id')}: {err}")
            veredictos_por_modelo_juez[nombre][jn] = vs
        try:
            descargar_modelo(juez["id"])
        except Exception:
            pass
        extra = f"  {_DIM}({sin_parsear} sin parsear){_0}" if sin_parsear else ""
        fila(jn, f"{total_v} veredictos{extra}")

    mins = (time.perf_counter() - t_inicio) / 60
    if INCIDENCIAS:
        info(
            "Incidencias toleradas:",
            f"{len(INCIDENCIAS)} (no afectan al resultado, VERBOSE=True para verlas)",
        )
        if VERBOSE:
            for x in INCIDENCIAS[:60]:
                _safe_print(f"   {_DIM}- {x}{_0}")
    info("Fases 1-2 completadas en", f"{mins:.1f} min.")

    # ── Consolidación (mayoría) + acuerdo + κ ────────────────────────────────
    jueces_para_consolidar = globals().get("JUECES_ACTIVOS", JUECES)
    nombres_jueces = [j["nombre"] for j in jueces_para_consolidar if j["id"] in disponibles]
    consolidados_por_modelo: dict[str, list[Registro]] = {}
    acuerdo_por_modelo: dict[str, float] = {}

    for nombre, por_juez in veredictos_por_modelo_juez.items():
        listas: list[list[Registro]] = [por_juez[jn] for jn in nombres_jueces if por_juez.get(jn)]
        if len(listas) < 2:
            consolidados_por_modelo[nombre] = []
            acuerdo_por_modelo[nombre] = 0.0
            continue
        consolidados_por_modelo[nombre] = consolidar_veredictos(listas)
        acuerdo_por_modelo[nombre] = unanimidad(listas)

    # Listas globales por juez (concatenando todos los modelos, alineadas)
    global_por_juez = {
        jn: [
            v
            for nombre in veredictos_por_modelo_juez
            for v in veredictos_por_modelo_juez[nombre].get(jn, [])
        ]
        for jn in nombres_jueces
    }
    global_jueces = [jn for jn in nombres_jueces if global_por_juez[jn]]
    global_listas: list[list[Registro]] = [global_por_juez[jn] for jn in global_jueces]

    fleiss = kappa_fleiss(global_listas) if len(global_listas) >= 2 else 0.0
    cohen_pares = []
    for a, b in itertools.combinations(range(len(global_listas)), 2):
        cohen_pares.append(
            (
                f"{global_jueces[a]} vs {global_jueces[b]}",
                kappa_cohen(global_listas[a], global_listas[b]),
            )
        )
    acuerdo_global = unanimidad(global_listas)

    seccion("Acuerdo inter-juez")
    fila("Unanimidad (3 jueces)", f"{acuerdo_global:.3f}")
    fila("κ de Fleiss", f"{fleiss:.3f}  (>0.61 sustancial, >0.81 casi perfecto)")
    for nombre_par, k in cohen_pares:
        fila(f"κ Cohen, {nombre_par}", f"{k:.3f}")

    # ── Guardar crudos (silenciando cualquier fallo de escritura) ────────────
    _crudos = {
        "hardware": HARDWARE,
        "modelos": [c["nombre"] for c in MODELOS],
        "jueces": nombres_jueces,
        "n_repeticiones": N_REPETICIONES,
        "thinking": THINKING,
        "pruebas": [
            {
                k: p.get(k)
                for k in (
                    "id",
                    "categoria",
                    "es_adversarial",
                    "dificultad",
                    "pregunta",
                    "contexto",
                    "veredicto_esperado",
                    "criterio",
                )
            }
            for p in PRUEBAS
        ],
        "info": {
            n: {k: v for k, v in inf.items() if k != "cfg"} for n, inf in info_por_modelo.items()
        },
        "respuestas": respuestas_por_modelo,
        "veredictos": veredictos_por_modelo_juez,
        "consolidados": consolidados_por_modelo,
        "acuerdo_inter_juez": {
            "por_modelo": acuerdo_por_modelo,
            "global": acuerdo_global,
            "kappa_fleiss": fleiss,
            "kappa_cohen_pares": dict(cohen_pares),
        },
    }
    try:
        with open("results.json", "w", encoding="utf-8") as f:
            json.dump(_crudos, f, ensure_ascii=False, indent=2)
        info("Crudos guardados en:", "results.json")
    except Exception as err:
        incidencia(f"results.json: {err}")

    # ── Agregación por modelo ────────────────────────────────────────────────
    def media_sub(cons: list[Registro], pred: PredicadoRegistro) -> float:
        sub = valores_float(cons, "nota", pred)
        return round(sum(sub) / len(sub), 3) if sub else 0.0

    def rechazos_correctos(cons: list[Registro]) -> str:
        rechazos = [v for v in cons if campo_str(v, "esperado") == "RECHAZO"]
        if not rechazos:
            return "0/0"
        ok = sum(1 for v in rechazos if veredicto_de(v) == "RECHAZO")
        return f"{ok}/{len(rechazos)}"

    resultados: list[Registro] = []
    for cfg in MODELOS:
        nombre = campo_str(cfg, "nombre")
        if nombre not in info_por_modelo:
            continue
        cons = consolidados_por_modelo.get(nombre, [])
        resp = respuestas_por_modelo.get(nombre, [])
        if not cons or not resp:
            continue
        notas_f = valores_float(cons, "nota", lambda v: not campo_bool(v, "es_adversarial"))
        notas_a = valores_float(cons, "nota", lambda v: campo_bool(v, "es_adversarial"))
        ttfts = valores_float(resp, "ttft")
        pals = valores_float(resp, "palabras")
        tps = valores_float(resp, "tps")
        por_juez = veredictos_por_modelo_juez[nombre]
        listas: list[list[Registro]] = [por_juez[jn] for jn in nombres_jueces if por_juez.get(jn)]
        nL = min((len(lst) for lst in listas), default=0)
        idi_alguno = sum(
            1
            for i in range(nL)
            if any(veredicto_de(lst[i]) == "IDIOMA_INCORRECTO" for lst in listas)
        )
        resultados.append(
            {
                "nombre": nombre,
                "etiqueta": campo_str(cfg, "etiqueta"),
                "color": campo_str(cfg, "color"),
                "carga_s": campo_float(info_por_modelo[nombre], "carga_s"),
                "vram_gb": campo_float(info_por_modelo[nombre], "vram_gb"),
                "tps_avg": round(statistics.mean(tps), 1) if tps else 0.0,
                "ttft_p50": percentil(ttfts, 50),
                "ttft_p95": percentil(ttfts, 95),
                "palabras_med": round(statistics.median(pals), 1) if pals else 0.0,
                "fidelidad_facil": media_sub(cons, lambda v: not campo_bool(v, "es_adversarial")),
                "fidelidad_advers": media_sub(cons, lambda v: campo_bool(v, "es_adversarial")),
                "ci_facil": bootstrap_ci(notas_f),
                "ci_advers": bootstrap_ci(notas_a),
                "fid_dif_facil": media_sub(cons, lambda v: campo_str(v, "dificultad") == "facil"),
                "fid_dif_dificil": media_sub(
                    cons, lambda v: campo_str(v, "dificultad") == "dificil"
                ),
                "estabilidad": estabilidad(cons),
                "alucinaciones": sum(1 for v in cons if veredicto_de(v) == "ALUCINADA"),
                "discrepancias": sum(1 for v in cons if veredicto_de(v) == "DISCREPA"),
                "idioma_ko": sum(1 for v in cons if veredicto_de(v) == "IDIOMA_INCORRECTO"),
                "idioma_ko_alguno": idi_alguno,
                "rechazos_ok": rechazos_correctos(cons),
                "acuerdo": acuerdo_por_modelo.get(nombre, 0.0),
                "total": len(cons),
            }
        )

    info("Agregación completada.", f"{len(resultados)} modelos con datos.")
