"""Mide modelos de embeddings para el retrieval RAG de Manualito.

La lógica de corpus, codificación, indexado y métricas procede del benchmark
original. Esta versión escribe resultados JSON en un directorio nuevo.
"""

from __future__ import annotations

import json
import argparse
import os
import sys

sys.dont_write_bytecode = True
from pathlib import Path

YELLOW = "\033[33m"


CYAN = "\033[36m"


GREEN = "\033[32m"


RESET = "\033[0m"


def info_color(text: str, highlight: object = "", after: str = "") -> None:
    """Resalta un dato y devuelve el resto del mensaje al cian."""
    message = text.rstrip(". ")
    if highlight != "":
        message += f" {GREEN}{highlight}{CYAN}"
    if after:
        message += f" {after.rstrip('. ')}"
    print(f"{YELLOW}[*]{RESET} {CYAN}{message}.{RESET}")


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
        "Mide modelos de embeddings para el retrieval RAG de Manualito.", Path(__file__)
    )
    import numpy as np

import gc
import io
import re
import time
from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

Role = Literal["query", "passage"]


MODELOS: list[dict[str, Any]] = [
    {
        "id": "sentence-transformers/all-MiniLM-L6-v2",
        "nombre": "all-MiniLM-L6-v2",
        "descripcion": "Baseline ingles (default de ChromaDB)",
        "e5": False,
    },
    {
        "id": "intfloat/multilingual-e5-small",
        "nombre": "multilingual-e5-small",
        "descripcion": "E5 multilingue pequeno",
        "e5": True,
    },
    {
        "id": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        "nombre": "paraphrase-multilingual-MiniLM-L12-v2",
        "descripcion": "MiniLM multilingue equilibrado",
        "e5": False,
    },
    {
        "id": "intfloat/multilingual-e5-base",
        "nombre": "multilingual-e5-base",
        "descripcion": "E5 multilingue base",
        "e5": True,
    },
]

_TEXTOS_BASE: list[str] = [
    "En Catan, el objetivo es ser el primer jugador en alcanzar 10 puntos de victoria.",
    "Cada turno comienza tirando los dos dados para determinar que hexagonos producen recursos.",
    "Los recursos disponibles son madera, arcilla, lana, trigo y mineral.",
    "Para construir un camino necesitas una madera y una arcilla.",
    "Para construir un poblado necesitas una madera, una arcilla, una lana y un trigo.",
    "Para construir una ciudad necesitas dos trigos y tres minerales.",
    "Para comprar una carta de desarrollo necesitas un mineral, un trigo y una lana.",
    "El ladron se activa siempre que alguien saque un 7 o use una carta de caballero.",
    "Los puertos permiten cambiar recursos a una tasa mas favorable que el banco.",
    "El jugador con el ejercito mas grande recibe 2 puntos de victoria.",
]
CORPUS_VELOCIDAD: list[str] = _TEXTOS_BASE * 10

PARES_SIMETRICOS_SIMILARES: list[tuple[str, str]] = [
    (
        "Cuantos jugadores pueden jugar a Catan sin expansion?",
        "Cual es el numero habitual de participantes en Catan base?",
    ),
    (
        "Los jugadores obtienen recursos segun el dado.",
        "Los materiales se reciben en funcion de la tirada.",
    ),
    (
        "El ladron se mueve cuando alguien saca un 7.",
        "Si el resultado de los dados es 7, el ladron cambia de hexagono.",
    ),
    (
        "Para ganar necesitas 10 puntos de victoria.",
        "La partida termina cuando un jugador alcanza los 10 puntos.",
    ),
    (
        "Una ciudad sustituye a un poblado propio.",
        "Se puede mejorar un asentamiento hasta convertirlo en ciudad.",
    ),
]

