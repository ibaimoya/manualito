"""Mide respuestas de LLM mediante el protocolo histórico de Manualito.

La suite conserva generación, jueces y métricas del notebook original. Solo
escribe los datos crudos de la ejecución en el directorio nuevo indicado.
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
    benchmarks_root = script_path.resolve().parents[3]
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
        "Mide la suite histórica de LLM de Manualito.", Path(__file__)
    )
    import httpx

import json
import statistics
import time
import warnings

warnings.filterwarnings("ignore")

# ── Formato de salida con colores ANSI ──────────────────────────────────
_ESC = chr(27)
_Y = f"{_ESC}[33m"  # amarillo
_C = f"{_ESC}[36m"  # cian
_R = f"{_ESC}[31m"  # rojo
_G = f"{_ESC}[32m"  # verde
_0 = f"{_ESC}[0m"  # reset


OLLAMA_URL = "http://localhost:11434"
TIMEOUT = 300.0  # algunos modelos tardan en generar 256 tokens

# ── 8 modelos evaluados ─────────────────────────────────────────────────
# Paleta Catppuccin Mocha: Llama comparte familia cromática (tonos azul/lavanda)
# para agrupar visualmente las 4 variantes cuantizadas del mismo modelo base.
MODELOS = [
    {
        "id": "llama3.1:8b-instruct-q4_K_M",
        "nombre": "llama3.1:8b-Q4",
        "etiqueta": "llama3.1\n8B-Q4",
        "descripcion": "Meta Llama 3.1 Instruct Q4_K_M (~4.9 GB), baseline",
        "color": "#89b4fa",  # Blue
    },
    {
        "id": "llama3.1:8b-instruct-q5_K_M",
        "nombre": "llama3.1:8b-Q5",
        "etiqueta": "llama3.1\n8B-Q5",
        "descripcion": "Meta Llama 3.1 Instruct Q5_K_M (~5.7 GB), punto intermedio",
        "color": "#74c7ec",  # Sapphire
    },
    {
        "id": "llama3.1:8b-instruct-q6_K",
        "nombre": "llama3.1:8b-Q6",
        "etiqueta": "llama3.1\n8B-Q6",
        "descripcion": "Meta Llama 3.1 Instruct Q6_K (~6.6 GB), cerca del fp16",
        "color": "#89dceb",  # Sky
    },
    {
        "id": "llama3.1:8b-instruct-q8_0",
        "nombre": "llama3.1:8b-Q8",
        "etiqueta": "llama3.1\n8B-Q8",
        "descripcion": "Meta Llama 3.1 Instruct Q8_0 (~8.5 GB), techo de calidad en 8B",
        "color": "#b4befe",  # Lavender
    },
    {
        "id": "gemma4:e4b",
        "nombre": "gemma4:e4b",
        "etiqueta": "gemma4\ne4B",
        "descripcion": "Google Gemma 4 MoE (~9.6 GB)",
        "color": "#fab387",  # Peach
    },
    {
        "id": "gemma3:12b",
        "nombre": "gemma3:12b",
        "etiqueta": "gemma3\n12B",
        "descripcion": "Google Gemma 3 12B denso (~8.1 GB)",
        "color": "#a6e3a1",  # Green
    },
    {
        "id": "phi4:14b",
        "nombre": "phi4:14b",
        "etiqueta": "phi4\n14B",
        "descripcion": "Microsoft Phi 4 (~9.1 GB)",
        "color": "#f38ba8",  # Red
    },
    {
        "id": "qwen3:14b",
        "nombre": "qwen3:14b",
        "etiqueta": "qwen3\n14B",
        "descripcion": "Alibaba Qwen 3 (~9.3 GB)",
        "color": "#cba6f7",  # Mauve
    },
]

# ── 2 jueces externos (ambos de familias distintas a todos los evaluados) ──
# Ninguno aparece en MODELOS → eliminamos el sesgo de auto-juicio por diseño.
JUECES = [
    {"id": "mistral-nemo:12b", "nombre": "mistral-nemo:12b", "color": "#f9e2af"},  # Yellow
    {"id": "aya-expanse:8b", "nombre": "aya-expanse:8b", "color": "#94e2d5"},  # Teal
]

# ── Repeticiones por prueba (mide consistencia con temperature=0.1) ────
N_REPETICIONES = 3

# ── Plantilla de prompt RAG ─────────────────────────────────────────────
PROMPT_TEMPLATE = """Eres un asistente que responde preguntas sobre manuales de juegos de mesa. Usa EXCLUSIVAMENTE la información del contexto. Si la respuesta no aparece en el contexto, responde literalmente "No aparece en el manual." Responde siempre en español, de forma breve.

