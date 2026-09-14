"""Mide configuraciones de chunking y retrieval de Manualito.

Conserva el corpus y las métricas del notebook original y guarda únicamente
los datos JSON de la ejecución en el directorio indicado por el operador.
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


RESET = "\033[0m"


def info(text: str, highlight: object = "", after: str = "") -> None:
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
        "Mide configuraciones de chunking del corpus de Manualito.", Path(__file__)
    )

import gc
import json
import re
import time
import unicodedata
import warnings

warnings.filterwarnings("ignore")

# ── Formato de salida con colores ANSI ──────────────────────────────────
_ESC = chr(27)
_Y = f"{_ESC}[33m"  # amarillo
_C = f"{_ESC}[36m"  # cian
_R = f"{_ESC}[31m"  # rojo
_G = f"{_ESC}[32m"  # verde
_0 = f"{_ESC}[0m"  # reset


# ── Modelo de embeddings (el elegido en benchmark anterior) ─────────────
MODELO_EMBEDDINGS = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# ── 7 configuraciones a comparar ────────────────────────────────────────
CONFIGS = [
    {
        "nombre": "fix-256-0",
        "etiqueta": "fix\n256",
        "splitter": "fijo",
        "size": 256,
        "overlap": 0,
        "color": "#89b4fa",
    },
    {
        "nombre": "fix-512-0",
        "etiqueta": "fix\n512",
        "splitter": "fijo",
        "size": 512,
        "overlap": 0,
        "color": "#74c7ec",
    },
    {
        "nombre": "fix-1024-0",
        "etiqueta": "fix\n1024",
        "splitter": "fijo",
        "size": 1024,
        "overlap": 0,
        "color": "#94e2d5",
    },
    {
        "nombre": "rec-256-0",
        "etiqueta": "rec\n256",
        "splitter": "recursivo",
        "size": 256,
        "overlap": 0,
        "color": "#fab387",
    },
    {
        "nombre": "rec-512-0",
        "etiqueta": "rec\n512",
        "splitter": "recursivo",
        "size": 512,
        "overlap": 0,
        "color": "#a6e3a1",
    },
    {
        "nombre": "rec-512-64",
        "etiqueta": "rec\n512+64",
        "splitter": "recursivo",
        "size": 512,
        "overlap": 64,
        "color": "#f9e2af",
    },
    {
        "nombre": "rec-1024-128",
        "etiqueta": "rec\n1024+128",
        "splitter": "recursivo",
        "size": 1024,
        "overlap": 128,
        "color": "#f38ba8",
    },
]

# ── Corpus sintético: 3 manuales en español ─────────────────────────────
CORPUS_CATAN = """## Introducción a Catan

Catan es un juego de mesa de estrategia y negociación diseñado por Klaus Teuber en 1995. Está pensado para 3 o 4 jugadores, aunque existe una expansión oficial que permite jugar hasta seis participantes. Una partida típica de Catan dura entre sesenta y noventa minutos y el objetivo es alcanzar diez puntos de victoria antes que los rivales.

## Preparación

Al comienzo de la partida se monta un tablero de diecinueve hexágonos de terreno rodeado por piezas marinas. Cada hexágono representa un tipo de recurso: bosque para madera, montaña para mineral, colina para arcilla, pasto para lana, campo para trigo y desierto que no produce nada. Los jugadores colocan por turno dos poblados y dos carreteras de su color inicial. Los poblados valen un punto de victoria cada uno desde el primer instante de la partida.

## Recursos y producción

El juego se basa en cinco tipos de recursos: madera, arcilla, lana, trigo y mineral. Al inicio de cada turno, el jugador activo tira los dos dados de seis caras. El número resultante indica qué hexágonos producen recursos. Cada hexágono tiene asociada una ficha con un número del 2 al 12, excepto el desierto. Cuando la suma de los dados coincide con ese número, todos los jugadores con poblados o ciudades adyacentes al hexágono reciben uno o dos recursos según el tipo de edificio.

## El ladrón

Si sale un 7 con la tirada inicial del turno, se activa el ladrón. Todos los jugadores con más de siete cartas de recurso en la mano deben descartar la mitad, redondeando hacia abajo. Después, el jugador que tiró los dados mueve al ladrón a cualquier hexágono del tablero, incluso uno marítimo. El hexágono donde se coloca el ladrón deja de producir recursos hasta que alguien lo mueva de nuevo. Además, el jugador que lo mueve roba una carta al azar a un rival que tenga un poblado o ciudad adyacente al hexágono bloqueado. El ladrón también se activa al jugar una carta de caballero, con el mismo efecto.

