import logging
import re
import unicodedata
from io import BytesIO
from uuid import uuid4

import httpx
from fastapi import UploadFile
from PIL import Image

from api import client as internal_client
from api import config
from api.exceptions import ImageTooLargeError, InvalidImageError
from api.schemas import QuestionRequest
from common.log_safety import safe_for_log

logger = logging.getLogger(__name__)


async def extract_ocr_lines(
    *,
    image: UploadFile,
    client: httpx.AsyncClient,
) -> list[dict]:
    """
    Valida una imagen subida y delega su extracción en el servicio OCR.

    Args:
        image (UploadFile): Imagen subida por el cliente.
        client (httpx.AsyncClient): Cliente HTTP compartido.

    Returns:
        list[dict]: Líneas OCR devueltas por el servicio OCR interno.
    """
    chunk = await validate_image(image)
    logger.info(
        "Petición OCR recibida: %s (%d bytes)",
        safe_for_log(image.filename),
        len(chunk),
    )
    return await internal_client.call_ocr_service(
        client=client,
        filename=image.filename,
        content=chunk,
        content_type=image.content_type,
    )


async def create_manual(
    *,
    name: str,
    image: UploadFile,
    client: httpx.AsyncClient,
) -> dict:
    """
    Crea un manual persistente a partir de una imagen y lo indexa en RAG.

    El gateway valida la imagen, llama al servicio OCR y reenvía el texto
    extraído al servicio RAG para su indexación.
    """
    chunk = await validate_image(image)
    manual_id = build_manual_id(name)

    lines = await internal_client.call_ocr_service(
        client=client,
        filename=image.filename,
        content=chunk,
        content_type=image.content_type,
    )
    ingest_response = await internal_client.post_json(
        client=client,
        service_name="RAG",
        url=f"{config.RAG_URL}/ingest",
        payload={
            "manual_id": manual_id,
            "ocr_lines": lines,
            "source_page": 1,
        },
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail="Error interno al indexar el manual.",
    )

    logger.info(
        "Manual indexado correctamente: %s (%d chunks).",
        ingest_response["manual_id"],
        ingest_response["chunks_indexed"],
    )
    return ingest_response


async def answer_manual_question(
    *,
    manual_id: str,
    payload: QuestionRequest,
    client: httpx.AsyncClient,
) -> dict:
    """
    Responde una pregunta sobre un manual previamente indexado.

    Orquesta la recuperación de contexto en RAG y la generación final en el
    servicio LLM, devolviendo al cliente solo la respuesta limpia.
    """
    retrieval_response = await internal_client.post_json(
        client=client,
        service_name="RAG",
        url=f"{config.RAG_URL}/retrieve",
        payload={
            "manual_id": manual_id,
            "question": payload.question,
            "top_k": 3,
        },
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail="Error interno al recuperar el contexto del manual.",
    )
    context_chunks = [chunk["text"] for chunk in retrieval_response["chunks"]]
    llm_response = await internal_client.post_json(
        client=client,
        service_name="LLM",
        url=f"{config.LLM_URL}/generate",
        payload={
            "manual_id": manual_id,
            "question": payload.question,
            "context_chunks": context_chunks,
        },
        unavailable_detail="Servicio LLM no disponible.",
        internal_detail="Error interno al generar la respuesta.",
    )

    return {"answer": llm_response["answer"]}


async def validate_image(image: UploadFile) -> bytes:
    """
    Lee una imagen subida y valida el tamaño y formato.

    Args:
        image (UploadFile): Fichero subido por el cliente.

    Returns:
        bytes: Contenido binario de la imagen validada.

    Raises:
        ImageTooLargeError: Si supera 20 MB.
        InvalidImageError: Si no es una imagen válida.
    """
    chunk = await image.read(config.MAX_IMAGE_SIZE + 1)
    if len(chunk) > config.MAX_IMAGE_SIZE:
        logger.warning(
            "Imagen rechazada (413) — fichero: %s, tamaño: %d bytes.",
            safe_for_log(image.filename),
            len(chunk),
        )
        raise ImageTooLargeError

    try:
        with Image.open(BytesIO(chunk)) as img:
            img.verify()
    except Exception as exc:
        logger.warning(
            "Imagen rechazada (415) — fichero: %s, motivo: %s.",
            safe_for_log(image.filename),
            exc,
        )
        raise InvalidImageError from None

    return chunk


def build_manual_id(name: str) -> str:
    """
    Genera un identificador persistente y legible para un manual.

    Ejemplo:
        ``"Catan Edición Base"`` -> ``"catan-edicion-base-a1b2c3d4"``

    Args:
        name (str): Nombre libre introducido por el usuario.

    Returns:
        str: Slug ASCII con sufijo aleatorio corto.
    """
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-") or "manual"
    return f"{slug}-{uuid4().hex[:8]}"