PARES_SIMETRICOS_DISTINTOS: list[tuple[str, str]] = [
    (
        "Cuantos jugadores pueden jugar a Catan sin expansion?",
        "El ladron se mueve cuando alguien saca un 7.",
    ),
    (
        "Los jugadores obtienen recursos segun el dado.",
        "Para ganar necesitas 10 puntos de victoria.",
    ),
    (
        "Una ciudad sustituye a un poblado propio.",
        "El jugador con el ejercito mas grande recibe 2 puntos.",
    ),
    (
        "Cuando termina el turno de un jugador?",
        "Que materiales hacen falta para construir un camino?",
    ),
    (
        "Las cartas de desarrollo se compran con mineral, trigo y lana.",
        "El tablero de Catan se monta de forma aleatoria al inicio.",
    ),
]

PASAJES_RAG_AMPLIADO: list[dict[str, str]] = [
    {
        "id": "catan_p01",
        "manual": "Catan",
        "texto": "Catan base se juega normalmente de 3 a 4 jugadores. La expansion 5-6 amplia ese limite, pero no forma parte de la configuracion estandar.",
    },
    {
        "id": "catan_p02",
        "manual": "Catan",
        "texto": "La partida termina en el momento en que un jugador alcanza 10 puntos de victoria entre poblados, ciudades, cartas y bonificaciones.",
    },
    {
        "id": "catan_p03",
        "manual": "Catan",
        "texto": "Al comienzo del turno se lanzan dos dados. Los hexagonos cuyo numero coincide con la tirada producen recursos para los jugadores adyacentes.",
    },
    {
        "id": "catan_p04",
        "manual": "Catan",
        "texto": "Construir un camino cuesta exactamente una madera y una arcilla.",
    },
    {
        "id": "catan_p05",
        "manual": "Catan",
        "texto": "Para fundar un poblado hay que pagar una madera, una arcilla, una lana y un trigo.",
    },
    {
        "id": "catan_p06",
        "manual": "Catan",
        "texto": "Mejorar un poblado a ciudad requiere dos trigos y tres minerales. La ciudad reemplaza al poblado ya existente.",
    },
    {
        "id": "catan_p07",
        "manual": "Catan",
        "texto": "Comprar una carta de desarrollo cuesta una lana, un trigo y un mineral.",
    },
    {
        "id": "catan_p08",
        "manual": "Catan",
        "texto": "Cuando sale un 7 o se juega un caballero, el ladron se mueve. El hexagono donde queda colocado deja de producir y el jugador activo puede robar una carta a un rival adyacente.",
    },
    {
        "id": "catan_p09",
        "manual": "Catan",
        "texto": "La ruta comercial mas larga concede 2 puntos de victoria al jugador que mantenga una cadena continua de al menos cinco caminos.",
    },
    {
        "id": "catan_p10",
        "manual": "Catan",
        "texto": "El ejercito mas grande concede 2 puntos de victoria. Para obtenerlo hay que haber jugado al menos tres cartas de caballero y superar al resto.",
    },
    {
        "id": "catan_p11",
        "manual": "Catan",
        "texto": "Sin puertos, el banco permite cambiar 4 unidades de un mismo recurso por 1 unidad de cualquier otro recurso.",
    },
    {
        "id": "catan_p12",
        "manual": "Catan",
        "texto": "Los puertos mejoran el comercio: los genericos permiten 3 a 1 y los especializados 2 a 1 del recurso indicado.",
    },
    {
        "id": "azul_p01",
        "manual": "Azul",
        "texto": "Azul admite de 2 a 4 jugadores. Cada ronda se juega con fabricas y una zona central comun.",
    },
    {
        "id": "azul_p02",
        "manual": "Azul",
        "texto": "En tu turno puedes tomar todas las losetas de un color de una fabrica. Las losetas restantes de esa fabrica se desplazan al centro de la mesa.",
    },
    {
        "id": "azul_p03",
        "manual": "Azul",
        "texto": "Tambien puedes coger todas las losetas de un color del centro. Si el marcador de jugador inicial sigue alli, debes cogerlo junto con esas losetas.",
    },
    {
        "id": "azul_p04",
        "manual": "Azul",
        "texto": "Cada linea de patron solo admite un color y tiene una capacidad fija igual a su numero de casillas, desde 1 hasta 5.",
    },
    {
        "id": "azul_p05",
        "manual": "Azul",
        "texto": "Cuando una linea de patron se completa, al final de la ronda solo una loseta pasa al muro. El resto de losetas de esa linea va a la tapa de la caja.",
    },
    {
        "id": "azul_p06",
        "manual": "Azul",
        "texto": "No puedes colocar un color en una linea de patron si ese mismo color ya esta presente en la fila correspondiente del muro.",
    },
    {
        "id": "azul_p07",
        "manual": "Azul",
        "texto": "La linea del suelo aplica penalizaciones acumuladas de -1, -1, -2, -2, -2, -3 y -3 puntos segun las casillas ocupadas.",
    },
    {
        "id": "azul_p08",
        "manual": "Azul",
        "texto": "La ronda termina cuando no quedan losetas ni en las fabricas ni en el centro.",
    },
    {
        "id": "azul_p09",
        "manual": "Azul",
        "texto": "Al preparar la siguiente ronda se rellenan de nuevo las fabricas y comienza el jugador que posea el marcador de jugador inicial.",
    },
    {
        "id": "azul_p10",
        "manual": "Azul",
        "texto": "La partida termina al final de la ronda en la que algun jugador completa una fila horizontal del muro.",
    },
    {
        "id": "azul_p11",
        "manual": "Azul",
        "texto": "Al final de la partida se otorgan bonificaciones: 2 puntos por cada fila completa, 7 por cada columna completa y 10 por cada juego completo de un color.",
    },
    {
        "id": "azul_p12",
        "manual": "Azul",
        "texto": "Al mover una loseta al muro se puntua la linea horizontal y la vertical conectadas. Si la loseta queda aislada, vale 1 punto.",
    },
    {
        "id": "carcassonne_p01",
        "manual": "Carcassonne",
        "texto": "En cada turno robas una loseta, la colocas respetando las conexiones, puedes poner un seguidor en ella y despues puntuas las caracteristicas completadas.",
    },
    {
        "id": "carcassonne_p02",
        "manual": "Carcassonne",
        "texto": "Los bordes de las losetas deben coincidir por tipo: camino con camino, ciudad con ciudad y campo con campo.",
    },
    {
        "id": "carcassonne_p03",
        "manual": "Carcassonne",
        "texto": "Un seguidor solo puede colocarse sobre una caracteristica de la loseta recien puesta y unicamente si esa caracteristica no contiene ya ningun otro seguidor conectado.",
    },
    {
        "id": "carcassonne_p04",
        "manual": "Carcassonne",
        "texto": "Un camino completado puntua 1 punto por cada loseta que lo compone.",
    },
    {
        "id": "carcassonne_p05",
        "manual": "Carcassonne",
        "texto": "Una ciudad completada puntua 2 puntos por loseta y 2 puntos adicionales por cada escudo que contenga.",
    },
    {
        "id": "carcassonne_p06",
        "manual": "Carcassonne",
        "texto": "Un monasterio completo puntua 9 puntos: 1 por la propia loseta y 1 por cada una de las 8 losetas adyacentes que la rodean.",
    },
    {
        "id": "carcassonne_p07",
        "manual": "Carcassonne",
        "texto": "Los granjeros permanecen en los campos hasta el final de la partida y otorgan 3 puntos por cada ciudad completada que toque su campo.",
    },
    {
        "id": "carcassonne_p08",
        "manual": "Carcassonne",
        "texto": "Cuando una caracteristica se completa y puntua, los seguidores implicados vuelven a sus propietarios y pueden volver a usarse en turnos posteriores.",
    },
    {
        "id": "carcassonne_p09",
        "manual": "Carcassonne",
        "texto": "Si dos estructuras se unen mas adelante, la mayoria de seguidores decide quien puntua. En caso de empate, todos los jugadores empatados reciben la puntuacion completa.",
    },
    {
        "id": "carcassonne_p10",
        "manual": "Carcassonne",
        "texto": "La partida termina cuando se agota la ultima loseta. Entonces se realiza una puntuacion final de las caracteristicas incompletas y de los campos.",
    },
    {
        "id": "carcassonne_p11",
        "manual": "Carcassonne",
        "texto": "Al final de la partida, las ciudades incompletas puntuan 1 punto por loseta y 1 por escudo, mientras que los caminos y monasterios incompletos puntuan 1 punto por loseta relevante.",
    },
    {
        "id": "carcassonne_p12",
        "manual": "Carcassonne",
        "texto": "La partida comienza con una loseta inicial ya colocada en la mesa; a partir de ella se expande el mapa durante toda la partida.",
    },
]

