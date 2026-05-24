from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse

from api.dependencies import get_http_client
from api.schemas import QuestionRequest
from api.service import answer_manual_question, create_manual, extract_ocr_lines

router = APIRouter()


@router.get("/health")
async def health():
    """Comprueba que el gateway está disponible."""
    return {"status": "ok"}


@router.post(
    "/api/ocr",
    responses={
        404: {"description": "Recurso no encontrado en el servicio OCR."},
        413: {"description": "La imagen supera 20 MB."},
        415: {"description": "El archivo no es una imagen válida."},
        500: {"description": "Error interno al procesar la imagen con OCR."},
        502: {"description": "Servicio OCR no disponible."},
    },
)
async def ocr_endpoint(
    image: Annotated[UploadFile, File()],
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
    format: Annotated[str, Query(pattern="^(json|text)$")] = "json",
):
    """
    Extrae el texto de una imagen mediante OCR.

    Valida la imagen (tamaño y formato), la reenvía al servicio OCR interno
    y devuelve el resultado al cliente en el formato solicitado.
    """
    lines = await extract_ocr_lines(image=image, client=client)
    if format == "text":
        return PlainTextResponse("\n".join(line["text"] for line in lines))

    return JSONResponse(content={"lines": lines})


@router.post(
    "/api/manuals",
    responses={
        404: {"description": "Recurso no encontrado en un servicio interno."},
        413: {"description": "La imagen supera 20 MB."},
        415: {"description": "El archivo no es una imagen válida."},
        500: {"description": "Error interno al procesar el manual."},
        502: {"description": "Servicio OCR o RAG no disponible."},
    },
)
async def create_manual_handler(
    name: Annotated[str, Form(min_length=1)],
    image: Annotated[UploadFile, File()],
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Crea un manual persistente a partir de una imagen y lo indexa en RAG.

    Args:
        name (str): Nombre legible del manual.
        image (UploadFile): Imagen con el contenido del manual.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        JSONResponse: ``manual_id``, número de chunks indexados y estado.
    """
    return JSONResponse(
        content=await create_manual(name=name, image=image, client=client)
    )


@router.post(
    "/api/manuals/{manual_id}/questions",
    responses={
        404: {"description": "Manual no encontrado."},
        500: {"description": "Error interno al responder la pregunta."},
        502: {"description": "Servicio RAG o LLM no disponible."},
    },
)
async def answer_manual_question_handler(
    manual_id: str,
    payload: QuestionRequest,
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Responde una pregunta sobre un manual previamente indexado.

    Args:
        manual_id (str): Identificador persistente del manual.
        payload (QuestionRequest): Pregunta del usuario.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        JSONResponse: Respuesta final generada por el LLM.
    """
    return JSONResponse(
        content=await answer_manual_question(
            manual_id=manual_id,
            payload=payload,
            client=client,
        )
    )
