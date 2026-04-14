import logging
import os
from io import BytesIO
from typing import Annotated

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Manualito API")

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB
OCR_URL = os.getenv("OCR_URL", "http://ocr:8001")


@app.get("/api/ocr/health")
async def health():
    return {"status": "ok"}


@app.post("/api/ocr")
async def ocr_endpoint(
    image: Annotated[UploadFile, File()],
    format: Annotated[str, Query(pattern="^(json|text)$")] = "json",
):
    """
    Extrae el texto de una imagen mediante OCR.

    Valida la imagen (tamaño y formato), la reenvía al servicio OCR interno
    y devuelve el resultado al cliente en el formato solicitado.

    Args:
        image (UploadFile): Imagen a procesar.
        format (str): 'json' (por defecto) o 'text'.

    Returns:
        JSONResponse: Si format='json', {"lines": [{"text": str, "confidence": float}]}.
        PlainTextResponse: Si format='text', líneas separadas por saltos de línea.

    Raises:
        HTTPException (413): Archivo superior a 20 MB.
        HTTPException (415): El archivo no es una imagen válida.
        HTTPException (500): El servicio OCR ha fallado.
        HTTPException (502): No se ha podido contactar con el servicio OCR.
    """
    chunk = await image.read(MAX_IMAGE_SIZE + 1)
    if len(chunk) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="La imagen no puede superar 20 MB.")

    try:
        with Image.open(BytesIO(chunk)) as img:
            img.verify()
    except Exception:
        raise HTTPException(
            status_code=415,
            detail="El archivo no es una imagen válida.",
        ) from None

    logger.info("Petición OCR recibida: %s (%d bytes)", image.filename, len(chunk))

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OCR_URL}/extract",
                files={"image": (image.filename, chunk, image.content_type)},
                timeout=300.0, # Espera a recibir el JSON hasta 5 minutos.
            )
            response.raise_for_status()
    except httpx.ConnectError:
        logger.error("No se pudo conectar con el servicio OCR en %s.", OCR_URL)
        raise HTTPException(
            status_code=502,
            detail="Servicio OCR no disponible.",
        ) from None
    except httpx.HTTPStatusError as http_err:
        logger.error(
            "El servicio OCR respondió con error %d.",
            http_err.response.status_code,
        )
        raise HTTPException(
            status_code=500,
            detail="Error interno al procesar la imagen con OCR.",
        ) from http_err

    lines = response.json()["lines"]

    if format == "text":
        return PlainTextResponse("\n".join(line["text"] for line in lines))

    return JSONResponse(content={"lines": lines})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Parámetros inválidos en %s: %s", request.url, exc.errors())
    return JSONResponse(status_code=422, content={"detail": "Parámetros inválidos."})