CASOS_ASIMETRICOS: list[dict[str, Any]] = [
    {
        "id": "catan_q01",
        "manual": "Catan",
        "query": "Cuantas personas pueden participar en una partida estandar de Catan?",
        "gold_ids": ["catan_p01"],
        "tipo": "parafrasis",
    },
    {
        "id": "catan_q02",
        "manual": "Catan",
        "query": "Que materiales pide el juego para fundar un poblado?",
        "gold_ids": ["catan_p05"],
        "tipo": "parafrasis",
    },
    {
        "id": "catan_q03",
        "manual": "Catan",
        "query": "Con que recursos compro una carta de desarrollo?",
        "gold_ids": ["catan_p07"],
        "tipo": "sinonimo",
    },
    {
        "id": "catan_q04",
        "manual": "Catan",
        "query": "Con cuantos puntos se gana la partida?",
        "gold_ids": ["catan_p02"],
        "tipo": "sinonimo",
    },
    {
        "id": "catan_q05",
        "manual": "Catan",
        "query": "Si quiero mejorar un asentamiento hasta ciudad, que debo pagar?",
        "gold_ids": ["catan_p06"],
        "tipo": "formulacion_indirecta",
    },
    {
        "id": "catan_q06",
        "manual": "Catan",
        "query": "Que intercambio puedo hacer si no tengo acceso a ningun puerto?",
        "gold_ids": ["catan_p11"],
        "tipo": "formulacion_indirecta",
    },
    {
        "id": "catan_q07",
        "manual": "Catan",
        "query": "Que premio recibo por encadenar muchas carreteras seguidas?",
        "gold_ids": ["catan_p09"],
        "tipo": "distractor_lexico",
    },
    {
        "id": "catan_q08",
        "manual": "Catan",
        "query": "Cuando aparece un 7, que casilla deja de dar recursos y que accion extra se habilita?",
        "gold_ids": ["catan_p08"],
        "tipo": "distractor_lexico",
    },
    {
        "id": "azul_q01",
        "manual": "Azul",
        "query": "Cuantas personas admite una partida de Azul?",
        "gold_ids": ["azul_p01"],
        "tipo": "parafrasis",
    },
    {
        "id": "azul_q02",
        "manual": "Azul",
        "query": "Que pasa con las fichas que sobran en la fabrica cuando eliges un color?",
        "gold_ids": ["azul_p02", "azul_p03"],
        "tipo": "parafrasis",
    },
    {
        "id": "azul_q03",
        "manual": "Azul",
        "query": "Como funciona la fila en la que preparas losetas antes de llevarlas al muro?",
        "gold_ids": ["azul_p04", "azul_p05"],
        "tipo": "sinonimo",
    },
    {
        "id": "azul_q04",
        "manual": "Azul",
        "query": "Que castigo aplica la linea del suelo?",
        "gold_ids": ["azul_p07"],
        "tipo": "sinonimo",
    },
    {
        "id": "azul_q05",
        "manual": "Azul",
        "query": "En que momento se desencadena el final de la partida?",
        "gold_ids": ["azul_p10"],
        "tipo": "formulacion_indirecta",
    },
    {
        "id": "azul_q06",
        "manual": "Azul",
        "query": "Si completo una linea de patron, cuantas losetas terminan realmente fijadas en el muro?",
        "gold_ids": ["azul_p05", "azul_p12"],
        "tipo": "formulacion_indirecta",
    },
    {
        "id": "azul_q07",
        "manual": "Azul",
        "query": "Que sucede si tomo losetas del centro y todavia queda el marcador de jugador inicial?",
        "gold_ids": ["azul_p03"],
        "tipo": "distractor_lexico",
    },
    {
        "id": "azul_q08",
        "manual": "Azul",
        "query": "Puedo cargar una fila con un color que ya esta colocado en la fila equivalente del muro?",
        "gold_ids": ["azul_p06"],
        "tipo": "distractor_lexico",
    },
    {
        "id": "carcassonne_q01",
        "manual": "Carcassonne",
        "query": "Que pasos tiene un turno normal en Carcassonne?",
        "gold_ids": ["carcassonne_p01"],
        "tipo": "parafrasis",
    },
    {
        "id": "carcassonne_q02",
        "manual": "Carcassonne",
        "query": "Cuanto vale un camino cerrado por completo?",
        "gold_ids": ["carcassonne_p04"],
        "tipo": "parafrasis",
    },
    {
        "id": "carcassonne_q03",
        "manual": "Carcassonne",
        "query": "Cuando esta prohibido poner un seguidor en una caracteristica?",
        "gold_ids": ["carcassonne_p03"],
        "tipo": "sinonimo",
    },
    {
        "id": "carcassonne_q04",
        "manual": "Carcassonne",
        "query": "Como se puntua un monasterio completado?",
        "gold_ids": ["carcassonne_p06"],
        "tipo": "sinonimo",
    },
    {
        "id": "carcassonne_q05",
        "manual": "Carcassonne",
        "query": "Si dos caminos se unen mas tarde y habia seguidores de varios jugadores, quien se lleva los puntos?",
        "gold_ids": ["carcassonne_p09"],
        "tipo": "formulacion_indirecta",
    },
    {
        "id": "carcassonne_q06",
        "manual": "Carcassonne",
        "query": "Que ocurre con el meeple una vez que la estructura se cierra y se anota?",
        "gold_ids": ["carcassonne_p08"],
        "tipo": "formulacion_indirecta",
    },
    {
        "id": "carcassonne_q07",
        "manual": "Carcassonne",
        "query": "Cuando se acaban las losetas, como puntuan las ciudades que quedaron sin cerrar?",
        "gold_ids": ["carcassonne_p10", "carcassonne_p11"],
        "tipo": "distractor_lexico",
    },
    {
        "id": "carcassonne_q08",
        "manual": "Carcassonne",
        "query": "Las carreteras y las ciudades pueden tocar cualquier borde o deben emparejarse por el mismo tipo de terreno?",
        "gold_ids": ["carcassonne_p02"],
        "tipo": "distractor_lexico",
    },
]


