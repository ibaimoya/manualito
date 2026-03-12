import tempfile
import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from ocr.extractor import extract_text

app = FastAPI(title="Manualito API")


@app.get("/api/ocr/health")
async def health():
    return {"status": "ok"}


@app.post("/api/ocr")
async def ocr_endpoint(
    image: UploadFile = File(...),
    format: str = Query(default="json", pattern="^(json|text)$"),
):
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
