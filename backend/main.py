import tempfile
import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from ocr.extractor import extract_text

app = FastAPI(title="Manualito API")


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
        image (UploadFile): Imagen a procesar. Debe tener un Content-Type de tipo 'image/*'.
        format (str): Formato de la respuesta. 'json' (por defecto) devuelve un objeto
                      con la lista de líneas y sus puntuaciones; 'text' devuelve el texto
                      plano sin metadatos.

    Returns:
        JSONResponse: Si format='json', objeto con la clave 'lines', donde cada elemento
                      contiene 'text' (str) y 'confidence' (float).
        PlainTextResponse: Si format='text', las líneas de texto separadas por saltos de línea.

    Raises:
        HTTPException (400): Si el archivo recibido no es una imagen.
    """
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    suffix = os.path.splitext(image.filename)[-1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await image.read())
        tmp_path = tmp.name

    try:
        lines = extract_text(tmp_path)
    finally:
        os.remove(tmp_path)

    if format == "text":
        return PlainTextResponse("\n".join(line["text"] for line in lines))

    return JSONResponse(content={"lines": lines})
