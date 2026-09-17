"""Genera candidatos reproducibles para ampliar el conjunto dorado RAG.

Se ejecuta dentro de ``manualito-rag`` para acceder a Chroma y Ollama por sus
nombres internos. La salida JSON va a stdout y el progreso a stderr.
"""

from __future__ import annotations

import json
import random
import re
import sys
from typing import Any

import chromadb
import httpx

SEMILLA = 7
MODELO = "gemma4:e4b"
COLECCION = "manualito_manuals"
OLLAMA_URL = "http://ollama:11434/api/generate"
MANUALES = {
    "Catan": "019edb14-433a-74a5-8e7c-65bf1f35e065",
    "Monopoly": "019ed764-dae8-735e-adc6-49f7c7fe960e",
}
MUESTRAS = {"Catan": 14, "Monopoly": 6}

PREGUNTAS_AUDITORIA = [
    ("Monopoly", r"2\s*a\s*6\s*jugad", "Para cuantos jugadores es el juego?"),
    ("Monopoly", r"2\s*a\s*6\s*jugad", "cuanta gente puede jugar a la vez?"),
    ("Monopoly", r"150\.?000", "Cuanto dinero recibe cada jugador al empezar?"),
    (
        "Catan",
        r"3\s*a\s*6\s*jugadores|ampliaci[oó]n para 5 y 6",
        "Cuantos jugadores pueden jugar con la ampliacion?",
    ),
]

PROMPT = (
    "Eres un generador de preguntas para evaluar un buscador de manuales de juegos de mesa.\n"
    "Te doy un fragmento real de un manual. Escribe UNA pregunta natural, en español, "
    "que un jugador haría de verdad y cuya respuesta esté contenida en el fragmento. "
    "Reglas: no menciones el fragmento ni el manual; no copies frases literales largas; "
    "pregunta corta (menos de 20 palabras); devuelve SOLO la pregunta, sin comillas.\n\n"
    "FRAGMENTO:\n{chunk}\n\nPREGUNTA:"
)

ESC = chr(27)
YELLOW = f"{ESC}[33m"
CYAN = f"{ESC}[36m"
RED = f"{ESC}[31m"
RESET = f"{ESC}[0m"


def info(mensaje: str) -> None:
    """Escribe progreso sin mezclarlo con el JSON de stdout."""
    print(f"{YELLOW}[*]{RESET} {CYAN}{mensaje}{RESET}", file=sys.stderr)


def error(mensaje: str) -> None:
    """Escribe un error con la convención de consola del proyecto."""
    print(f"{RED}[!] ERROR:{RESET} {mensaje}", file=sys.stderr)


def cargar_chunks(coleccion: Any, manual_id: str) -> list[dict[str, str]]:
    """Carga y ordena los chunks aptos para que el muestreo sea estable."""
    resultado = coleccion.get(
        where={"manual_id": manual_id},
        include=["metadatas", "documents"],
    )
    filas = [
        {"id": chunk_id, "texto": documento, "game_id": metadata["game_id"]}
        for chunk_id, documento, metadata in zip(
            resultado["ids"],
            resultado["documents"],
            resultado["metadatas"],
            strict=True,
        )
        if len(documento.strip()) > 200
    ]
    return sorted(filas, key=lambda fila: fila["id"])


def generar_pregunta(cliente: httpx.Client, texto: str) -> str:
    """Pide una pregunta a Ollama con la misma semilla en cada ejecución."""
    respuesta = cliente.post(
        OLLAMA_URL,
        json={
            "model": MODELO,
            "stream": False,
            "prompt": PROMPT.format(chunk=texto[:1200]),
            "options": {
                "temperature": 0.3,
                "num_ctx": 4096,
                "seed": SEMILLA,
            },
        },
    )
    respuesta.raise_for_status()
    pregunta = respuesta.json()["response"].strip().strip('"').splitlines()[0].strip()
    if len(pregunta) < 10:
        raise ValueError("Ollama devolvió una pregunta vacía o demasiado corta")
    return pregunta


def buscar_chunk(coleccion: Any, manual_id: str, patron: str) -> tuple[str, str]:
    """Ancla una pregunta manual al primer chunk que contiene su respuesta."""
    resultado = coleccion.get(
        where={"manual_id": manual_id},
        include=["metadatas", "documents"],
    )
    filas = sorted(
        zip(
            resultado["ids"],
            resultado["documents"],
            resultado["metadatas"],
            strict=True,
        ),
        key=lambda fila: fila[0],
    )
    for chunk_id, documento, metadata in filas:
        if re.search(patron, documento, re.IGNORECASE):
            return chunk_id, metadata["game_id"]
    raise ValueError(f"No se encontró un chunk para el patrón {patron!r}")


def construir_conjunto() -> list[dict[str, str]]:
    """Genera preguntas con Gemma y añade las cuatro de la auditoría."""
    rng = random.Random(SEMILLA)
    coleccion = chromadb.HttpClient(host="chroma", port=8000).get_collection(COLECCION)
    preguntas: list[dict[str, str]] = []

    with httpx.Client(timeout=180) as cliente:
        for juego, manual_id in MANUALES.items():
            filas = cargar_chunks(coleccion, manual_id)
            cantidad = MUESTRAS[juego]
            if len(filas) < cantidad:
                raise ValueError(
                    f"{juego} solo tiene {len(filas)} chunks aptos; se pidieron {cantidad}"
                )
            for fila in rng.sample(filas, cantidad):
                pregunta = generar_pregunta(cliente, fila["texto"])
                preguntas.append(
                    {
                        "pregunta": pregunta,
                        "chunk_id": fila["id"],
                        "game_id": fila["game_id"],
                        "manual_id": manual_id,
                        "juego": juego,
                        "origen": "gemma",
                    }
                )
                info(f"{juego}: {pregunta}")

    for juego, patron, pregunta in PREGUNTAS_AUDITORIA:
        manual_id = MANUALES[juego]
        chunk_id, game_id = buscar_chunk(coleccion, manual_id, patron)
        preguntas.append(
            {
                "pregunta": pregunta,
                "chunk_id": chunk_id,
                "game_id": game_id,
                "manual_id": manual_id,
                "juego": juego,
                "origen": "auditoria",
            }
        )
        info(f"auditoría/{juego}: {pregunta}")

    return [
        {"id": f"pregunta-{indice:03d}", **pregunta}
        for indice, pregunta in enumerate(preguntas, start=1)
    ]


def main() -> int:
    """Escribe el conjunto generado como JSON UTF-8."""
    try:
        preguntas = construir_conjunto()
    except (httpx.HTTPError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        error(str(exc))
        return 1
    json.dump(preguntas, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
