from __future__ import annotations

SEPARATORS = ("\n\n", "\n", ". ", " ", "")
DEFAULT_CHUNK_SIZE = 1024
DEFAULT_OVERLAP = 128


def chunk_text(
    text: str,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
    separators: tuple[str, ...] = SEPARATORS,
) -> list[str]:
    """
    Divide un documento en chunks siguiendo una estrategia recursiva.

    Intenta respetar primero separadores naturales (párrafos, líneas, frases
    y palabras) antes de recurrir al corte por caracteres. Tras el troceado
    aplica un solapamiento prefijando el tail del chunk anterior al siguiente.

    Args:
        text (str): Texto completo del documento a dividir.
        chunk_size (int): Tamaño máximo objetivo de cada chunk en caracteres.
        overlap (int): Número de caracteres que se solapan entre chunks consecutivos.
        separators (tuple[str, ...]): Jerarquía de separadores a probar.

    Returns:
        list[str]: Lista ordenada de chunks no vacíos. Puede ser vacía si el
                   texto de entrada no contiene contenido indexable.
    """
    stripped = text.strip()
    if not stripped:
        return []

    chunks = _split_recursively(
        stripped,
        chunk_size=chunk_size,
        separators=separators,
    )
    return _apply_overlap(chunks, overlap=overlap)


def _split_recursively(
    text: str,
    *,
    chunk_size: int,
    separators: tuple[str, ...],
) -> list[str]:
    """
    Divide un texto en chunks intentando respetar primero sus límites naturales.

    Prueba los separadores en orden jerárquico (párrafos, líneas, frases,
    palabras) y solo recurre al corte bruto por caracteres cuando el fragmento
    sigue siendo demasiado grande. Si una división aún produce partes que no
    caben en ``chunk_size``, vuelve a llamarse con separadores más finos.

    Args:
        text (str): Fragmento de texto a dividir.
        chunk_size (int): Tamaño máximo por chunk.
        separators (tuple[str, ...]): Separadores restantes a considerar.

    Returns:
        list[str]: Chunks generados para el fragmento recibido.
    """
    if len(text) <= chunk_size:
        return [text]

    separator = next((sep for sep in separators if sep == "" or sep in text), "")
    if separator == "":
        return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]

    parts = text.split(separator)
    chunks: list[str] = []
    current = ""
    next_separators = separators[separators.index(separator) + 1 :]

    for part in parts:
        candidate = f"{current}{separator}{part}" if current else part
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(part) <= chunk_size:
            current = part
            continue

        chunks.extend(
            _split_recursively(
                part,
                chunk_size=chunk_size,
                separators=next_separators or ("",),
            )
        )

    if current:
        chunks.append(current)

    return [chunk.strip() for chunk in chunks if chunk.strip()]


def _apply_overlap(chunks: list[str], *, overlap: int) -> list[str]:
    """
    Añade contexto repetido entre chunks consecutivos para no perder información.

    Toma los últimos caracteres de cada chunk y los antepone al siguiente.
    Esto reduce el riesgo de que una regla quede partida justo en la frontera
    entre dos chunks y luego se recupere incompleta durante la búsqueda.

    Args:
        chunks (list[str]): Chunks ya generados y ordenados.
        overlap (int): Número de caracteres del final del chunk anterior que
                       se anteponen al chunk actual.

    Returns:
        list[str]: Chunks con solapamiento aplicado. Si overlap es 0 o la lista
                   tiene menos de dos elementos, se devuelve sin cambios.
    """
    if overlap <= 0 or len(chunks) < 2:
        return chunks

    overlapped = [chunks[0]]
    for index in range(1, len(chunks)):
        tail = chunks[index - 1][-overlap:]
        overlapped.append(f"{tail}{chunks[index]}".strip())
    return overlapped
