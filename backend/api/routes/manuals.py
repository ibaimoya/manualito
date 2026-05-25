"""Endpoints para la creación de manuales y la consulta sobre los mismos."""

from fastapi import APIRouter

from api.annotations import HttpClient, ImageUpload, ManualName
from api.schemas import AnswerResponse, ManualCreatedResponse, QuestionRequest
from api.service import answer_manual_question, create_manual

router = APIRouter()


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
    name: ManualName,
    image: ImageUpload,
    client: HttpClient,
) -> ManualCreatedResponse:
    """
    Crea un manual persistente a partir de una imagen y lo indexa en RAG.

    El gateway valida la imagen, llama al servicio OCR y reenvía el texto
    extraído al servicio RAG para su indexación.
    """
    payload = await create_manual(name=name, image=image, client=client)
    return ManualCreatedResponse(**payload)


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
    client: HttpClient,
) -> AnswerResponse:
    """
    Responde una pregunta sobre un manual previamente indexado.

    Orquesta la recuperación de contexto en RAG y la generación final en el
    servicio LLM, devolviendo al cliente solo la respuesta limpia.
    """
    result = await answer_manual_question(
        manual_id=manual_id, payload=payload, client=client,
    )
    return AnswerResponse(**result)
