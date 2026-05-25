"""Endpoints de extracción de texto (OCR) expuestos por el gateway."""

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from api.annotations import HttpClient, ImageUpload
from api.schemas import OcrLine, OcrLinesResponse
from api.service import extract_ocr_lines

router = APIRouter()

_OCR_RESPONSES: dict[int | str, dict[str, str]] = {
    404: {"description": "Recurso no encontrado en el servicio OCR."},
    413: {"description": "La imagen supera 20 MB."},
    415: {"description": "El archivo no es una imagen válida."},
    500: {"description": "Error interno al procesar la imagen con OCR."},
    502: {"description": "Servicio OCR no disponible."},
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