## Construcciones

Para construir una carretera hay que pagar una madera y una arcilla al banco. Las carreteras se colocan en las aristas entre hexágonos y no otorgan puntos de victoria por sí mismas, pero son necesarias para expandir la red del jugador y para optar al bono de ruta comercial más larga.

Para construir un poblado hay que pagar una madera, una arcilla, una lana y un trigo. Un poblado vale un punto de victoria. Solo se puede colocar en un vértice vacío, conectado a una carretera propia, y que esté al menos a dos aristas de distancia de cualquier otro poblado o ciudad.

Para construir una ciudad hay que pagar dos trigos y tres minerales. La ciudad reemplaza un poblado existente del jugador y vale dos puntos de victoria en lugar de uno. Además, la ciudad produce el doble de recursos: dos unidades del recurso correspondiente cada vez que el hexágono adyacente produce.

## Puertos y comercio

Repartidos por la costa del tablero hay nueve puertos. El puerto más ventajoso es el puerto 2:1 específico, que permite intercambiar con el banco dos recursos del mismo tipo por uno cualquiera de otro tipo; existe un puerto 2:1 por cada recurso. El puerto genérico 3:1 permite cambiar tres recursos iguales por uno cualquiera. Si un jugador no tiene acceso a ningún puerto, el cambio estándar con el banco es cuatro por uno.

Los jugadores también pueden comerciar entre sí durante su turno, proponiendo intercambios de recursos libremente. El comercio entre jugadores no está permitido fuera del turno propio.

## Cartas de desarrollo

Las cartas de desarrollo se compran con una lana, un trigo y un mineral. Hay tres tipos principales: caballeros, cartas de progreso y puntos de victoria. Los caballeros mueven al ladrón como si se hubiera sacado un 7. El jugador con al menos tres caballeros jugados consigue el mayor ejército, que otorga dos puntos de victoria extra; esta ventaja pasa al rival si alguien juega más caballeros. Las cartas de progreso incluyen monopolio, año de abundancia y construcción de carreteras. Las cartas de punto de victoria cuentan al final de la partida pero se mantienen ocultas hasta que su dueño alcanza los diez puntos.

## Final de la partida

La partida de Catan termina en cuanto un jugador alcanza diez puntos de victoria al comienzo de su turno y los anuncia. Los puntos se suman entre poblados, ciudades, bono de ejército más grande, bono de ruta comercial más larga y cartas de desarrollo de punto de victoria. El jugador que alcance primero ese umbral gana la partida.
"""

CORPUS_AZUL = """## Introducción a Azul

Azul es un juego abstracto de colocación de azulejos diseñado por Michael Kiesling en 2017. Está pensado para 2 a 4 jugadores y una partida típica de Azul dura entre 30 y 45 minutos. El objetivo es decorar el muro del palacio real de Évora con azulejos de colores obteniendo la mayor puntuación posible.

## Componentes

La caja incluye un tablero personal por jugador con un muro cuadriculado de cinco filas y cinco columnas, una zona de patrones con filas de uno a cinco espacios, y una fila de suelo para penalizaciones. También trae cien azulejos en cinco colores distintos, cinco fábricas redondas por cada par de jugadores y una bolsa común para el banco de azulejos.

## Preparación

Al inicio cada jugador recibe un tablero personal. En el centro de la mesa se colocan las fábricas según el número de jugadores: cinco fábricas para dos jugadores, siete para tres y nueve para cuatro. Un marcador de jugador inicial se coloca en la zona central. Se meten todos los azulejos en la bolsa y cada fábrica se rellena con cuatro azulejos al azar.

## Desarrollo de la ronda

Cada ronda consta de tres fases: oferta de fábrica, colocación en el muro y limpieza.

En la fase de oferta, los jugadores se turnan eligiendo todos los azulejos de un mismo color de una fábrica o del centro. Los azulejos no elegidos de esa fábrica se mueven al centro. El primer jugador que toma piezas del centro en la ronda coge el marcador de jugador inicial y pierde un punto, pero será el primero en la siguiente ronda. Los azulejos obtenidos se colocan en una fila del patrón personal; si sobran o no caben, van a la fila de suelo.

La fase termina cuando todas las fábricas y el centro quedan vacíos.

## Colocación en el muro

En la fase de colocación, cada fila del patrón cuyo extremo derecho esté completo mueve un azulejo al muro, al hueco de la fila correspondiente, y el resto de azulejos de esa fila del patrón se descartan. Cada azulejo colocado en el muro puntúa inmediatamente contando los azulejos adyacentes en horizontal y vertical, incluyendo el recién colocado. Si no hay azulejos adyacentes, vale solo un punto. Los azulejos de la fila de suelo restan puntos según una escala impresa.

