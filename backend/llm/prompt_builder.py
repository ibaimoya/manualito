from __future__ import annotations

# Máximo de caracteres que el bloque CONTEXTO puede ocupar en el prompt.
# Aproximación conservadora: 20 000 chars ≈ 5 000 tokens en español, lo que
# deja >3 000 tokens del ``num_ctx=8192`` para las instrucciones del sistema,
# la pregunta y la respuesta generada. Si se sube ``num_ctx`` en el servicio
# LLM, habrá que subir también este tope.
MAX_CONTEXT_CHARS = 20_000
MAX_HISTORY_CHARS = 6_000
MAX_TITLE_CHARS = 80
MIN_TRUNCATED_HISTORY_EDGE_CHARS = 80
TRUNCATED_HISTORY_MARKER = (
    "\n\n[historial recortado: se conserva el inicio y el final]\n\n"
)
COMPACT_TRUNCATED_HISTORY_MARKER = "\n[historial recortado]\n"
TINY_TRUNCATED_HISTORY_MARKER = "[recortado]"


def build_prompt(
    question: str,
    context_chunks: list[str],
    chat_history: list[dict[str, str]] | None = None,
) -> tuple[str, int]:
    """
    Construye el prompt enriquecido para Ollama a partir de contexto recuperado.

    Inserta tantos fragmentos como quepan dentro de ``MAX_CONTEXT_CHARS`` para
    no exceder silenciosamente el ``num_ctx`` del modelo. Los fragmentos se
    incluyen por orden de relevancia (tal como llegan), y se descartan los
    últimos si el presupuesto se agota.

    Args:
        question (str): Pregunta formulada por el usuario.
        context_chunks (list[str]): Chunks relevantes recuperados por RAG.
        chat_history (list[dict[str, str]] | None): Turnos anteriores recientes.

    Returns:
        tuple[str, int]: Prompt final y número de chunks efectivamente incluidos
                         (menor o igual a ``len(context_chunks)``).
    """
    context, included_chunks = _bounded_context(context_chunks)
    history = _bounded_history(chat_history or [])

    prompt = (
        "Eres un asistente que explica juegos de mesa en español, con respuestas "
        "claras, útiles y bien organizadas.\n\n"
        "REGLAS PARA RESPONDER:\n"
        "1. Fuente principal: el CONTEXTO extraído del manual. Si responde la "
        "pregunta, úsalo.\n"
        "2. Inferencia razonable: si la respuesta no aparece literal pero se "
        "deduce con sentido común del contexto, deduce y responde con naturalidad.\n"
        "3. NUNCA listes los puntos que el manual NO cubre.  No escribas "
        '"no aparece en el manual: - punto X - punto Y".  Responde solo lo que '
        "sí puedes responder, con claridad y sin marcar huecos.\n"
        "4. Conocimiento general con cautela: si la pregunta toca un detalle "
        "habitual de un juego conocido y el contexto no lo especifica, puedes "
        "completarlo añadiendo al final una frase entre paréntesis del tipo "
        '"(detalle habitual del juego, no especificado en el manual)".  No '
        "inventes números concretos, valores económicos ni reglas específicas "
        "que cambian entre ediciones.\n"
        "5. Si ni el contexto ni un conocimiento general fiable cubren la "
        "pregunta, responde brevemente: \"El manual no lo explica y prefiero "
        "no inventarlo.\"\n"
        "6. Si hay HISTORIAL, úsalo para entender referencias como \"eso\", "
        "\"la anterior\" o \"cuántas\", pero no inventes reglas que no estén "
        "en el CONTEXTO.\n\n"
        f"HISTORIAL:\n{history or '(sin historial previo)'}\n\n"
        f"CONTEXTO:\n{context}\n\n"
        f"PREGUNTA:\n{question}\n\n"
        "RESPUESTA:"
    )
    return prompt, included_chunks


