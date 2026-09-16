"""Mide modelos LLM ajustados al límite de 4 GB de VRAM.

Se conserva el protocolo de generación y evaluación del notebook original.
La ejecución requiere confirmación explícita y guarda los datos en un directorio
nuevo para evitar repetir o sobrescribir resultados accidentalmente.
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
    _ARGS, _OUTPUT_DIR = parse_and_prepare(
        "Mide modelos LLM con el límite de 4 GB de VRAM.", Path(__file__)
    )
    import httpx

import argparse
import json
import math
import os
import random
import statistics
import time
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any

ROOT = Path.cwd()

OLLAMA_URL = "http://localhost:11434"
TIMEOUT = 300.0

VRAM_CAP_GB = 4.0
DEFAULT_NUM_CTX = 4096
DEFAULT_REPETITIONS = 3
GEN_TEMPERATURE = 0.1
JUDGE_TEMPERATURE = 0.0
GEN_NUM_PREDICT = 512
JUDGE_NUM_PREDICT = 220

VERDICTS = {
    "CORRECTA",
    "INCOMPLETA",
    "ALUCINADA",
    "RECHAZO",
    "IDIOMA_INCORRECTO",
}


MODELS: list[dict[str, Any]] = [
    {
        "id": "qwen3:0.6b",
        "label": "qwen3 0.6B",
        "family": "Qwen",
        "published_size_gb": 0.523,
        "reason": "suelo ultraligero moderno y multilingüe",
        "color": "#89b4fa",
    },
    {
        "id": "qwen3:1.7b",
        "label": "qwen3 1.7B",
        "family": "Qwen",
        "published_size_gb": 1.4,
        "reason": "candidato principal low/iGPU",
        "color": "#74c7ec",
    },
    {
        "id": "qwen3:4b",
        "label": "qwen3 4B",
        "family": "Qwen",
        "published_size_gb": 2.5,
        "reason": "stretch 4B con razonamiento fuerte",
        "color": "#b4befe",
    },
    {
        "id": "gemma3:1b",
        "label": "gemma3 1B",
        "family": "Google",
        "published_size_gb": 0.815,
        "reason": "baseline compacto de Google",
        "color": "#fab387",
    },
    {
        "id": "gemma3:4b",
        "label": "gemma3 4B",
        "family": "Google",
        "published_size_gb": 3.3,
        "reason": "baseline 4B fuerte; medir VRAM real",
        "color": "#f9e2af",
    },
    {
        "id": "llama3.2:1b",
        "label": "llama3.2 1B",
        "family": "Meta",
        "published_size_gb": 1.3,
        "reason": "baseline pequeño con español soportado",
        "color": "#a6e3a1",
    },
    {
        "id": "llama3.2:3b",
        "label": "llama3.2 3B",
        "family": "Meta",
        "published_size_gb": 2.0,
        "reason": "baseline estable para 4 GB",
        "color": "#94e2d5",
    },
    {
        "id": "phi4-mini:3.8b",
        "label": "phi4-mini 3.8B",
        "family": "Microsoft",
        "published_size_gb": 2.5,
        "reason": "razonamiento compacto",
        "color": "#f38ba8",
    },
    {
        "id": "granite3.3:2b",
        "label": "granite3.3 2B",
        "family": "IBM",
        "published_size_gb": 1.5,
        "reason": "RAG/QA e instruction following, español soportado",
        "color": "#cba6f7",
    },
    {
        "id": "deepseek-r1:1.5b",
        "label": "deepseek-r1 1.5B",
        "family": "DeepSeek",
        "published_size_gb": 1.1,
        "reason": "razonamiento destilado pequeño",
        "color": "#eba0ac",
    },
]


JUDGES: list[dict[str, str]] = [
    {"id": "aya-expanse:8b", "label": "aya-expanse 8B", "family": "Cohere"},
    {"id": "mistral-nemo:12b", "label": "mistral-nemo 12B", "family": "Mistral"},
    {"id": "phi4:14b", "label": "phi4 14B", "family": "Microsoft"},
]


PROMPT_TEMPLATE = """Eres Manualito, un asistente que responde preguntas sobre manuales de juegos de mesa.

Usa EXCLUSIVAMENTE la información del contexto. Si la respuesta no aparece en el contexto, responde literalmente: "No aparece en el manual."
Responde siempre en español, de forma breve y clara. No inventes reglas.

Contexto:
{context}

Pregunta:
{question}

Respuesta:"""


JUDGE_PROMPT = """Eres un evalúador imparcial de respuestas RAG sobre manuales de juegos de mesa.

Juzga basándote EXCLUSIVAMENTE en el contexto proporcionado. Ignora tu conocimiento del mundo.

PRECONDICION DE IDIOMA:
Marca IDIOMA_INCORRECTO si la respuesta no está en español natural, si está mayoritariamente en otro idioma, si tiene code-switching sistemático o si su sintaxis está claramente calcada de otro idioma. Un error menor aislado no basta.

En preguntas con varias partes, acepta como CORRECTA una respuesta que conteste la parte que aparece en el contexto y declare explícitamente que la otra parte no aparece. Si inventa datos, marca ALUCINADA.

En preguntas aritméticas, la suma debe cuadrar con los costes del contexto.

Clasifica la respuesta en una sola categoría:
- IDIOMA_INCORRECTO
- CORRECTA
- INCOMPLETA
- ALUCINADA
- RECHAZO
{criterion}
Pregunta: {question}