## Bonificaciones finales

Al final de la partida se añaden bonificaciones. Cada fila del muro que completa una fila horizontal suma dos puntos extra. Cada columna completa suma siete puntos. Cada color con los cinco azulejos colocados en el muro suma diez puntos.

## Final de la partida

La partida de Azul termina al terminar la ronda en la que un jugador completa una fila horizontal de cinco azulejos en su muro. Después de aplicar las bonificaciones finales, gana el jugador con más puntos; en caso de empate, el jugador con más filas horizontales completas se lleva la victoria.
"""

CORPUS_CARCASSONNE = """## Introducción a Carcassonne

Carcassonne es un juego de colocación de fichas diseñado por Klaus-Jürgen Wrede en el año 2000. Está pensado para 2 a 5 jugadores, aunque existen expansiones que amplían el número, y una partida típica dura entre treinta y cuarenta y cinco minutos. El objetivo es construir el paisaje medieval del sur de Francia colocando fichas de terreno y ganar puntos situando seguidores en caminos, ciudades, monasterios y campos.

## Componentes

El juego incluye 72 fichas cuadradas con dibujos de caminos, ciudades, campos y monasterios. Cada jugador recibe al inicio siete seguidores de su color que utilizará durante la partida para reclamar estructuras. Una de las fichas se coloca al inicio en el centro como ficha de comienzo, con una ciudad parcial, un tramo de camino y un monasterio.

## Turno de juego

En su turno, el jugador activo roba una ficha al azar de la pila y la coloca en el tablero compartido. La ficha debe casar con las fichas vecinas: los caminos deben continuar con caminos, las ciudades con ciudades y los campos con campos. Tras colocar la ficha, el jugador puede poner opcionalmente uno de sus seguidores sobre la ficha recién colocada, reclamando así una estructura: caballero en una ciudad, ladrón en un camino, monje en un monasterio o campesino en un campo.

Solo se puede colocar un seguidor en una estructura que no esté ya ocupada por otro seguidor, ya sea propio o rival. El turno termina después de la colocación.

## Puntuación durante la partida

Cuando un camino se termina (ambos extremos cerrados por cruce, ciudad o bucle) se puntúa: el jugador con más ladrones gana un punto por cada ficha que compone el camino. Si un camino completado tiene dos ladrones empatados, ambos reciben el total de puntos.

Cuando una ciudad se cierra completamente sin huecos, el jugador con más caballeros dentro gana dos puntos por ficha y dos puntos extra por cada escudo que aparezca en ella. Las ciudades pequeñas de dos fichas puntúan cuatro puntos.

Cuando un monasterio queda rodeado por ocho fichas más la propia, el jugador con el monje dentro gana nueve puntos. Tras puntuar una estructura, los seguidores que estaban en ella regresan a sus dueños y pueden volver a usarse en turnos posteriores.

## Puntuación final

Al final de la partida, cuando se acaban las fichas de la pila, se puntúan las estructuras incompletas. Cada camino no cerrado da un punto por ficha. Cada ciudad no cerrada da un punto por ficha y un punto por escudo. Cada monasterio da un punto por cada ficha circundante incluyendo la propia.

Los campesinos, que se colocan sobre prados y nunca se recuperan durante la partida, se puntúan solo al final. Cada campesino en el campo mayoritario otorga tres puntos por cada ciudad completa que toque ese campo.

## Final de la partida

