"""Endpoints de extracción de texto (OCR) expuestos por el gateway."""

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from api.annotations import HttpClient, ImageUpload
from api.ocr.schemas import OcrLine, OcrLinesResponse
from api.ocr.service import extract_ocr_lines
from api.responses import (
    IMAGE_TOO_LARGE_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    INVALID_IMAGE_RESPONSE,
)

router = APIRouter()

_OCR_RESPONSES: dict[int | str, dict[str, str]] = {
    404: {"description": "Recurso no encontrado en el servicio OCR."},
    **IMAGE_TOO_LARGE_RESPONSE,
    **INVALID_IMAGE_RESPONSE,
    **INTERNAL_ERROR_RESPONSE,
    **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
}


@router.post("/api/ocr", responses=_OCR_RESPONSES)
async def ocr_json(image: ImageUpload, client: HttpClient) -> OcrLinesResponse:
    """
    Extrae el texto de una imagen mediante OCR y devuelve un JSON estructurado.

    Valida la imagen (tamaño y formato), la reenvía al servicio OCR interno
    y devuelve las líneas reconocidas con su confianza asociada.
    """
    lines = await extract_ocr_lines(image=image, client=client)
    return OcrLinesResponse(lines=[OcrLine(**line) for line in lines])


@router.post(
    "/api/ocr/text",
    response_class=PlainTextResponse,
    responses=_OCR_RESPONSES,
)
async def ocr_text(image: ImageUpload, client: HttpClient) -> PlainTextResponse:
    """
    Extrae el texto de una imagen mediante OCR y lo devuelve como ``text/plain``.

    Atajo pensado para clientes que solo necesitan el texto crudo, sin la
    estructura de confianza por línea.
    """
    lines = await extract_ocr_lines(image=image, client=client)
    return PlainTextResponse("\n".join(line["text"] for line in lines))
