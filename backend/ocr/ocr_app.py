import logging
import tempfile
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from extractor import extract_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Manualito OCR Service")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/extract")
async def extract_endpoint(image: UploadFile = File(...)):
    """
    Extrae el texto de una imagen mediante OCR.

    Recibe los bytes de una imagen, los persiste temporalmente en disco
    (PaddleOCR requiere ruta de fichero) y devuelve las líneas reconocidas.

    Returns:
        JSONResponse: {"lines": [{"text": str, "confidence": float}, ...]}

    Raises:
        HTTPException (500): Si el motor OCR falla.
    """
    data = await image.read()
    logger.info("Petición OCR recibida: %s (%d bytes)", image.filename, len(data))

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        lines = extract_text(tmp_path)
    except Exception:
        logger.error("Error durante el OCR de '%s'.", image.filename, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al procesar la imagen con OCR.")
    finally:
        os.remove(tmp_path)

    return JSONResponse(content={"lines": lines})
