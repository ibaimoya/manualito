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
    """Divide texto respetando límites naturales antes de cortar por caracteres."""
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
    """Añade contexto repetido entre chunks consecutivos."""
    if overlap <= 0 or len(chunks) < 2:
        return chunks

    overlapped = [chunks[0]]
    for index in range(1, len(chunks)):
        tail = chunks[index - 1][-overlap:]
        overlapped.append(f"{tail}{chunks[index]}".strip())
    return overlapped