Contexto:
{contexto}

Pregunta:
{pregunta}

Respuesta:"""

# ── 18 pruebas, 9 categorías, 10 fáciles + 8 adversariales ───────────
# El `veredicto_esperado` se compara contra la salida del juez; no hay keywords.
# `es_adversarial` divide la fidelidad final en dos métricas.
PRUEBAS = [
    # ════════════════════════════════════════════════════════════════════
    # GRUPO A, 10 pruebas "fáciles" heredadas del benchmark v1
    # ════════════════════════════════════════════════════════════════════
    # FACTUAL (2), extraer un dato del contexto
    {
        "id": "factual_jugadores",
        "categoria": "factual",
        "es_adversarial": False,
        "pregunta": "¿Cuántos jugadores pueden jugar a Catan?",
        "contexto": "Catan es un juego de mesa para 3 o 4 jugadores. Con la expansión 5-6 jugadores puede ampliarse hasta seis participantes.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "factual_duracion",
        "categoria": "factual",
        "es_adversarial": False,
        "pregunta": "¿Cuánto dura aproximadamente una partida de Azul?",
        "contexto": "Azul es un juego para 2 a 4 jugadores. Una partida típica dura entre 30 y 45 minutos. El objetivo es decorar el palacio real.",
        "veredicto_esperado": "CORRECTA",
    },
    # MULTI_FACT (2), composición de varios datos del contexto
    {
        "id": "multi_recursos_poblado",
        "categoria": "multi_fact",
        "es_adversarial": False,
        "pregunta": "¿Qué recursos necesito para construir un poblado?",
        "contexto": "Para construir un poblado necesitas una madera, una arcilla, una lana y un trigo. Para una ciudad necesitas dos trigos y tres minerales.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "multi_ladron",
        "categoria": "multi_fact",
        "es_adversarial": False,
        "pregunta": "¿Cuándo se activa el ladrón y qué efecto tiene?",
        "contexto": "El ladrón se activa cuando un jugador saca un 7 con los dados o cuando se usa una carta de caballero. Al moverlo, el hexágono donde se coloca deja de producir recursos y el jugador puede robar una carta a un rival con poblado o ciudad adyacente.",
        "veredicto_esperado": "CORRECTA",
    },
    # PLANTED_FACT (2), contexto contradice el mundo real; el juez acepta el contexto
    {
        "id": "planted_puntos_8",
        "categoria": "planted_fact",
        "es_adversarial": False,
        "pregunta": "¿Con cuántos puntos de victoria se gana la partida?",
        "contexto": "La partida de Catan termina cuando un jugador alcanza 8 puntos de victoria al comenzar su turno.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "planted_ciudad_5_minerales",
        "categoria": "planted_fact",
        "es_adversarial": False,
        "pregunta": "¿Qué recursos necesito para construir una ciudad?",
        "contexto": "Para construir una ciudad en Catan necesitas cinco minerales y un trigo. La ciudad reemplaza a un poblado existente.",
        "veredicto_esperado": "CORRECTA",
    },
    # FUERA_CONTEXTO (2), contexto no cubre la pregunta → debe rechazar
    {
        "id": "fuera_mundial",
        "categoria": "fuera_contexto",
        "es_adversarial": False,
        "pregunta": "¿Quién ganó el mundial de fútbol de 2022?",
        "contexto": "Catan es un juego de mesa para 3 o 4 jugadores. El objetivo es alcanzar 10 puntos de victoria.",
        "veredicto_esperado": "RECHAZO",
    },
    {
        "id": "fuera_capital",
        "categoria": "fuera_contexto",
        "es_adversarial": False,
        "pregunta": "¿Cuál es la capital de Alemania?",
        "contexto": "Azul es un juego para 2 a 4 jugadores. Los jugadores colocan azulejos en su tablero personal para decorar el palacio.",
        "veredicto_esperado": "RECHAZO",
    },
    # DISTRACTOR (2), contexto con info relevante + ruido
    {
        "id": "distractor_comercio",
        "categoria": "distractor",
        "es_adversarial": False,
        "pregunta": "¿Cuándo puedo comerciar con otros jugadores?",
        "contexto": "En Catan el turno se compone de tres fases: tirada de dados, comercio e intercambios, y construcción. El comercio solo se permite durante tu propio turno. Al inicio del juego cada jugador recibe dos poblados y dos carreteras. El tablero se forma con 19 hexágonos.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "distractor_muralla",
        "categoria": "distractor",
        "es_adversarial": False,
        "pregunta": "¿Cuánto cuesta construir una muralla?",
        "contexto": "En la expansión Ciudades y Caballeros, la muralla cuesta dos arcillas y protege a la ciudad del ataque bárbaro. Las cartas de progreso se obtienen con minerales, lana y trigo. Los caballeros cuestan una lana y un mineral y se activan con un trigo. Solo se pueden construir murallas en ciudades, no en poblados.",
        "veredicto_esperado": "CORRECTA",
    },
    # ════════════════════════════════════════════════════════════════════
    # GRUPO B, 8 pruebas adversariales nuevas (el objetivo es discriminar)
    # ════════════════════════════════════════════════════════════════════
    # CONTRADICCION (2), el contexto contiene dos reglas incompatibles
    {
        "id": "contra_ladron_turnos",
        "categoria": "contradiccion",
        "es_adversarial": True,
        "pregunta": "¿Cuándo actúa exactamente el ladrón?",
        "contexto": "En Catan el ladrón actúa de forma inmediata cuando un jugador saca un 7 con los dados: se mueve y bloquea un hexágono al instante.\n\nCada jugador juega en el sentido horario. El ladrón, sin embargo, se activa solo al final del turno del jugador activo, momento en el que se mueve a un nuevo hexágono.\n\nEl tablero se compone de 19 hexágonos de recursos.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "contra_jugadores_max",
        "categoria": "contradiccion",
        "es_adversarial": True,
        "pregunta": "¿Cuántos jugadores máximo pueden jugar?",
        "contexto": "Catan es un juego para 3 o 4 jugadores. El tablero se forma con hexágonos de recursos.\n\nEn la expansión incluida en esta misma caja, se añaden piezas para permitir que jueguen hasta 6 participantes sin alterar el resto de las reglas.\n\nLos jugadores compiten por ser los primeros en alcanzar 10 puntos de victoria.",
        "veredicto_esperado": "CORRECTA",
    },
    # COMPOSICION (2), aplicar varias reglas en secuencia / razonar multi-paso
    {
        "id": "comp_9_cartas_7",
        "categoria": "composicion",
        "es_adversarial": True,
        "pregunta": "Si el jugador activo saca un 7 y otro jugador de la mesa tiene 9 cartas en la mano, ¿qué ocurre con ese jugador?",
        "contexto": "En Catan, cuando el jugador activo saca un 7 con los dados al inicio de su turno, ocurren dos cosas en este orden:\n1. Todos los jugadores que tengan más de 7 cartas en la mano deben descartar la mitad (redondeando hacia abajo).\n2. El jugador activo mueve el ladrón a cualquier hexágono y puede robar una carta aleatoria a un rival adyacente.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "comp_ciudad_desde_cero",
        "categoria": "composicion",
        "es_adversarial": True,
        "pregunta": "¿Cuántos recursos necesito en total para tener una ciudad construida, partiendo desde cero y sin poblado previo?",
        "contexto": "En Catan hay dos construcciones jerárquicas:\n- Un poblado cuesta 1 madera, 1 ladrillo, 1 lana y 1 trigo.\n- Una ciudad sustituye a un poblado existente y cuesta 2 trigos y 3 minerales. No se puede construir una ciudad sin un poblado previo en la misma intersección.",
        "veredicto_esperado": "CORRECTA",
    },
    # INFO_PARCIAL (2), parte de la pregunta está en el contexto, parte no
    {
        "id": "parcial_coste_puerto",
        "categoria": "info_parcial",
        "es_adversarial": True,
        "pregunta": "¿Qué coste tienen los puertos 3:1 y 2:1?",
        "contexto": "En Catan hay puertos en los bordes del tablero. El puerto 2:1 (específico) permite cambiar 2 unidades del recurso indicado por 1 recurso cualquiera. Solo está disponible para el jugador que tenga un poblado o ciudad tocando ese puerto; no tiene coste adicional.",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "parcial_fin_azul",
        "categoria": "info_parcial",
        "es_adversarial": True,
        "pregunta": "¿Cómo se puntúa el final de Azul y cuánto dura una partida típica?",
        "contexto": "Azul termina cuando un jugador completa una fila horizontal de azulejos en su tablero personal. Se hace un recuento final en el que cada fila completa añade 2 puntos extra, cada columna completa 7 puntos, y cada conjunto de 5 colores iguales 10 puntos. El jugador con más puntos gana.",
        "veredicto_esperado": "CORRECTA",
    },
    # NUMERO_TRAMPA (2), aritmética simple sobre reglas del contexto
    {
        "id": "num_2_carreteras_1_ciudad",
        "categoria": "numero_trampa",
        "es_adversarial": True,
        "pregunta": "¿Cuántos recursos en total necesito para construir 2 carreteras y 1 ciudad (sin contar el poblado previo de la ciudad)?",
        "contexto": "En Catan los costes de construcción son:\n- Carretera: 1 madera + 1 ladrillo.\n- Poblado: 1 madera + 1 ladrillo + 1 lana + 1 trigo.\n- Ciudad: 2 trigos + 3 minerales (sustituye un poblado existente).",
        "veredicto_esperado": "CORRECTA",
    },
    {
        "id": "num_3_poblados_2_desarrollo",
        "categoria": "numero_trampa",
        "es_adversarial": True,
        "pregunta": "¿Cuántos recursos en total para construir 3 poblados y comprar 2 cartas de desarrollo?",
        "contexto": "Costes en Catan:\n- Poblado: 1 madera + 1 ladrillo + 1 lana + 1 trigo.\n- Carta de desarrollo: 1 lana + 1 trigo + 1 mineral.",
        "veredicto_esperado": "CORRECTA",
    },
]

PRUEBAS_POR_ID = {p["id"]: p for p in PRUEBAS}

n_faciles = sum(1 for p in PRUEBAS if not p["es_adversarial"])
n_advers = sum(1 for p in PRUEBAS if p["es_adversarial"])
print(
    f"Configuración lista, {len(MODELOS)} modelos, {len(PRUEBAS)} pruebas "
    f"({n_faciles} fáciles + {n_advers} adversariales), "
    f"{N_REPETICIONES} runs/prueba, {len(JUECES)} jueces: "
    + ", ".join(j["nombre"] for j in JUECES)
    + "."
)


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
    info("→ ollama pull (puede tardar varios minutos):", modelo)
    try:
        with httpx.stream(
            "POST",
            f"{OLLAMA_URL}/api/pull",
            json={"name": modelo, "stream": True},
            timeout=None,
        ) as resp:
            resp.raise_for_status()
            ultimo_status = ""
            for linea in resp.iter_lines():
                if not linea:
                    continue
                try:
                    ev = json.loads(linea)
                except json.JSONDecodeError:
                    continue
                status = ev.get("status", "")
                if status and status != ultimo_status:
                    print(f"    {status}")
                    ultimo_status = status
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
    """Llamada bloqueante a /api/generate. Devuelve el JSON completo con métricas."""
    payload = {
        "model": modelo,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 256},
    }
    r = httpx.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def tokens_por_segundo(data: dict) -> float:
    eval_count = data.get("eval_count", 0)
    eval_duration_ns = data.get("eval_duration", 0)
    if not eval_duration_ns:
        return 0.0
    return round(eval_count / (eval_duration_ns / 1e9), 2)


def ttft_ms(data: dict) -> float:
    """Tiempo de procesado del prompt (aprox. Time To First Token, ms)."""
    return round(data.get("prompt_eval_duration", 0) / 1e6, 1)


# ── LLM-as-judge ────────────────────────────────────────────────────────
# Cinco categorías de veredicto. IDIOMA_INCORRECTO actúa como precondición:
# si la respuesta no está en español natural, el contenido no se evalúa.
PROMPT_JUEZ = """Eres un evaluador imparcial. Evalúa la respuesta de un asistente RAG sobre manuales de juegos de mesa.