def validar_corpus() -> None:
    conteo_pasajes = Counter(pasaje["manual"] for pasaje in PASAJES_RAG_AMPLIADO)
    conteo_queries = Counter(caso["manual"] for caso in CASOS_ASIMETRICOS)
    pasajes_por_id = {pasaje["id"]: pasaje for pasaje in PASAJES_RAG_AMPLIADO}

    if len(PASAJES_RAG_AMPLIADO) != 36:
        raise ValueError("El corpus principal debe tener exactamente 36 pasajes.")
    if len(CASOS_ASIMETRICOS) != 24:
        raise ValueError("El corpus de queries debe tener exactamente 24 casos.")
    if len(conteo_pasajes) != 3 or any(total != 12 for total in conteo_pasajes.values()):
        raise ValueError("Cada manual debe aportar exactamente 12 pasajes.")
    if len(conteo_queries) != 3 or any(total != 8 for total in conteo_queries.values()):
        raise ValueError("Cada manual debe aportar exactamente 8 queries.")

    for caso in CASOS_ASIMETRICOS:
        gold_ids = caso["gold_ids"]
        if not gold_ids:
            raise ValueError(f"{caso['id']} debe tener al menos un gold_id.")
        if len(set(gold_ids)) != len(gold_ids):
            raise ValueError(f"{caso['id']} contiene gold_ids duplicados.")
        for gold_id in gold_ids:
            pasaje = pasajes_por_id.get(gold_id)
            if pasaje is None:
                raise ValueError(f"{caso['id']} referencia un pasaje inexistente: {gold_id}")
            if pasaje["manual"] != caso["manual"]:
                raise ValueError(
                    f"{caso['id']} mezcla manuales: {gold_id} no pertenece a {caso['manual']}."
                )


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def ram_mb() -> float:
    import psutil

    return psutil.Process().memory_info().rss / 1024 / 1024


