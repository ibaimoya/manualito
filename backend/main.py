import tempfile
import os
from io import BytesIO
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from ocr.extractor import extract_text

app = FastAPI(title="Manualito API")

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB


@app.get("/api/ocr/health")
async def health():
    """
    Comprueba el estado del servicio OCR.

    Returns:
        dict: Objeto JSON con el campo 'status' establecido a 'ok' si el servicio está operativo.
    """
    return {"status": "ok"}


@app.post("/api/ocr")
async def ocr_endpoint(
    image: UploadFile = File(...),
    format: str = Query(default="json", pattern="^(json|text)$"),
):
    """
    Extrae el texto de una imagen mediante OCR.

    Recibe una imagen, la persiste temporalmente en disco para procesarla con el
    motor OCR y devuelve las líneas de texto reconocidas junto con su puntuación
    de confianza. El fichero temporal se elimina siempre al finalizar, tanto si
    el procesamiento tiene éxito como si falla.

    Args:
        image (UploadFile): Imagen a procesar. Los bytes deben corresponder a una imagen válida.
        format (str): Formato de la respuesta. 'json' (por defecto) devuelve un objeto
                      con la lista de líneas y sus puntuaciones; 'text' devuelve el texto
                      plano sin metadatos.

    Returns:
        JSONResponse: Si format='json', objeto con la clave 'lines', donde cada elemento
                      contiene 'text' (str) y 'confidence' (float).
        PlainTextResponse: Si format='text', las líneas de texto separadas por saltos de línea.

    Raises:
        HTTPException (415): Si los bytes del archivo no corresponden a una imagen válida.
        HTTPException (413): Si el archivo supera los 20 MB (evita DoS).
    """
    # Comprueba que la imagen no sobrepase el tamaño máximo definido.
    chunk = await image.read(MAX_IMAGE_SIZE + 1)
    if len(chunk) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="La imagen no puede superar 20 MB.")

    # Verificar que los bytes son realmente una imagen válida antes de escribir en disco.
    try:
        with Image.open(BytesIO(chunk)) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=415, detail="El archivo no es una imagen válida.")

    # PaddleOCR necesita un fichero en disco, no acepta bytes directamente.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(chunk)
        tmp_path = tmp.name

    try:
        lines = extract_text(tmp_path)
    finally:
        os.remove(tmp_path)  # Se borra siempre, aunque el OCR falle.
    if format == "text":
        return PlainTextResponse("\n".join(line["text"] for line in lines))

    return JSONResponse(content={"lines": lines})