def build_condense_question_prompt(question: str, chat_history: list[dict[str, str]]) -> str:
    """
    Construye un prompt para convertir una pregunta contextual en independiente.

    Args:
        question (str): Pregunta nueva del usuario.
        chat_history (list[dict[str, str]]): Historial reciente de la conversación.

    Returns:
        str: Prompt para generar una única pregunta de recuperación.
    """
    history = _bounded_history(chat_history)
    return (
        "Reformula la pregunta del usuario como una pregunta independiente para "
        "buscar en manuales de juegos de mesa.\n\n"
        "REGLAS:\n"
        "1. No respondas la pregunta.\n"
        "2. Conserva el idioma del usuario.\n"
        "3. Sustituye referencias del historial por nombres concretos cuando sea útil.\n"
        "4. Devuelve solo la pregunta reformulada, sin comillas ni explicación.\n\n"
        f"HISTORIAL:\n{history}\n\n"
        f"PREGUNTA ACTUAL:\n{question}\n\n"
        "PREGUNTA INDEPENDIENTE:"
    )


def build_title_prompt(messages: list[dict[str, str]]) -> str:
    """
    Construye un prompt para titular una conversación en pocas palabras.

    Args:
        messages (list[dict[str, str]]): Mensajes recientes de la conversación.

    Returns:
        str: Prompt para generar un título corto.
    """
    history = _bounded_history(messages)
    return (
        "Genera un título breve para esta conversación sobre un juego de mesa.\n\n"
        "REGLAS:\n"
        "1. Máximo 6 palabras.\n"
        f"2. Máximo {MAX_TITLE_CHARS} caracteres.\n"
        "3. Sin comillas, punto final ni emojis.\n"
        "4. Devuelve solo el título.\n\n"
        f"CONVERSACIÓN:\n{history}\n\n"
        "TÍTULO:"
    )


def _bounded_context(context_chunks: list[str]) -> tuple[str, int]:
    """Recorta chunks al presupuesto reservado para contexto."""
    included: list[str] = []
    remaining = MAX_CONTEXT_CHARS
    separator_cost = len("\n\n")

    for index, chunk in enumerate(context_chunks):
        piece = f"[Fragmento {index + 1}]\n{chunk.strip()}"
        extra = separator_cost if included else 0
        if len(piece) + extra > remaining:
            break
        included.append(piece)
        remaining -= len(piece) + extra

    return "\n\n".join(included), len(included)


def _bounded_history(messages: list[dict[str, str]]) -> str:
    """Recorta historial empezando por los mensajes más recientes recibidos."""
    lines: list[str] = []
    remaining = MAX_HISTORY_CHARS
    separator_cost = len("\n")

    for message in reversed(messages):
        role = "Usuario" if message.get("role") == "user" else "Asistente"
        content = str(message.get("content", "")).strip()
        if not content:
            continue
        line = f"{role}: {content}"
        extra = separator_cost if lines else 0
        if len(line) + extra > remaining:
            truncated = _truncate_history_line(line, remaining - extra)
            if truncated:
                lines.append(truncated)
            break
        lines.append(line)
        remaining -= len(line) + extra

    return "\n".join(reversed(lines))


def _truncate_history_line(line: str, max_chars: int) -> str:
    """Conserva inicio y final de un mensaje que no cabe entero."""
    if max_chars <= 0:
        return ""
    if len(line) <= max_chars:
        return line

    marker = _truncated_history_marker(max_chars)
    if not marker:
        return line[:max_chars].rstrip()

    available_chars = max_chars - len(marker)
    if available_chars <= 0:
        return marker

    head_chars = max(1, available_chars // 2)
    tail_chars = max(0, available_chars - head_chars)
    if tail_chars == 0:
        return f"{line[:head_chars].rstrip()}{marker}"
    return f"{line[:head_chars].rstrip()}{marker}{line[-tail_chars:].lstrip()}"


def _truncated_history_marker(max_chars: int) -> str:
    """Elige el marcador más claro que cabe en el presupuesto disponible."""
    if max_chars >= len(TRUNCATED_HISTORY_MARKER) + (
        MIN_TRUNCATED_HISTORY_EDGE_CHARS * 2
    ):
        return TRUNCATED_HISTORY_MARKER

    for marker in (COMPACT_TRUNCATED_HISTORY_MARKER, TINY_TRUNCATED_HISTORY_MARKER):
        if max_chars >= len(marker) + 2:
            return marker
    if max_chars >= len(TINY_TRUNCATED_HISTORY_MARKER):
        return TINY_TRUNCATED_HISTORY_MARKER
    return ""