def preparar_textos(
    textos: list[str],
    *,
    e5: bool,
    role: Role = "passage",
) -> list[str]:
    if not e5:
        return list(textos)
    prefijo = "query: " if role == "query" else "passage: "
    return [prefijo + texto for texto in textos]


def cargar_modelo(model_id: str) -> "SentenceTransformer":
    from sentence_transformers import SentenceTransformer
    from transformers.utils import logging as transformers_logging

    previous_verbosity = transformers_logging.get_verbosity()
    transformers_logging.set_verbosity_error()

    try:
        # Algunas versiones de transformers/sentence-transformers imprimen
        # "LOAD REPORT" inocuos (por ejemplo position_ids inesperado) al cargar
        # checkpoints compatibles. Los silenciamos para que la salida del
        # benchmark refleje solo metricas relevantes.
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return SentenceTransformer(model_id)
    except Exception as exc:
        raise RuntimeError(
            "No se pudo cargar el modelo de embeddings. "
            "Asegurate de tener acceso a Hugging Face o de que el modelo ya este en cache local."
        ) from exc
    finally:
        transformers_logging.set_verbosity(previous_verbosity)


def encode(
    model: "SentenceTransformer",
    textos: list[str],
    *,
    e5: bool,
    role: Role = "passage",
) -> np.ndarray:
    preparados = preparar_textos(textos, e5=e5, role=role)
    return model.encode(preparados, convert_to_numpy=True, show_progress_bar=False)