REGLA CRÍTICA: juzga basándote EXCLUSIVAMENTE en el contexto proporcionado. Ignora tu conocimiento del mundo. Si el contexto dice que Catan se gana con 8 puntos, eso es la verdad para esta evaluación.

PRECONDICIÓN DE IDIOMA: antes de evaluar el contenido, comprueba que la respuesta está en español natural. Marca IDIOMA_INCORRECTO si CUALQUIERA de:
 - La respuesta está total o mayoritariamente en otro idioma que no sea español.
 - Más del 20 % de las palabras son inglés (sin contar nombres propios ni siglas técnicas inevitables).
 - Hay code-switching sistemático con anglicismos claros ("hacer click", "el setup inicial", "el pool de cartas", "rankear", "tip", "mood").
 - La sintaxis es manifiestamente calcada del inglés (orden de palabra rígido, ausencia de subjuntivo donde el español lo exige, calcos estructurales como "tomar una decisión por hacer X").
Errores menores aislados (un anglicismo suelto, una concordancia rota puntual) NO bastan para marcar IDIOMA_INCORRECTO. Evalúa el contenido normalmente.

En preguntas con varias partes, acepta como CORRECTA una respuesta que conteste la parte que SÍ aparece en el contexto y declare explícitamente que la otra parte no aparece. Si inventa datos para la parte que no aparece, es ALUCINADA.

