from __future__ import annotations

# Máximo de caracteres que el bloque CONTEXTO puede ocupar en el prompt.
# Aproximación conservadora: 20 000 chars ≈ 5 000 tokens en español, lo que
# deja >3 000 tokens del ``num_ctx=8192`` para las instrucciones del sistema,
# la pregunta y la respuesta generada. Si se sube ``num_ctx`` en el servicio
# LLM, habrá que subir también este tope.
MAX_CONTEXT_CHARS = 20_000


def build_prompt(question: str, context_chunks: list[str]) -> tuple[str, int]:
    """
    Construye el prompt enriquecido para Ollama a partir de contexto recuperado.

    Inserta tantos fragmentos como quepan dentro de ``MAX_CONTEXT_CHARS`` para
    no exceder silenciosamente el ``num_ctx`` del modelo. Los fragmentos se
    incluyen por orden de relevancia (tal como llegan), y se descartan los
    últimos si el presupuesto se agota.

    Args:
        question (str): Pregunta formulada por el usuario.
        context_chunks (list[str]): Chunks relevantes recuperados por RAG.

    Returns:
        tuple[str, int]: Prompt final y número de chunks efectivamente incluidos
                         (menor o igual a ``len(context_chunks)``).
    """
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

    context = "\n\n".join(included)

    prompt = (
        "Eres un asistente que explica juegos de mesa en español.\n\n"
        "Responde únicamente con la información del CONTEXTO.\n"
        "Si la respuesta no aparece en el contexto, responde exactamente: "
        '"No aparece en el manual."\n'
        "No inventes reglas ni completes huecos con conocimiento externo.\n\n"
        f"CONTEXTO:\n{context}\n\n"
        f"PREGUNTA:\n{question}\n\n"
        "RESPUESTA:"
    )
    return prompt, len(included)
