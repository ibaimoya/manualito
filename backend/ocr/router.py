from typing import Annotated

from fastapi import APIRouter, File, UploadFile

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
        500: {"description": "Error interno al procesar la imagen con OCR."},
    },
)
async def extract_endpoint(
    image: Annotated[UploadFile, File()],
) -> ExtractResponse:
    """
    Extrae el texto de una imagen mediante OCR.

    Returns:
        ExtractResponse: ``{"lines": [{"text": str, "confidence": float}, ...]}``.
    """
    return await extract_image_text(image)