En preguntas aritméticas, la suma debe cuadrar con los costes del contexto para ser CORRECTA.

Clasifica la respuesta en una de estas categorías:
- IDIOMA_INCORRECTO: la respuesta no está en español natural (ver precondición arriba). Prevalece sobre el resto.
- CORRECTA: usa solo información del contexto y responde acertadamente a la pregunta.
- INCOMPLETA: información del contexto pero faltan datos clave para responder por completo.
- ALUCINADA: contiene información que NO está en el contexto (inventa o usa conocimiento externo).
- RECHAZO: indica que no puede responder o que la información no está disponible.

Pregunta: {pregunta}

Contexto:
{contexto}

Respuesta del asistente:
{respuesta}

Devuelve SOLO este JSON, sin texto adicional:
{{"veredicto": "IDIOMA_INCORRECTO | CORRECTA | INCOMPLETA | ALUCINADA | RECHAZO", "razon": "breve justificación de una frase"}}"""


VEREDICTOS_VALIDOS = {"CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO"}


def evaluar_con_juez(juez_id: str, pregunta: str, contexto: str, respuesta: str) -> dict:
    """Llama al juez con temperatura 0 (Zheng et al. 2023) y parsea el JSON."""
    prompt = PROMPT_JUEZ.format(pregunta=pregunta, contexto=contexto, respuesta=respuesta)
    payload = {
        "model": juez_id,
        "prompt": prompt,
        "stream": False,
        "format": "json",  # Ollama fuerza salida JSON válida
        "options": {"temperature": 0.0, "num_predict": 160},
    }
    try:
        r = httpx.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=TIMEOUT)
        r.raise_for_status()
        raw = r.json().get("response", "{}")
        parsed = json.loads(raw)
        veredicto = str(parsed.get("veredicto", "")).upper().strip()
        # Algunos modelos devuelven "CORRECTA | INCOMPLETA..." literal → quedarse con el primero
        if "|" in veredicto:
            veredicto = veredicto.split("|")[0].strip()
        if veredicto not in VEREDICTOS_VALIDOS:
            return {"veredicto": "ERROR", "razon": f"veredicto desconocido: {veredicto!r}"}
        return {"veredicto": veredicto, "razon": str(parsed.get("razon", ""))}
    except json.JSONDecodeError as err:
        return {"veredicto": "ERROR", "razon": f"JSON mal formado: {err}"}
    except Exception as err:
        return {"veredicto": "ERROR", "razon": f"{type(err).__name__}: {err}"}


def puntuar(veredicto: str, esperado: str) -> float:
    """Nota 0-1.

    - IDIOMA_INCORRECTO: 0.0 (fallo crítico, prevalece sobre cualquier acierto).
    - DISCREPA: 0.5 (los jueces no se ponen de acuerdo).
    - veredicto == esperado: 1.0.
    - INCOMPLETA cuando se esperaba CORRECTA: 0.5.
    - resto: 0.0.
    """
    if veredicto == "IDIOMA_INCORRECTO":
        return 0.0
    if veredicto == "DISCREPA":
        return 0.5
    if veredicto == esperado:
        return 1.0
    if esperado == "CORRECTA" and veredicto == "INCOMPLETA":
        return 0.5
    return 0.0


def consolidar_veredictos(vs_a: list[dict], vs_b: list[dict]) -> list[dict]:
    """Combina los veredictos de dos jueces en uno consolidado.

    - Si ambos coinciden → veredicto final = ese (incluido IDIOMA_INCORRECTO por consenso).
    - Si uno es ERROR → usar el otro.
    - Si discrepan → veredicto "DISCREPA" con ambos originales en "raw".
    """
    assert len(vs_a) == len(vs_b), "Listas de jueces con tamaño distinto"
    out = []
    for a, b in zip(vs_a, vs_b):
        if a["veredicto"] == "ERROR" and b["veredicto"] == "ERROR":
            veredicto = "ERROR"
        elif a["veredicto"] == "ERROR":
            veredicto = b["veredicto"]
        elif b["veredicto"] == "ERROR":
            veredicto = a["veredicto"]
        elif a["veredicto"] == b["veredicto"]:
            veredicto = a["veredicto"]
        else:
            veredicto = "DISCREPA"
        out.append(
            {
                "prueba_id": a["prueba_id"],
                "categoria": a["categoria"],
                "es_adversarial": a.get("es_adversarial", False),
                "run": a["run"],
                "esperado": a["esperado"],
                "veredicto": veredicto,
                "nota": puntuar(veredicto, a["esperado"]),
                "raw": {"a": a["veredicto"], "b": b["veredicto"]},
            }
        )
    return out


def kappa_cohen(vs_a: list[dict], vs_b: list[dict]) -> float:
    """κ de Cohen (1960) entre dos jueces sobre las mismas respuestas.

    κ = (p_o - p_e) / (1 - p_e)
      p_o = fracción de acuerdo observada
      p_e = acuerdo esperado por azar, dadas las marginales de cada juez
    """
    assert len(vs_a) == len(vs_b)
    categorias = ["CORRECTA", "INCOMPLETA", "ALUCINADA", "RECHAZO", "IDIOMA_INCORRECTO", "ERROR"]
    n = len(vs_a)
    if n == 0:
        return 0.0
    # Acuerdo observado
    coincidencias = sum(1 for a, b in zip(vs_a, vs_b) if a["veredicto"] == b["veredicto"])
    p_o = coincidencias / n
    # Acuerdo esperado: producto de marginales
    p_e = 0.0
    for c in categorias:
        p_a = sum(1 for a in vs_a if a["veredicto"] == c) / n
        p_b = sum(1 for b in vs_b if b["veredicto"] == c) / n
        p_e += p_a * p_b
    if p_e >= 1.0:
        return 1.0
    return round((p_o - p_e) / (1 - p_e), 3)


info("Funciones auxiliares definidas.")


if __name__ == "__main__":
    # ── Hardware detectado (declarado estáticamente; Ollama no expone GPU por API) ──
    HARDWARE = {
        "gpu": "NVIDIA GeForce RTX 4070 SUPER",
        "vram_total_gb": 12.0,
    }

    # ── Auto-pull de los modelos que falten ─────────────────────────────────
    disponibles = modelos_instalados()
    info("Modelos ya instalados en Ollama:")
    for m in disponibles:
        print(f"  - {m}")

    necesarios = [cfg["id"] for cfg in MODELOS] + [j["id"] for j in JUECES]
    faltan = [m for m in necesarios if m not in disponibles]
    if faltan:
        info("Faltan modelos; descargando automáticamente:", str(len(faltan)))
        for m in faltan:
            ok = pull_modelo(m)
            if not ok:
                raise RuntimeError(
                    f"No se pudo descargar {m}. Revisa conexión/espacio en disco "
                    f"y ejecuta manualmente `ollama pull {m}`."
                )
        disponibles = modelos_instalados()
        info("Descargas completadas.")

    # ── PASADA 1: generación ──────────────────────────────────────────────
    respuestas_por_modelo: dict[str, list[dict]] = {}
    info_por_modelo: dict[str, dict] = {}

    for cfg in MODELOS:
        sep = "=" * 64
        print(f"\n{sep}")
        info(f"  [GEN] {cfg['nombre']}")
        info(f"        {cfg['descripcion']}")
        print(sep)

        if cfg["id"] not in disponibles:
            error(f"SALTADO - modelo {cfg['id']} no instalado.")
            continue

        try:
            t0 = time.perf_counter()
            generar(cfg["id"], "Hola.")
            carga_s = round(time.perf_counter() - t0, 2)
        except Exception as err:
            error(f"SALTADO - error en warm-up: {err}")
            continue

        vram = vram_en_uso_gb(cfg["id"])
        info("  Cargado:", f"{carga_s} s | VRAM en uso: {vram} GB")

        respuestas: list[dict] = []
        for p in PRUEBAS:
            prompt = PROMPT_TEMPLATE.format(contexto=p["contexto"], pregunta=p["pregunta"])
            runs_ok = 0
            tps_sum = 0.0
            for run in range(N_REPETICIONES):
                try:
                    data = generar(cfg["id"], prompt)
                except Exception as err:
                    error(f"[{p['id']:28} r{run}] {err}")
                    continue
                respuesta = data.get("response", "").strip()
                tps = tokens_por_segundo(data)
                respuestas.append(
                    {
                        "prueba_id": p["id"],
                        "categoria": p["categoria"],
                        "es_adversarial": p["es_adversarial"],
                        "run": run,
                        "respuesta": respuesta,
                        "tps": tps,
                        "ttft": ttft_ms(data),
                    }
                )
                runs_ok += 1
                tps_sum += tps
            tps_avg = tps_sum / runs_ok if runs_ok else 0.0
            tag_adv = "A" if p["es_adversarial"] else "F"
            print(
                f"    [{tag_adv}|{p['id']:28}] {runs_ok}/{N_REPETICIONES} runs OK, tps~{tps_avg:.1f}"
            )

        respuestas_por_modelo[cfg["nombre"]] = respuestas
        info_por_modelo[cfg["nombre"]] = {"carga_s": carga_s, "vram_gb": vram, "cfg": cfg}
        descargar_modelo(cfg["id"])

    # ── PASADAS 2 y 3: evaluación por los dos jueces ─────────────────────
    veredictos_por_modelo_juez: dict[str, dict[str, list[dict]]] = {
        nombre: {} for nombre in respuestas_por_modelo
    }

    for juez in JUECES:
        sep = "=" * 64
        print(f"\n{sep}")
        info(f"  [JUEZ] {juez['nombre']}")
        print(sep)

        if juez["id"] not in disponibles:
            error(f"AVISO - juez {juez['id']} no instalado; saltado.")
            continue

        try:
            generar(juez["id"], "Hola.")
        except Exception as err:
            error(f"WARM-UP juez falló: {err}")

        for nombre, respuestas in respuestas_por_modelo.items():
            info(f"  Evaluando {nombre}:", f"{len(respuestas)} respuestas")
            veredictos: list[dict] = []
            for i, r in enumerate(respuestas, 1):
                prueba = PRUEBAS_POR_ID[r["prueba_id"]]
                v = evaluar_con_juez(
                    juez["id"], prueba["pregunta"], prueba["contexto"], r["respuesta"]
                )
                v["nota"] = puntuar(v["veredicto"], prueba["veredicto_esperado"])
                v["prueba_id"] = r["prueba_id"]
                v["categoria"] = r["categoria"]
                v["es_adversarial"] = r["es_adversarial"]
                v["run"] = r["run"]
                v["esperado"] = prueba["veredicto_esperado"]
                veredictos.append(v)
                if i % 20 == 0:
                    print(f"    {i}/{len(respuestas)}...")
            veredictos_por_modelo_juez[nombre][juez["nombre"]] = veredictos

        descargar_modelo(juez["id"])

    # ── Consolidación entre jueces + κ de Cohen ─────────────────────────
    consolidados_por_modelo: dict[str, list[dict]] = {}
    acuerdo_por_modelo: dict[str, float] = {}
    juez_a = JUECES[0]["nombre"]
    juez_b = JUECES[1]["nombre"]

    for nombre, por_juez in veredictos_por_modelo_juez.items():
        vs_a = por_juez.get(juez_a, [])
        vs_b = por_juez.get(juez_b, [])
        if not vs_a or not vs_b:
            consolidados_por_modelo[nombre] = []
            acuerdo_por_modelo[nombre] = 0.0
            continue
        consolidados = consolidar_veredictos(vs_a, vs_b)
        consolidados_por_modelo[nombre] = consolidados
        coinciden = sum(1 for a, b in zip(vs_a, vs_b) if a["veredicto"] == b["veredicto"])
        acuerdo_por_modelo[nombre] = round(coinciden / len(vs_a), 3)

    # κ global sobre todas las respuestas juntadas
    global_a = [
        v for n in veredictos_por_modelo_juez for v in veredictos_por_modelo_juez[n].get(juez_a, [])
    ]
    global_b = [
        v for n in veredictos_por_modelo_juez for v in veredictos_por_modelo_juez[n].get(juez_b, [])
    ]
    kappa_global = kappa_cohen(global_a, global_b) if global_a and global_b else 0.0
    acuerdo_global = (
        round(
            sum(1 for a, b in zip(global_a, global_b) if a["veredicto"] == b["veredicto"])
            / max(1, len(global_a)),
            3,
        )
        if global_a
        else 0.0
    )

    sep = "=" * 64
    print(f"\n{sep}")
    info("  ACUERDO INTER-JUEZ GLOBAL")
    print(sep)
    info("  % acuerdo:", f"{acuerdo_global:.3f}")
    info("  κ Cohen:  ", f"{kappa_global:.3f}   (>0.61 sustancial, >0.81 casi perfecto)")

    # ── Guardar crudos en results.json ──────────────────────────────────
    with open("results.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "hardware": HARDWARE,
                "modelos": [cfg["nombre"] for cfg in MODELOS],
                "jueces": [j["nombre"] for j in JUECES],
                "n_repeticiones": N_REPETICIONES,
                "pruebas": [
                    {
                        k: p[k]
                        for k in (
                            "id",
                            "categoria",
                            "es_adversarial",
                            "pregunta",
                            "contexto",
                            "veredicto_esperado",
                        )
                    }
                    for p in PRUEBAS
                ],
                "info": {
                    n: {k: v for k, v in inf.items() if k != "cfg"}
                    for n, inf in info_por_modelo.items()
                },
                "respuestas": respuestas_por_modelo,
                "veredictos": veredictos_por_modelo_juez,
                "consolidados": consolidados_por_modelo,
                "acuerdo_inter_juez": {
                    "por_modelo": acuerdo_por_modelo,
                    "global": acuerdo_global,
                    "kappa": kappa_global,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    info("Crudos guardados en:", "results.json")

    # ── Agregación por modelo (consume consolidados) ────────────────────
    def subset_notas(cons: list[dict], es_adv: bool) -> float:
        sub = [v for v in cons if v["es_adversarial"] == es_adv]
        if not sub:
            return 0.0
        return round(sum(v["nota"] for v in sub) / len(sub), 3)

    def rechazos_correctos(cons: list[dict]) -> str:
        sub = [v for v in cons if v["esperado"] == "RECHAZO"]
        if not sub:
            return "0/0"
        ok = sum(1 for v in sub if v["veredicto"] == "RECHAZO")
        return f"{ok}/{len(sub)}"

    def idioma_ko_consenso(cons: list[dict]) -> int:
        """Nº de respuestas marcadas IDIOMA_INCORRECTO por consenso de los dos jueces."""
        return sum(1 for v in cons if v["veredicto"] == "IDIOMA_INCORRECTO")

    def idioma_ko_alguno(modelo_nombre: str) -> int:
        """Nº de respuestas donde al menos UNO de los dos jueces marcó IDIOMA_INCORRECTO.

        Conteo conservador: si solo un juez lo flaggea, el consenso queda en DISCREPA
        pero el aviso de idioma sigue siendo relevante para la lectura humana.
        """
        por_juez = veredictos_por_modelo_juez.get(modelo_nombre, {})
        vs_a = por_juez.get(juez_a, [])
        vs_b = por_juez.get(juez_b, [])
        return sum(
            1
            for a, b in zip(vs_a, vs_b)
            if a["veredicto"] == "IDIOMA_INCORRECTO" or b["veredicto"] == "IDIOMA_INCORRECTO"
        )

    resultados: list[dict] = []
    for cfg in MODELOS:
        nombre = cfg["nombre"]
        if nombre not in info_por_modelo:
            continue
        info = info_por_modelo[nombre]
        respuestas = respuestas_por_modelo.get(nombre, [])
        cons = consolidados_por_modelo.get(nombre, [])
        if not respuestas or not cons:
            continue
        resultados.append(
            {
                "nombre": nombre,
                "etiqueta": cfg["etiqueta"],
                "color": cfg["color"],
                "carga_s": info["carga_s"],
                "vram_gb": info["vram_gb"],
                "tps_avg": round(statistics.mean(r["tps"] for r in respuestas), 1),
                "ttft_avg": round(statistics.mean(r["ttft"] for r in respuestas), 1),
                "fidelidad_facil": subset_notas(cons, es_adv=False),
                "fidelidad_advers": subset_notas(cons, es_adv=True),
                "alucinaciones": sum(1 for v in cons if v["veredicto"] == "ALUCINADA"),
                "discrepancias": sum(1 for v in cons if v["veredicto"] == "DISCREPA"),
                "idioma_ko": idioma_ko_consenso(cons),
                "idioma_ko_alguno": idioma_ko_alguno(nombre),
                "rechazos_ok": rechazos_correctos(cons),
                "acuerdo": acuerdo_por_modelo.get(nombre, 0.0),
                "total": len(cons),
            }
        )

    info("Benchmark completado.")