La partida de Carcassonne termina cuando un jugador roba la última ficha de la pila, la coloca y realiza su última acción. Tras las puntuaciones finales de estructuras incompletas y campesinos, gana el jugador con más puntos acumulados. En caso de empate, comparten la victoria.
"""

CORPUS = CORPUS_CATAN + "\n\n" + CORPUS_AZUL + "\n\n" + CORPUS_CARCASSONNE

# ── 10 consultas con gold substring (normalizada sin acentos ni mayúsculas) ──
CONSULTAS_GOLD = [
    {"query": "¿Cuántos jugadores pueden jugar a Catan?", "substr": "3 o 4 jugadores"},
    {
        "query": "¿Qué recursos necesito para construir una ciudad?",
        "substr": "dos trigos y tres minerales",
    },
    {"query": "¿Cuándo se activa el ladrón?", "substr": "sale un 7"},
    {"query": "¿Cómo funciona el puerto 2:1?", "substr": "dos recursos del mismo tipo"},
    {"query": "¿Cuánto dura una partida de Azul?", "substr": "30 y 45 minutos"},
    {
        "query": "¿Cómo se puntúa una fila horizontal completa en Azul?",
        "substr": "dos puntos extra",
    },
    {"query": "¿Cuándo termina Azul?", "substr": "completa una fila horizontal"},
    {
        "query": "¿Cuántos seguidores tiene cada jugador en Carcassonne?",
        "substr": "siete seguidores",
    },
    {"query": "¿Cómo se puntúa un camino en Carcassonne?", "substr": "un punto por cada ficha"},
    {
        "query": "¿Qué pasa con los campesinos al final de Carcassonne?",
        "substr": "tres puntos por cada ciudad",
    },
]

print(
    f"Configuración lista, {len(CONFIGS)} configs, corpus de {len(CORPUS):,} caracteres, "
    f"{len(CONSULTAS_GOLD)} consultas."
)


def normaliza(t: str) -> str:
    """Minúsculas + elimina acentos (NFKD) para comparar substrings sin depender de tildes."""
    t = t.lower()
    return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))


def contiene_gold(chunk: str, substr: str) -> bool:
    return normaliza(substr) in normaliza(chunk)


def col_name(nombre: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", nombre)[:63]


# ── Splitter fijo ───────────────────────────────────────────────────────
def chunk_fijo(texto: str, size: int, overlap: int) -> list[str]:
    """Corte por caracteres con solapamiento. step = max(1, size - overlap)."""
    if size <= 0:
        raise ValueError("size debe ser > 0")
    step = max(1, size - overlap)
    chunks = []
    i = 0
    n = len(texto)
    while i < n:
        chunks.append(texto[i : i + size])
        if i + size >= n:
            break
        i += step
    return chunks


# ── Splitter recursivo (inspirado en LangChain, sin dependencia) ────────
_SEPS_DEFAULT = ("\n\n", "\n", ". ", " ", "")


def chunk_recursivo(
    texto: str,
    size: int,
    overlap: int,
    seps: tuple = _SEPS_DEFAULT,
) -> list[str]:
    """Recursive character splitter. Busca el primer separador que exista,
    parte por él, empaqueta trozos ≤ size y recurre con el siguiente separador
    si alguno excede el tamaño. El solapamiento se aplica al final sobre los
    chunks ya ensamblados (tail del anterior + chunk actual)."""
    if len(texto) <= size:
        return [texto]

    # Buscar primer separador existente en el texto ("" = último recurso: corte por caracteres)
    sep_idx = len(seps) - 1
    for i, s in enumerate(seps):
        if s == "" or s in texto:
            sep_idx = i
            break
    sep = seps[sep_idx]

    # Partir por ese separador
    pieces = texto.split(sep) if sep else list(texto)

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        # Si el trozo solo ya excede el tamaño, recurrimos con los siguientes separadores
        if len(piece) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(chunk_recursivo(piece, size, 0, seps[sep_idx + 1 :]))
            continue
        # Intentar añadir la pieza al chunk actual
        candidato = (current + sep + piece) if current else piece
        if len(candidato) <= size:
            current = candidato
        else:
            if current:
                chunks.append(current)
            current = piece
    if current:
        chunks.append(current)

    # Aplicar solapamiento (tail del anterior prepend al siguiente)
    if overlap > 0 and len(chunks) > 1:
        out = [chunks[0]]
        for i in range(1, len(chunks)):
            tail = chunks[i - 1][-overlap:]
            out.append(tail + chunks[i])
        chunks = out

    return chunks


def partir(texto: str, cfg: dict) -> list[str]:
    if cfg["splitter"] == "fijo":
        return chunk_fijo(texto, cfg["size"], cfg["overlap"])
    if cfg["splitter"] == "recursivo":
        return chunk_recursivo(texto, cfg["size"], cfg["overlap"])
    raise ValueError(f"splitter desconocido: {cfg['splitter']!r}")


def fragmentacion(chunks: list[str]) -> float:
    """Fracción de chunks cuyo último carácter no-whitespace no es . ! ?"""
    if not chunks:
        return 0.0
    mal = 0
    for c in chunks:
        limpio = c.rstrip()
        if not limpio:
            mal += 1
            continue
        if limpio[-1] not in ".!?":
            mal += 1
    return round(mal / len(chunks), 3)


info("Funciones auxiliares definidas.")


if __name__ == "__main__":
    import gc
    import json
    import time
    import warnings

    import chromadb
    from sentence_transformers import SentenceTransformer

    info("Cargando modelo de embeddings:", MODELO_EMBEDDINGS)
    t0 = time.perf_counter()
    modelo = SentenceTransformer(MODELO_EMBEDDINGS)
    info("Modelo cargado en:", f"{time.perf_counter() - t0:.2f} s")
    client = chromadb.EphemeralClient()

    resultados: list[dict] = []
    detalles_por_config: dict[str, dict] = {}

    for cfg in CONFIGS:
        sep = "=" * 60
        print(f"\n{sep}")
        info(
            f"  {cfg['nombre']}:",
            f"{cfg['splitter']}, size={cfg['size']}, overlap={cfg['overlap']}",
        )
        print(sep)

        # ── Chunking ─────────────────────────────────────────────────────────
        t0 = time.perf_counter()
        chunks = partir(CORPUS, cfg)
        t_chunk = time.perf_counter() - t0
        n = len(chunks)
        lens = [len(c) for c in chunks]
        avg_len = round(sum(lens) / n, 1) if n else 0.0
        frag = fragmentacion(chunks)
        info(
            "  Chunking:",
            f"{n} chunks, avg_len={avg_len}, frag={frag}, t_chunk={t_chunk * 1000:.1f} ms",
        )

        # ── Indexado (encode + add) ──────────────────────────────────────────
        col = client.get_or_create_collection(col_name(cfg["nombre"]))
        t0 = time.perf_counter()
        embeddings = modelo.encode(chunks, convert_to_numpy=True, show_progress_bar=False).tolist()
        col.add(
            documents=chunks,
            embeddings=embeddings,
            ids=[f"{cfg['nombre']}-c{i}" for i in range(n)],
        )
        indexing_s = round(time.perf_counter() - t0, 3)
        info("  Indexado:", f"{indexing_s} s")

        # ── Consultas ────────────────────────────────────────────────────────
        hits1 = hits3 = hits5 = 0
        rr_sum = 0.0
        tiempos_q = []
        veredictos_query = []
        for c in CONSULTAS_GOLD:
            t0 = time.perf_counter()
            q_emb = modelo.encode([c["query"]], convert_to_numpy=True).tolist()
            res = col.query(query_embeddings=q_emb, n_results=min(10, n))
            tiempos_q.append((time.perf_counter() - t0) * 1000)
            docs_rec = res["documents"][0]
            rank_hit = None
            for rank, doc in enumerate(docs_rec, 1):
                if contiene_gold(doc, c["substr"]):
                    rank_hit = rank
                    break
            if rank_hit is not None:
                rr_sum += 1.0 / rank_hit
                if rank_hit <= 1:
                    hits1 += 1
                if rank_hit <= 3:
                    hits3 += 1
                if rank_hit <= 5:
                    hits5 += 1
            veredictos_query.append(
                {
                    "query": c["query"],
                    "substr": c["substr"],
                    "rank_hit": rank_hit,  # None si no aparece en top-10
                }
            )

        N = len(CONSULTAS_GOLD)
        recall1 = round(hits1 / N, 3)
        recall3 = round(hits3 / N, 3)
        recall5 = round(hits5 / N, 3)
        mrr = round(rr_sum / N, 3)
        q_ms = round(sum(tiempos_q) / len(tiempos_q), 2)
        info(
            "  Métricas:",
            f"R@1={recall1}  R@3={recall3}  R@5={recall5}  MRR={mrr}  q_ms={q_ms}",
        )

        resultados.append(
            {
                "nombre": cfg["nombre"],
                "etiqueta": cfg["etiqueta"],
                "color": cfg["color"],
                "splitter": cfg["splitter"],
                "size": cfg["size"],
                "overlap": cfg["overlap"],
                "n_chunks": n,
                "avg_len": avg_len,
                "frag": frag,
                "indexing_s": indexing_s,
                "q_ms": q_ms,
                "recall1": recall1,
                "recall3": recall3,
                "recall5": recall5,
                "mrr": mrr,
            }
        )
        detalles_por_config[cfg["nombre"]] = {
            "chunks": chunks,
            "veredictos": veredictos_query,
        }

        client.delete_collection(col_name(cfg["nombre"]))
        gc.collect()

    # ── Guardar crudos ─────────────────────────────────────────────────────
    with open("results.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "modelo_embeddings": MODELO_EMBEDDINGS,
                "configs": [c["nombre"] for c in CONFIGS],
                "consultas": CONSULTAS_GOLD,
                "resumen": resultados,
                "detalles": detalles_por_config,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    info("Benchmark completado.", "Crudos guardados en results.json")
