from typing import Annotated

from fastapi import APIRouter, Header, Request

from common.schemas import HealthResponse
from ocr.schemas import ExtractResponse
from ocr.service import extract_image_text

router = APIRouter()


@router.get("/health")
async def health() -> HealthResponse:
    """Comprueba que el servicio OCR está disponible."""
    return HealthResponse()


@router.post(
    "/extract",
    responses={
        400: {"description": "Content-Length no coincide con el cuerpo recibido."},
        413: {"description": "La imagen supera el límite interno de 30 MB."},
        415: {"description": "El Content-Type no es una imagen admitida."},
        500: {"description": "Error interno al procesar la imagen con OCR."},
    },
)
async def extract_endpoint(
    request: Request,
    content_type: Annotated[str, Header(min_length=1)],
    content_length: Annotated[int, Header(ge=0)],
) -> ExtractResponse:
    """
    Extrae el texto de una imagen mediante OCR.

    Returns:
        ExtractResponse: ``{"lines": [{"text": str, "confidence": float}, ...]}``.
    """
    return await extract_image_text(
        request,
        content_type=content_type,
        declared_size=content_length,
    )
