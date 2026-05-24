from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from ocr.schemas import ExtractResponse
from ocr.service import extract_image_text

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post(
    "/extract",
    response_model=ExtractResponse,
    responses={
        500: {"description": "Error interno al procesar la imagen con OCR."},
    },
)
async def extract_endpoint(image: Annotated[UploadFile, File()]):
    """
    Extrae el texto de una imagen mediante OCR.

    Returns:
        JSONResponse: {"lines": [{"text": str, "confidence": float}, ...]}
    """
    return JSONResponse(content=await extract_image_text(image))