def dimension_modelo(model: "SentenceTransformer") -> int:
    if hasattr(model, "get_embedding_dimension"):
        return int(model.get_embedding_dimension())
    return int(model.get_sentence_embedding_dimension())


def nombre_coleccion(nombre: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", nombre)[:63]


def crear_cliente_chroma():
    import chromadb

    return chromadb.EphemeralClient()


def evaluar_velocidad(model: "SentenceTransformer", *, e5: bool) -> dict[str, float]:
    t0 = time.perf_counter()
    encode(model, CORPUS_VELOCIDAD, e5=e5, role="passage")
    elapsed = time.perf_counter() - t0
    return {
        "total_s": round(elapsed, 3),
        "ms_por_doc": round(elapsed / len(CORPUS_VELOCIDAD) * 1000, 2),
    }


def evaluar_simetria_diag(
    model: "SentenceTransformer",
    *,
    e5: bool,
) -> dict[str, float]:
    sims_pos = [
        cosine_sim(
            encode(model, [a], e5=e5, role="query")[0],
            encode(model, [b], e5=e5, role="query")[0],
        )
        for a, b in PARES_SIMETRICOS_SIMILARES
    ]
    sims_neg = [
        cosine_sim(
            encode(model, [a], e5=e5, role="query")[0],
            encode(model, [b], e5=e5, role="query")[0],
        )
        for a, b in PARES_SIMETRICOS_DISTINTOS
    ]
    sim_sim = float(np.mean(sims_pos))
    sim_dist = float(np.mean(sims_neg))
    return {
        "sim_sim": round(sim_sim, 4),
        "sim_dist": round(sim_dist, 4),
        "delta_sim": round(sim_sim - sim_dist, 4),
    }


def metricas_rank(ids_recuperados: list[str], gold_ids: list[str]) -> dict[str, float]:
    top10 = ids_recuperados[:10]
    ranks = [top10.index(gold_id) + 1 for gold_id in gold_ids if gold_id in top10]
    rank = min(ranks) if ranks else None

    return {
        "r1": 1.0 if any(gold_id in top10[:1] for gold_id in gold_ids) else 0.0,
        "r3": 1.0 if any(gold_id in top10[:3] for gold_id in gold_ids) else 0.0,
        "mrr10": 0.0 if rank is None else 1.0 / rank,
    }


def obtener_hardest_negative(
    query_embedding: np.ndarray,
    passage_embeddings: dict[str, np.ndarray],
    gold_ids: list[str],
) -> tuple[str, float]:
    candidatos = [
        (passage_id, cosine_sim(query_embedding, passage_embedding))
        for passage_id, passage_embedding in passage_embeddings.items()
        if passage_id not in gold_ids
    ]
    return max(candidatos, key=lambda item: item[1])


def calcular_delta_asimetrica(
    query_embedding: np.ndarray,
    passage_embeddings: dict[str, np.ndarray],
    gold_ids: list[str],
) -> tuple[float, str, float]:
    gold_score = max(
        cosine_sim(query_embedding, passage_embeddings[gold_id]) for gold_id in gold_ids
    )
    hardest_negative_id, hardest_negative_score = obtener_hardest_negative(
        query_embedding,
        passage_embeddings,
        gold_ids,
    )
    return (
        gold_score - hardest_negative_score,
        hardest_negative_id,
        hardest_negative_score,
    )


def evaluar_retrieval_asimetrico(
    model: "SentenceTransformer",
    nombre_modelo: str,
    *,
    e5: bool,
) -> dict[str, float]:
    client = crear_cliente_chroma()
    coleccion = client.get_or_create_collection(nombre_coleccion(nombre_modelo))

    textos = [pasaje["texto"] for pasaje in PASAJES_RAG_AMPLIADO]
    ids = [pasaje["id"] for pasaje in PASAJES_RAG_AMPLIADO]
    metadatos = [{"manual": pasaje["manual"]} for pasaje in PASAJES_RAG_AMPLIADO]
    embeddings_pasajes = encode(model, textos, e5=e5, role="passage")
    passage_embeddings_por_manual: dict[str, dict[str, np.ndarray]] = {}
    for pasaje, embedding in zip(PASAJES_RAG_AMPLIADO, embeddings_pasajes, strict=True):
        passage_embeddings_por_manual.setdefault(pasaje["manual"], {})[pasaje["id"]] = embedding

    coleccion.add(
        documents=textos,
        embeddings=embeddings_pasajes.tolist(),
        ids=ids,
        metadatas=metadatos,
    )

    hits_r1 = 0.0
    hits_r3 = 0.0
    sum_mrr10 = 0.0
    deltas_asim = []

    for caso in CASOS_ASIMETRICOS:
        embeddings_manual = passage_embeddings_por_manual[caso["manual"]]
        query_embedding = encode(
            model,
            [caso["query"]],
            e5=e5,
            role="query",
        )[0]

        resultado = coleccion.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=min(10, len(embeddings_manual)),
            where={"manual": caso["manual"]},
        )
        ids_recuperados = resultado["ids"][0]
        metricas = metricas_rank(ids_recuperados, caso["gold_ids"])
        hits_r1 += metricas["r1"]
        hits_r3 += metricas["r3"]
        sum_mrr10 += metricas["mrr10"]

        delta_asim, _, _ = calcular_delta_asimetrica(
            query_embedding,
            embeddings_manual,
            caso["gold_ids"],
        )
        deltas_asim.append(delta_asim)

    client.delete_collection(nombre_coleccion(nombre_modelo))
    total = len(CASOS_ASIMETRICOS)
    return {
        "r1": round(hits_r1 / total, 4),
        "r3": round(hits_r3 / total, 4),
        "mrr10": round(sum_mrr10 / total, 4),
        "delta_asim": round(float(np.mean(deltas_asim)), 4),
    }