Contexto:
{context}

Respuesta del asistente:
{answer}

Devuelve SOLO este JSON:
{{"veredicto": "CORRECTA", "razon": "breve justificación"}}"""


TESTS: list[dict[str, Any]] = [
    {
        "id": "factúal_jugadores",
        "category": "factúal",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Cuántos jugadores pueden jugar a Catan?",
        "context": "Catan es un juego de mesa para 3 o 4 jugadores. Con la expansión 5-6 jugadores puede ampliarse hasta seis participantes.",
        "expected": "CORRECTA",
    },
    {
        "id": "factúal_duracion",
        "category": "factúal",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Cuánto dura aproximadamente una partida de Azul?",
        "context": "Azul es un juego para 2 a 4 jugadores. Una partida típica dura entre 30 y 45 minutos. El objetivo es decorar el palacio real.",
        "expected": "CORRECTA",
    },
    {
        "id": "multi_recursos_poblado",
        "category": "multi_fact",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Qué recursos necesito para construir un poblado?",
        "context": "Para construir un poblado necesitas una madera, una arcilla, una lana y un trigo. Para una ciudad necesitas dos trigos y tres minerales.",
        "expected": "CORRECTA",
    },
    {
        "id": "multi_ladron",
        "category": "multi_fact",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Cuándo se activa el ladrón y qué efecto tiene?",
        "context": "El ladrón se activa cuándo un jugador saca un 7 con los dados o cuándo se usa una carta de caballero. Al moverlo, el hexágono donde se coloca deja de producir recursos y el jugador puede robar una carta a un rival con poblado o ciudad adyacente.",
        "expected": "CORRECTA",
    },
    {
        "id": "planted_puntos_8",
        "category": "planted_fact",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Con cuántos puntos de victoria se gana la partida?",
        "context": "La partida de Catan termina cuándo un jugador alcanza 8 puntos de victoria al comenzar su turno.",
        "expected": "CORRECTA",
    },
    {
        "id": "planted_ciudad_5_minerales",
        "category": "planted_fact",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Qué recursos necesito para construir una ciudad?",
        "context": "Para construir una ciudad en Catan necesitas cinco minerales y un trigo. La ciudad reemplaza a un poblado existente.",
        "expected": "CORRECTA",
    },
    {
        "id": "fuera_mundial",
        "category": "fuera_contexto",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Quién ganó el mundial de fútbol de 2022?",
        "context": "Catan es un juego de mesa para 3 o 4 jugadores. El objetivo es alcanzar 10 puntos de victoria.",
        "expected": "RECHAZO",
    },
    {
        "id": "fuera_capital",
        "category": "fuera_contexto",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Cuál es la capital de Alemania?",
        "context": "Azul es un juego para 2 a 4 jugadores. Los jugadores colocan azulejos en su tablero personal para decorar el palacio.",
        "expected": "RECHAZO",
    },
    {
        "id": "distractor_comercio",
        "category": "distractor",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Cuándo puedo comerciar con otros jugadores?",
        "context": "En Catan el turno se compone de tres fases: tirada de dados, comercio e intercambios, y construcción. El comercio solo se permite durante tu propio turno. Al inicio del juego cada jugador recibe dos poblados y dos carreteras. El tablero se forma con 19 hexágonos.",
        "expected": "CORRECTA",
    },
    {
        "id": "distractor_muralla",
        "category": "distractor",
        "adversarial": False,
        "difficulty": "fácil",
        "question": "Cuánto cuesta construir una muralla?",
        "context": "En la expansión Ciudades y Caballeros, la muralla cuesta dos arcillas y protege a la ciudad del ataque bárbaro. Las cartas de progreso se obtienen con minerales, lana y trigo. Los caballeros cuestan una lana y un mineral y se activan con un trigo. Solo se pueden construir murallas en ciudades, no en poblados.",
        "expected": "CORRECTA",
    },
    {
        "id": "factúal_dificil_viaje",
        "category": "factúal_dificil",
        "adversarial": False,
        "difficulty": "difícil",
        "question": "Cuántos jugadores admite la versión de viaje de Catan?",
        "context": "El club tiene tres ediciones en la estantería. Catan estándar es para 3 o 4 jugadores. Catan: Espacial admite de 2 a 4 jugadores. La versión de viaje de Catan está pensada solo para 2 jugadores y cabe en una caja pequeña.",
        "expected": "CORRECTA",
    },
    {
        "id": "factúal_dificil_duracion_azul",
        "category": "factúal_dificil",
        "adversarial": False,
        "difficulty": "difícil",
        "question": "Cuánto dura una partida de Azul a 2 jugadores?",
        "context": "Tiempos de partida estimados en la caja: Catan, 75 minutos. Carcassonne, 35 minutos. Azul, entre 30 y 45 minutos con 3 o 4 jugadores; a 2 jugadores baja a unos 20-30 minutos.",
        "expected": "CORRECTA",
    },
    {
        "id": "contra_ladron_turnos",
        "category": "contradicción",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuándo actúa exactamente el ladrón?",
        "context": "En Catan el ladrón actúa de forma inmediata cuándo un jugador saca un 7 con los dados: se mueve y bloquea un hexágono al instante.\n\nCada jugador juega en el sentido horario. El ladrón, sin embargo, se activa solo al final del turno del jugador activo, momento en el que se mueve a un nuevo hexágono.\n\nEl tablero se compone de 19 hexágonos de recursos.",
        "expected": "CORRECTA",
    },
    {
        "id": "contra_jugadores_max",
        "category": "contradicción",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuántos jugadores máximo pueden jugar?",
        "context": "Catan es un juego para 3 o 4 jugadores. El tablero se forma con hexágonos de recursos.\n\nEn la expansión incluida en esta misma caja, se añaden piezas para permitir que jueguen hasta 6 participantes sin alterar el resto de las reglas.\n\nLos jugadores compiten por ser los primeros en alcanzar 10 puntos de victoria.",
        "expected": "CORRECTA",
    },
    {
        "id": "comp_9_cartas_7",
        "category": "composicion",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Si el jugador activo saca un 7 y otro jugador tiene 9 cartas en la mano, qué ocurre con ese jugador?",
        "context": "En Catan, cuándo el jugador activo saca un 7 con los dados al inicio de su turno, ocurren dos cosas en este orden:\n1. Todos los jugadores que tengan más de 7 cartas en la mano deben descartar la mitad (redondeando hacia abajo).\n2. El jugador activo mueve el ladrón a cualquier hexágono y puede robar una carta aleatoria a un rival adyacente.",
        "expected": "CORRECTA",
    },
    {
        "id": "comp_ciudad_desde_cero",
        "category": "composicion",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuántos recursos necesito en total para tener una ciudad construida, partiendo desde cero y sin poblado previo?",
        "context": "En Catan hay dos construcciónes jerarquicas:\n- Un poblado cuesta 1 madera, 1 ladrillo, 1 lana y 1 trigo.\n- Una ciudad sustituye a un poblado existente y cuesta 2 trigos y 3 minerales. No se puede construir una ciudad sin un poblado previo en la misma intersección.",
        "expected": "CORRECTA",
    },
    {
        "id": "parcial_coste_puerto",
        "category": "info_parcial",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Qué coste tienen los puertos 3:1 y 2:1?",
        "context": "En Catan hay puertos en los bordes del tablero. El puerto 2:1 especifico permite cambiar 2 unidades del recurso indicado por 1 recurso cualquiera. Solo está disponible para el jugador que tenga un poblado o ciudad tocando ese puerto; no tiene coste adicional.",
        "expected": "CORRECTA",
    },
    {
        "id": "parcial_fin_azul",
        "category": "info_parcial",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cómo se puntúa el final de Azul y cuánto dura una partida típica?",
        "context": "Azul termina cuándo un jugador completa una fila horizontal de azulejos en su tablero personal. Se hace un recuento final en el que cada fila completa añade 2 puntos extra, cada columna completa 7 puntos, y cada conjunto de 5 colores iguales 10 puntos. El jugador con más puntos gana.",
        "expected": "CORRECTA",
    },
    {
        "id": "num_2_carreteras_1_ciudad",
        "category": "número_trampa",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuántos recursos en total necesito para construir 2 carreteras y 1 ciudad sin contar el poblado previo de la ciudad?",
        "context": "En Catan los costes de construcción son:\n- Carretera: 1 madera + 1 ladrillo.\n- Poblado: 1 madera + 1 ladrillo + 1 lana + 1 trigo.\n- Ciudad: 2 trigos + 3 minerales, y sustituye un poblado existente.",
        "expected": "CORRECTA",
    },
    {
        "id": "num_3_poblados_2_desarrollo",
        "category": "número_trampa",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuántos recursos en total para construir 3 poblados y comprar 2 cartas de desarrollo?",
        "context": "Costes en Catan:\n- Poblado: 1 madera + 1 ladrillo + 1 lana + 1 trigo.\n- Carta de desarrollo: 1 lana + 1 trigo + 1 mineral.",
        "expected": "CORRECTA",
    },
    {
        "id": "contra_estricta_carretera",
        "category": "contradicción_estricta",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuánto cuesta exactamente una carretera?",
        "context": "En la sección de construcción se indica que una carretera cuesta 1 madera y 1 ladrillo.\n\nMás adelante, en la tabla de costes resumida, la carretera figura como 2 maderas.\n\nAmbas indicaciones aparecen en el mismo manual y no se dice cuál prevalece.",
        "criterion": "El contexto se contradice a proposito. La respuesta solo es CORRECTA si señala explícitamente que hay contradicción o presenta ambas versiones.",
        "expected": "CORRECTA",
    },
    {
        "id": "contra_estricta_mano_max",
        "category": "contradicción_estricta",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Cuál es el límite de cartas en mano sin penalización?",
        "context": "El reglamento base dice que puedes guardar hasta 7 cartas en la mano sin descartar.\n\nEn la hoja de erratas incluida en la caja, ese límite se corrige a 8 cartas.\n\nNo se indica explícitamente cuál de las dos prevalece.",
        "criterion": "El contexto se contradice a proposito. La respuesta solo es CORRECTA si señala explícitamente la contradicción o presenta ambas cifras.",
        "expected": "CORRECTA",
    },
    {
        "id": "condicional_aserradero",
        "category": "condicional",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Si controlo un aserradero, cuánta madera necesito para una carretera?",
        "context": "Una carretera cuesta normalmente 2 maderas y 1 ladrillo. Excepcion: si controlas un aserradero, la madera necesaria para construir carreteras se reduce a la mitad, redondeando hacia abajo.",
        "expected": "CORRECTA",
    },
    {
        "id": "condicional_handicap",
        "category": "condicional",
        "adversarial": True,
        "difficulty": "difícil",
        "question": "Si voy en cabeza, cuántos puntos de victoria necesito para ganar?",
        "context": "La partida se gana al alcanzar 10 puntos de victoria. Regla de handicap opcional activada en esta partida: el jugador que vaya en cabeza al inicio de cada ronda necesita 2 puntos de victoria adicionales para poder ganar.",
        "expected": "CORRECTA",
    },
]


# ?? Formato de salida con colores ANSI (mismo estilo que preprocessing) ??
_ESC = chr(27)
_Y = f"{_ESC}[33m"  # amarillo
_C = f"{_ESC}[36m"  # cian
_R = f"{_ESC}[31m"  # rojo
_G = f"{_ESC}[32m"  # verde
_DIM = f"{_ESC}[2m"  # tenue
_0 = f"{_ESC}[0m"  # reset


def _safe_print(line: str = "") -> None:
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)


def warn(msg: str, data: str = "") -> None:
    info(msg, data)


def seccion(title: str) -> None:
    bar = "=" * 72
    _safe_print(f"\n{_C}{bar}{_0}")
    info(title)
    _safe_print(f"{_C}{bar}{_0}")


def seccion_ok(title: str) -> None:
    bar = "=" * 72
    _safe_print(f"\n{_G}{bar}{_0}")
    _safe_print(f"{_G}[*] {title}{_0}")
    _safe_print(f"{_G}{bar}{_0}")


def fila(label: str, value: object = "") -> None:
    _safe_print(f"    {_C}{label:<28}{_0} {value}")


def validate_suite() -> None:
    ids = [t["id"] for t in TESTS]
    duplicates = sorted({x for x in ids if ids.count(x) > 1})
    if duplicates:
        raise ValueError(f"Ids de prueba duplicados: {duplicates}")
    for test in TESTS:
        for key in (
            "id",
            "category",
            "adversarial",
            "difficulty",
            "question",
            "context",
            "expected",
        ):
            if key not in test:
                raise ValueError(f"Falta {key} en prueba {test}")
        if test["expected"] not in VERDICTS:
            raise ValueError(f"Veredicto esperado inválido: {test['id']}")
    if not (7 <= len(MODELS) <= 10):
        raise ValueError("El benchmark 4GB debe probar entre 7 y 10 modelos.")
    too_large = [m["id"] for m in MODELS if float(m["published_size_gb"]) > 4.0]
    if too_large:
        raise ValueError(f"Modelos con peso publicado > 4GB: {too_large}")


def proxy_env_vars() -> dict[str, str]:
    keys = (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
    )
    return {key: os.environ[key] for key in keys if os.environ.get(key)}


PROXY_ERROR_HINT = (
    "Ollama está intentando descargar a través de un proxy roto. "
    "Aunque el kernel diga que no tiene proxy, el proceso de Ollama sí lo está usando. "
    "Cierra Ollama, limpia variables proxy en PowerShell con "
    "`Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue`, "
    "y lanza `ollama serve` desde esa misma terminal limpia. "
    "Si el proxy está configurado como variable de usuario/sistema de Windows, elimínalo también ahí."
)


def proxy_hint() -> str:
    return PROXY_ERROR_HINT


def enrich_ollama_error(message: str) -> str:
    if PROXY_ERROR_HINT in message or "Ollama está intentando descargar" in message:
        return message
    lowered = message.lower()
    if "proxyconnect" in lowered or "127.0.0.1:9" in lowered:
        return f"{message}\n\n{PROXY_ERROR_HINT}"
    if "no connection could be made" in lowered or "connection refused" in lowered:
        ollama_hint = (
            f"Ollama no está respondiendo en {OLLAMA_URL}. Abre Ollama o ejecuta `ollama serve`."
        )
        if ollama_hint in message:
            return message
        return f"{message}\n\n{ollama_hint}"
    return message


def post_json(path: str, payload: dict[str, Any], timeout: float = TIMEOUT) -> dict[str, Any]:
    try:
        response = httpx.post(f"{OLLAMA_URL}{path}", json=payload, timeout=timeout, trust_env=False)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        raise RuntimeError(enrich_ollama_error(str(exc))) from exc


def get_json(path: str, timeout: float = 10.0) -> dict[str, Any]:
    try:
        response = httpx.get(f"{OLLAMA_URL}{path}", timeout=timeout, trust_env=False)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        raise RuntimeError(enrich_ollama_error(str(exc))) from exc


def installed_models() -> set[str]:
    data = get_json("/api/tags")
    return {m.get("name", "") for m in data.get("models", [])}


def preflight(args: argparse.Namespace) -> dict[str, Any]:
    seccion("Preflight del benchmark")
    validate_suite()
    fila("Suite", f"{len(TESTS)} pruebas, {len(MODELS)} modelos, {len(JUDGES)} jueces")
    fila("Generaciones", len(MODELS) * len(TESTS) * args.repetitions)
    fila("Veredictos", len(MODELS) * len(TESTS) * args.repetitions * len(JUDGES))
    fila("num_ctx", args.num_ctx)
    fila("Límite VRAM", f"{args.vram_cap_gb} GB")

    proxies = proxy_env_vars()
    if proxies:
        warn(
            "Variables proxy detectadas en el kernel:",
            ", ".join(f"{k}={v}" for k, v in proxies.items()),
        )
        if any("127.0.0.1:9" in value for value in proxies.values()):
            error("Proxy 127.0.0.1:9 detectado: las descargas de Ollama fallarán hasta limpiarlo.")
            _safe_print(f"    {_DIM}{proxy_hint()}{_0}")
    else:
        info("Proxy del kernel:", "sin variables proxy")

    try:
        version = get_json("/api/version", timeout=5.0).get("version", "desconocida")
        info("Ollama responde:", f"{OLLAMA_URL} (versión {version})")
    except Exception as exc:
        error(enrich_ollama_error(str(exc)))
        raise

    installed = installed_models()
    needed = [m["id"] for m in MODELS] + [j["id"] for j in JUDGES]
    missing = [model for model in needed if model not in installed]
    info("Modelos instalados necesarios:", f"{len(needed) - len(missing)}/{len(needed)}")
    if missing:
        warn("Faltan modelos:", ", ".join(missing))
        if args.pull_missing:
            info("Descarga automática:", "activada; se usará POST /api/pull de Ollama")
        else:
            error(
                "PULL_MISSING=False y faltan modelos. Descárgalos con `ollama pull <modelo>` o activa PULL_MISSING."
            )
    else:
        seccion_ok("Todos los modelos necesarios están instalados")
    return {"installed": installed, "missing": missing, "proxies": proxies}


def pull_model(model_id: str) -> None:
    info("Descargando modelo:", model_id)
    last_status = ""
    last_bucket = -1
    try:
        with httpx.stream(
            "POST",
            f"{OLLAMA_URL}/api/pull",
            json={"model": model_id, "stream": True},
            timeout=None,
            trust_env=False,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("error"):
                    raise RuntimeError(str(event["error"]))
                status = str(event.get("status", "")).strip()
                total = int(event.get("total") or 0)
                completed = int(event.get("completed") or 0)
                if total > 0 and completed >= 0:
                    bucket = int((completed / total) * 10) * 10
                    if bucket != last_bucket:
                        fila(
                            status or "descargando",
                            f"{completed / (1024**2):.1f}/{total / (1024**2):.1f} MB ({bucket}%)",
                        )
                        last_bucket = bucket
                elif status and status != last_status:
                    fila("estado", status)
                    last_status = status
    except Exception as exc:
        message = enrich_ollama_error(str(exc))
        raise RuntimeError(f"No se pudo descargar {model_id}: {message}") from exc
    seccion_ok(f"Modelo descargado: {model_id}")


def ensure_models(pull_missing: bool) -> None:
    installed = installed_models()
    needed = [m["id"] for m in MODELS] + [j["id"] for j in JUDGES]
    missing = [m for m in needed if m not in installed]
    if not missing:
        info("Modelos necesarios:", "todos instalados")
        return
    warn("Modelos pendientes de descarga:", ", ".join(missing))
    if not pull_missing:
        raise SystemExit(
            "Faltan modelos en Ollama: "
            + ", ".join(missing)
            + "\nDescárgalos con `ollama pull <modelo>` o activa PULL_MISSING=True."
        )
    for index, model_id in enumerate(missing, start=1):
        info(f"Pull {index}/{len(missing)}", model_id)
        pull_model(model_id)


def unload_model(model_id: str) -> None:
    try:
        post_json("/api/generate", {"model": model_id, "prompt": "", "keep_alive": 0}, timeout=15.0)
    except Exception:
        pass


def ps_entry(model_id: str) -> dict[str, Any]:
    try:
        data = get_json("/api/ps", timeout=5.0)
    except Exception:
        return {}
    for entry in data.get("models", []):
        if entry.get("name") == model_id or entry.get("model") == model_id:
            return entry
    return {}


def vram_gb_from_ps(entry: dict[str, Any]) -> float:
    raw = entry.get("size_vram", 0) or 0
    try:
        return round(float(raw) / (1024**3), 3)
    except (TypeError, ValueError):
        return 0.0


def generate(model_id: str, prompt: str, num_ctx: int) -> dict[str, Any]:
    payload = {
        "model": model_id,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "options": {
            "temperature": GEN_TEMPERATURE,
            "num_predict": GEN_NUM_PREDICT,
            "num_ctx": num_ctx,
        },
    }
    try:
        return post_json("/api/generate", payload)
    except httpx.HTTPStatusError:
        payload.pop("think", None)
        return post_json("/api/generate", payload)


def judge(judge_id: str, test: dict[str, Any], answer: str) -> dict[str, Any]:
    criterion = ""
    if test.get("criterion"):
        criterion = f"\nCRITERIO ESPECIFICO: {test['criterion']}\n"
    prompt = JUDGE_PROMPT.format(
        criterion=criterion,
        question=test["question"],
        context=test["context"],
        answer=answer,
    )
    payload = {
        "model": judge_id,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "think": False,
        "options": {"temperature": JUDGE_TEMPERATURE, "num_predict": JUDGE_NUM_PREDICT},
    }
    try:
        data = post_json("/api/generate", payload)
    except httpx.HTTPStatusError:
        payload.pop("think", None)
        data = post_json("/api/generate", payload)
    raw = data.get("response", "{}")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"verdict": "ERROR", "reason": f"JSON inválido: {raw[:120]}"}
    verdict = str(parsed.get("veredicto", "")).strip().upper()
    if "|" in verdict:
        candidates = [part.strip() for part in verdict.split("|")]
        valid = [part for part in candidates if part in VERDICTS]
        verdict = valid[0] if len(valid) == 1 else "ERROR"
    if verdict not in VERDICTS:
        verdict = "ERROR"
    return {"verdict": verdict, "reason": str(parsed.get("razon", parsed.get("razón", "")))[:240]}


def tokens_per_second(data: dict[str, Any]) -> float:
    count = data.get("eval_count", 0) or 0
    duration = data.get("eval_duration", 0) or 0
    return round(float(count) / (float(duration) / 1e9), 3) if duration else 0.0


def ms_from_ns(data: dict[str, Any], key: str) -> float:
    value = data.get(key, 0) or 0
    return round(float(value) / 1e6, 3)


def clean_answer(data: dict[str, Any]) -> tuple[str, str]:
    answer = str(data.get("response", "") or "").strip()
    thinking = str(data.get("thinking", "") or "").strip()
    lower = answer.lower()
    if "<think>" in lower and "</think>" in lower:
        before, _, rest = answer.partition("<think>")
        _, _, after = rest.partition("</think>")
        thinking = (thinking + "\n" + rest.split("</think>", 1)[0]).strip()
        answer = (before + " " + after).strip()
    return answer, thinking


def median(values: Iterable[float]) -> float:
    vals = [v for v in values if not math.isnan(v)]
    return round(statistics.median(vals), 3) if vals else 0.0


def percentile(values: Iterable[float], pct: float) -> float:
    vals = sorted(v for v in values if not math.isnan(v))
    if not vals:
        return 0.0
    k = (len(vals) - 1) * pct
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(vals[int(k)], 3)
    return round(vals[f] * (c - k) + vals[c] * (k - f), 3)


def score(verdict: str, expected: str) -> float:
    if verdict == "IDIOMA_INCORRECTO":
        return 0.0
    if verdict == "DISCREPA":
        return 0.5
    if verdict == expected:
        return 1.0
    if expected == "CORRECTA" and verdict == "INCOMPLETA":
        return 0.5
    return 0.0


def consolidate(judge_votes: list[dict[str, Any]], test: dict[str, Any]) -> dict[str, Any]:
    verdicts = [vote["verdict"] for vote in judge_votes if vote["verdict"] != "ERROR"]
    if not verdicts:
        verdict = "ERROR"
    else:
        verdict, count = Counter(verdicts).most_common(1)[0]
        if count < 2:
            verdict = "DISCREPA"
    return {
        "verdict": verdict,
        "score": score(verdict, test["expected"]),
        "raw": [vote["verdict"] for vote in judge_votes],
    }


def fleiss_kappa(vote_rows: list[list[str]]) -> float:
    categories = ["CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO", "ERROR"]
    rows = [row for row in vote_rows if row]
    if not rows:
        return 0.0
    n_raters = len(rows[0])
    if n_raters < 2:
        return 0.0
    p_i = []
    counts_all = Counter()
    for row in rows:
        counts = Counter(row)
        counts_all.update(row)
        p_i.append((sum(v * v for v in counts.values()) - n_raters) / (n_raters * (n_raters - 1)))
    p_bar = statistics.mean(p_i)
    total = len(rows) * n_raters
    p_e = sum((counts_all.get(cat, 0) / total) ** 2 for cat in categories)
    return round((p_bar - p_e) / (1 - p_e), 3) if p_e < 1 else 1.0


def bootstrap_ci(values: list[float], rounds: int = 2000) -> tuple[float, float]:
    if not values:
        return (0.0, 0.0)
    means = []
    for _ in range(rounds):
        sample = [random.choice(values) for _ in values]
        means.append(statistics.mean(sample))
    return (percentile(means, 0.025), percentile(means, 0.975))


def write_checkpoint(
    rows: list[dict[str, Any]], model_status: dict[str, dict[str, Any]], args: argparse.Namespace
) -> None:
    checkpoint = {
        "metadata": {
            "date": time.strftime("%Y-%m-%d"),
            "objective": "Checkpoint parcial del benchmark LLM <= 4 GB VRAM",
            "ollama_url": OLLAMA_URL,
            "num_ctx": args.num_ctx,
            "repetitions": args.repetitions,
            "vram_cap_gb": args.vram_cap_gb,
            "gen_temperature": GEN_TEMPERATURE,
            "judge_temperature": JUDGE_TEMPERATURE,
            "thinking": False,
            "partial": True,
        },
        "models": MODELS,
        "judges": JUDGES,
        "tests": TESTS,
        "model_status": model_status,
        "rows": rows,
        "summary": compute_summary(rows, model_status, args.vram_cap_gb, args.repetitions),
    }
    (ROOT / "results.partial.json").write_text(
        json.dumps(checkpoint, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def run_benchmark(args: argparse.Namespace) -> dict[str, Any]:
    validate_suite()
    preflight(args)
    ensure_models(args.pull_missing)

    all_rows: list[dict[str, Any]] = []
    model_status: dict[str, dict[str, Any]] = {}
    total_generation = len(MODELS) * len(TESTS) * args.repetitions
    total_judgements = total_generation * len(JUDGES)
    done_generation = 0
    done_judgements = 0

    seccion("Plan de ejecución")
    fila(
        "Generación",
        f"{len(MODELS)} modelos x {len(TESTS)} pruebas x {args.repetitions} reps = {total_generation}",
    )
    fila("Jueces", f"{total_judgements} veredictos")
    fila("Checkpoint", ROOT / "results.partial.json")

    for index, model in enumerate(MODELS, start=1):
        model_id = model["id"]
        seccion(f"Modelo {index}/{len(MODELS)} - {model_id}")
        fila("Familia", model["family"])
        fila("Peso publicado", f"{model['published_size_gb']} GB")
        fila("Motivo", model["reason"])
        fila("Contexto", args.num_ctx)

        status = {
            "ok": True,
            "error": "",
            "warmup": {},
            "max_vram_gb": 0.0,
            "processor": "",
            "context": "",
        }
        try:
            info("Warm-up", "cargando modelo y midiendo VRAM inicial")
            warmup = generate(model_id, "Responde solo OK.", args.num_ctx)
            status["warmup"] = {
                "total_ms": ms_from_ns(warmup, "total_duration"),
                "load_ms": ms_from_ns(warmup, "load_duration"),
            }
            ps = ps_entry(model_id)
            status["max_vram_gb"] = vram_gb_from_ps(ps)
            status["processor"] = str(ps.get("processor", ""))
            status["context"] = str(ps.get("context", ""))
            fila("VRAM inicial", f"{status['max_vram_gb']:.3f} GB")
            fila("Processor", status["processor"] or "desconocido")
            fila("Contexto Ollama", status["context"] or "desconocido")
        except Exception as exc:
            status["ok"] = False
            status["error"] = str(exc)
            model_status[model_id] = status
            error(f"{model_id} omitido: {enrich_ollama_error(str(exc))}")
            unload_model(model_id)
            write_checkpoint(all_rows, model_status, args)
            continue

        model_generated = 0
        model_errors = 0
        model_started = time.perf_counter()
        for test_index, test in enumerate(TESTS, start=1):
            info(
                f"Prueba {test_index}/{len(TESTS)}",
                f"{test['id']} ({test['category']}, {'adv' if test['adversarial'] else 'fácil'})",
            )
            prompt = PROMPT_TEMPLATE.format(context=test["context"], question=test["question"])
            for run in range(args.repetitions):
                row: dict[str, Any] = {
                    "model": model_id,
                    "test_id": test["id"],
                    "category": test["category"],
                    "difficulty": test["difficulty"],
                    "adversarial": test["adversarial"],
                    "run": run,
                    "expected": test["expected"],
                    "num_ctx": args.num_ctx,
                    "answer": "",
                    "thinking": "",
                    "error": "",
                    "tps": 0.0,
                    "ttft_ms": 0.0,
                    "total_ms": 0.0,
                    "words": 0,
                    "vram_gb": status["max_vram_gb"],
                    "processor": status["processor"],
                    "context_allocated": status["context"],
                    "judges": {},
                    "consolidated": {},
                }
                try:
                    generated = generate(model_id, prompt, args.num_ctx)
                    answer, thinking = clean_answer(generated)
                    ps = ps_entry(model_id)
                    vram = max(status["max_vram_gb"], vram_gb_from_ps(ps))
                    status["max_vram_gb"] = vram
                    row.update(
                        {
                            "answer": answer,
                            "thinking": thinking,
                            "tps": tokens_per_second(generated),
                            "ttft_ms": ms_from_ns(generated, "prompt_eval_duration"),
                            "total_ms": ms_from_ns(generated, "total_duration"),
                            "words": len(answer.split()),
                            "vram_gb": vram,
                            "processor": str(ps.get("processor", status["processor"])),
                            "context_allocated": str(ps.get("context", status["context"])),
                        }
                    )
                    model_generated += 1
                    done_generation += 1
                except Exception as exc:
                    row["error"] = enrich_ollama_error(str(exc))
                    model_errors += 1
                    error(
                        f"Generación fallida {model_id}/{test['id']}/run{run + 1}: {row['error']}"
                    )
                    all_rows.append(row)
                    continue

                judge_votes = []
                for judge_cfg in JUDGES:
                    try:
                        vote = judge(judge_cfg["id"], test, row["answer"])
                    except Exception as exc:
                        vote = {"verdict": "ERROR", "reason": enrich_ollama_error(str(exc))[:240]}
                    row["judges"][judge_cfg["id"]] = vote
                    judge_votes.append(vote)
                    done_judgements += 1
                row["consolidated"] = consolidate(judge_votes, test)
                all_rows.append(row)
                verdict = row["consolidated"].get("verdict", "ERROR")
                fila(
                    f"run {run + 1}/{args.repetitions}",
                    f"{verdict} | tps={row['tps']:.1f} | vram={row['vram_gb']:.2f}GB | gen {done_generation}/{total_generation} | judge {done_judgements}/{total_judgements}",
                )
        model_status[model_id] = status
        unload_model(model_id)
        write_checkpoint(all_rows, model_status, args)
        elapsed = (time.perf_counter() - model_started) / 60
        seccion_ok(
            f"Modelo completado: {model_id} | {model_generated} generaciones | errores={model_errors} | VRAM max={status['max_vram_gb']:.2f} GB | {elapsed:.1f} min"
        )

    result = {
        "metadata": {
            "date": time.strftime("%Y-%m-%d"),
            "objective": "Selección de LLM para Manualito con máximo 4 GB VRAM",
            "ollama_url": OLLAMA_URL,
            "num_ctx": args.num_ctx,
            "repetitions": args.repetitions,
            "vram_cap_gb": args.vram_cap_gb,
            "gen_temperature": GEN_TEMPERATURE,
            "judge_temperature": JUDGE_TEMPERATURE,
            "thinking": False,
        },
        "models": MODELS,
        "judges": JUDGES,
        "tests": TESTS,
        "model_status": model_status,
        "rows": all_rows,
        "summary": compute_summary(all_rows, model_status, args.vram_cap_gb, args.repetitions),
    }
    return result


def compute_summary(
    rows: list[dict[str, Any]],
    model_status: dict[str, dict[str, Any]],
    vram_cap_gb: float,
    repetitions: int,
) -> list[dict[str, Any]]:
    by_model: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_model[row["model"]].append(row)

    out = []
    for model in MODELS:
        model_id = model["id"]
        items = by_model.get(model_id, [])
        judged = [r for r in items if r.get("consolidated")]
        generated = [r for r in items if r.get("answer")]
        easy = [r["consolidated"]["score"] for r in judged if not r["adversarial"]]
        adversarial = [r["consolidated"]["score"] for r in judged if r["adversarial"]]
        all_scores = [r["consolidated"]["score"] for r in judged]
        difficult = [r["consolidated"]["score"] for r in judged if r["difficulty"] == "difícil"]
        vote_rows = [r["consolidated"].get("raw", []) for r in judged]
        by_test: dict[str, list[str]] = defaultdict(list)
        for r in judged:
            by_test[r["test_id"]].append(r["consolidated"]["verdict"])
        stable = 0.0
        if by_test:
            stable = sum(1 for votes in by_test.values() if len(set(votes)) == 1) / len(by_test)
        max_vram = max(
            [float(r.get("vram_gb") or 0.0) for r in generated]
            + [float(model_status.get(model_id, {}).get("max_vram_gb") or 0.0)]
        )
        viable = (
            bool(generated)
            and max_vram <= vram_cap_gb
            and not model_status.get(model_id, {}).get("error")
        )
        easy_ci = bootstrap_ci(easy) if easy else (0.0, 0.0)
        adv_ci = bootstrap_ci(adversarial) if adversarial else (0.0, 0.0)
        out.append(
            {
                "model": model_id,
                "label": model["label"],
                "family": model["family"],
                "published_size_gb": model["published_size_gb"],
                "generated": len(generated),
                "expected_generations": len(TESTS) * repetitions,
                "errors": sum(1 for r in items if r.get("error")),
                "max_vram_gb": round(max_vram, 3),
                "viable_4gb": viable,
                "processor": most_common([str(r.get("processor", "")) for r in generated]),
                "context_allocated": most_common(
                    [str(r.get("context_allocated", "")) for r in generated]
                ),
                "fidelity_easy": round(statistics.mean(easy), 3) if easy else 0.0,
                "fidelity_easy_ci95": easy_ci,
                "fidelity_adversarial": round(statistics.mean(adversarial), 3)
                if adversarial
                else 0.0,
                "fidelity_adversarial_ci95": adv_ci,
                "fidelity_global": round(statistics.mean(all_scores), 3) if all_scores else 0.0,
                "fidelity_difficult": round(statistics.mean(difficult), 3) if difficult else 0.0,
                "hallucinations": sum(
                    1 for r in judged if r["consolidated"]["verdict"] == "ALUCINADA"
                ),
                "language_ko": sum(
                    1 for r in judged if r["consolidated"]["verdict"] == "IDIOMA_INCORRECTO"
                ),
                "disagreements": sum(
                    1 for r in judged if r["consolidated"]["verdict"] == "DISCREPA"
                ),
                "stability": round(stable, 3),
                "judge_unanimity": round(
                    sum(1 for row in vote_rows if len(set(row)) == 1) / len(vote_rows), 3
                )
                if vote_rows
                else 0.0,
                "fleiss_kappa": fleiss_kappa(vote_rows),
                "median_tps": median([float(r["tps"]) for r in generated]),
                "ttft_p50_ms": median([float(r["ttft_ms"]) for r in generated]),
                "total_p95_ms": percentile([float(r["total_ms"]) for r in generated], 0.95),
                "median_words": median([float(r["words"]) for r in generated]),
            }
        )
    return sorted(
        out,
        key=lambda x: (
            not x["viable_4gb"],
            -x["fidelity_adversarial"],
            -x["fidelity_easy"],
            x["hallucinations"],
            -x["median_tps"],
            x["max_vram_gb"],
        ),
    )


def most_common(values: list[str]) -> str:
    cleaned = [v for v in values if v]
    return Counter(cleaned).most_common(1)[0][0] if cleaned else ""


def write_results(result: dict[str, Any], path: Path) -> None:
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    from types import SimpleNamespace

    args = SimpleNamespace(
        pull_missing=True,
        repetitions=DEFAULT_REPETITIONS,
        num_ctx=DEFAULT_NUM_CTX,
        vram_cap_gb=VRAM_CAP_GB,
        results=Path("results.json"),
    )
    result = run_benchmark(args)
    write_results(result, Path("results.json"))
    info("Benchmark terminado.")
    info("Datos guardados en:", "results.json")