def ordenar_resultados(resultados: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        resultados,
        key=lambda fila: (
            -fila["R@3"],
            -fila["MRR@10"],
            -fila["R@1"],
            -fila["Δ asim."],
            fila["ms/doc"],
            fila["RAM +MB"],
        ),
    )


def run_benchmark(*, verbose: bool = True) -> list[dict[str, Any]]:
    validar_corpus()
    resultados: list[dict[str, Any]] = []

    if verbose:
        info_color("Benchmark de embeddings para RAG en espanol")
        info_color("Modelos a evaluar:", f"{len(MODELOS)}")
        info_color(
            "Pares simetricos:",
            f"{len(PARES_SIMETRICOS_SIMILARES)} similares / {len(PARES_SIMETRICOS_DISTINTOS)} distintos",
        )
        info_color(
            "Corpus asimetrico:",
            f"{len(PASAJES_RAG_AMPLIADO)} pasajes / {len(CASOS_ASIMETRICOS)} queries",
        )

    for cfg in MODELOS:
        if verbose:
            sep = "=" * 72
            print(f"\n{sep}")
            info_color("  Modelo:", cfg["nombre"])
            info_color("  Descripcion:", cfg["descripcion"])
            print(sep)

        ram_antes = ram_mb()
        t0 = time.perf_counter()
        model = cargar_modelo(cfg["id"])
        t_carga = time.perf_counter() - t0
        ram_uso = round(ram_mb() - ram_antes, 1)
        dim = dimension_modelo(model)

        if verbose:
            info_color(
                "  Cargado:",
                f"{t_carga:.2f} s | RAM +{ram_uso} MB | dim={dim}",
            )

        vel = evaluar_velocidad(model, e5=cfg["e5"])
        diag = evaluar_simetria_diag(model, e5=cfg["e5"])
        rag = evaluar_retrieval_asimetrico(model, cfg["nombre"], e5=cfg["e5"])

        if verbose:
            info_color("  Velocidad:", f"{vel['ms_por_doc']} ms/doc")
            info_color(
                "  Diagnostico:",
                f"sim={diag['sim_sim']} dist={diag['sim_dist']} Dsim={diag['delta_sim']}",
            )
            info_color(
                "  Retrieval:",
                f"R@1={rag['r1']} R@3={rag['r3']} MRR@10={rag['mrr10']} Dasim={rag['delta_asim']}",
            )

        resultados.append(
            {
                "Modelo": cfg["nombre"],
                "Dim.": dim,
                "Carga (s)": round(t_carga, 2),
                "RAM +MB": ram_uso,
                "ms/doc": vel["ms_por_doc"],
                "Δ sim.": diag["delta_sim"],
                "Δ asim.": rag["delta_asim"],
                "R@1": rag["r1"],
                "R@3": rag["r3"],
                "MRR@10": rag["mrr10"],
            }
        )

        del model
        gc.collect()

    return ordenar_resultados(resultados)


def main() -> None:
    resultados = run_benchmark(verbose=True)
    columns = {
        "label": "Modelo",
        "dimensions": "Dim.",
        "load_s": "Carga (s)",
        "ram_mb": "RAM +MB",
        "ms_document": "ms/doc",
        "delta_symmetric": "Δ sim.",
        "delta_asymmetric": "Δ asim.",
        "recall1": "R@1",
        "recall3": "R@3",
        "mrr10": "MRR@10",
    }
    payload = {
        "fecha": time.strftime("%Y-%m-%d"),
        "modelos": MODELOS,
        "corpus_velocidad": len(CORPUS_VELOCIDAD),
        "pares_simetricos": {
            "similares": PARES_SIMETRICOS_SIMILARES,
            "distintos": PARES_SIMETRICOS_DISTINTOS,
        },
        "pasajes": PASAJES_RAG_AMPLIADO,
        "casos": CASOS_ASIMETRICOS,
        "summary": [{key: row[column] for key, column in columns.items()} for row in resultados],
    }
    Path("results.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    info_color("Resultados guardados en:", "results.json")


if __name__ == "__main__":
    main()
