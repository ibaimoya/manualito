import logging
import os
import re
import unicodedata
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Annotated
from uuid import uuid4

import httpx
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

from common.filters import install_health_log_filter
from common.log_safety import safe_for_log

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Silencia los sondeos sanos repetidos de /health en los logs de uvicorn.
install_health_log_filter()

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB
OCR_URL = os.environ["OCR_URL"]
RAG_URL = os.environ["RAG_URL"]
LLM_URL = os.environ["LLM_URL"]
LLM_UNLOAD_BEFORE_OCR = os.getenv("LLM_UNLOAD_BEFORE_OCR", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Cliente HTTP compartido por todo el proceso. El lifespan de FastAPI lo
# instancia al arrancar y lo cierra al parar, habilitando connection pooling
# hacia los servicios internos (OCR/RAG/LLM) en vez de abrir un socket nuevo
# por request.
_http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Crea el ``httpx.AsyncClient`` compartido y lo cierra al parar el servicio."""
    global _http_client
    _http_client = httpx.AsyncClient()
    try:
        yield
    finally:
        await _http_client.aclose()
        _http_client = None


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    if _http_client is None:
        raise RuntimeError("El cliente HTTP aún no se ha inicializado.")
    return _http_client


app = FastAPI(title="Manualito API", lifespan=lifespan)


class QuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: Annotated[str, Field(min_length=1)]


@app.get("/health")
async def health():
    """Comprueba que el gateway está disponible."""
    return {"status": "ok"}


@app.post("/api/ocr")
async def ocr_endpoint(
    image: Annotated[UploadFile, File()],
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
    format: Annotated[str, Query(pattern="^(json|text)$")] = "json",
):
    """
    Extrae el texto de una imagen mediante OCR.

    Valida la imagen (tamaño y formato), la reenvía al servicio OCR interno
    y devuelve el resultado al cliente en el formato solicitado.

    Args:
        image (UploadFile): Imagen a procesar.
        format (str): 'json' (por defecto) o 'text'.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        JSONResponse: Si format='json', {"lines": [{"text": str, "confidence": float}]}.
        PlainTextResponse: Si format='text', líneas separadas por saltos de línea.

    Raises:
        HTTPException (413): Archivo superior a 20 MB.
        HTTPException (415): El archivo no es una imagen válida.
        HTTPException (500): El servicio OCR ha fallado.
        HTTPException (502): No se ha podido contactar con el servicio OCR.
    """
    chunk = await _read_and_validate_image(image)

    logger.info(
        "Petición OCR recibida: %s (%d bytes)",
        safe_for_log(image.filename),
        len(chunk),
    )

    try:
        lines = await _call_ocr_service(
            client=client,
            filename=image.filename,
            content=chunk,
            content_type=image.content_type,
        )
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

    if format == "text":
        return PlainTextResponse("\n".join(line["text"] for line in lines))

    return JSONResponse(content={"lines": lines})


@app.post("/api/manuals")
async def create_manual_handler(
    name: Annotated[str, Form(min_length=1)],
    image: Annotated[UploadFile, File()],
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Crea un manual persistente a partir de una imagen y lo indexa en RAG.

    El gateway valida la imagen, llama al servicio OCR y reenvía el texto
    extraído al servicio RAG para su indexación.

    Args:
        name (str): Nombre legible del manual.
        image (UploadFile): Imagen con el contenido del manual.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        JSONResponse: ``manual_id``, número de chunks indexados y estado.

    Raises:
        HTTPException: 413/415 por validación de imagen; 502/500 si falla algún
                       servicio interno.
    """
    chunk = await _read_and_validate_image(image)
    manual_id = _build_manual_id(name)

    try:
        lines = await _call_ocr_service(
            client=client,
            filename=image.filename,
            content=chunk,
            content_type=image.content_type,
        )
        ingest_response = await _post_json(
            client=client,
            service_name="RAG",
            url=f"{RAG_URL}/ingest",
            payload={
                "manual_id": manual_id,
                "ocr_lines": lines,
                "source_page": 1,
            },
            unavailable_detail="Servicio RAG no disponible.",
            internal_detail="Error interno al indexar el manual.",
        )
    except HTTPException:
        raise

    logger.info(
        "Manual indexado correctamente: %s (%d chunks).",
        ingest_response["manual_id"],
        ingest_response["chunks_indexed"],
    )
    return JSONResponse(content=ingest_response)


@app.post("/api/manuals/{manual_id}/questions")
async def answer_manual_question_handler(
    manual_id: str,
    payload: QuestionRequest,
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Responde una pregunta sobre un manual previamente indexado.

    Orquesta la recuperación de contexto en RAG y la generación final en el
    servicio LLM, devolviendo al cliente solo la respuesta limpia.

    Args:
        manual_id (str): Identificador persistente del manual.
        payload (QuestionRequest): Pregunta del usuario.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        JSONResponse: Respuesta final generada por el LLM.

    Raises:
        HTTPException: 404 si el manual no existe; 502/500 si fallan servicios
                       internos.
    """
    try:
        retrieval_response = await _post_json(
            client=client,
            service_name="RAG",
            url=f"{RAG_URL}/retrieve",
            payload={
                "manual_id": manual_id,
                "question": payload.question,
                "top_k": 3,
            },
            unavailable_detail="Servicio RAG no disponible.",
            internal_detail="Error interno al recuperar el contexto del manual.",
        )
        context_chunks = [chunk["text"] for chunk in retrieval_response["chunks"]]
        llm_response = await _post_json(
            client=client,
            service_name="LLM",
            url=f"{LLM_URL}/generate",
            payload={
                "manual_id": manual_id,
                "question": payload.question,
                "context_chunks": context_chunks,
            },
            unavailable_detail="Servicio LLM no disponible.",
            internal_detail="Error interno al generar la respuesta.",
        )
    except HTTPException as exc:
        raise exc

    return JSONResponse(content={"answer": llm_response["answer"]})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Normaliza las respuestas 422 del gateway.

    Args:
        request (Request): Petición original.
        exc (RequestValidationError): Error de validación emitido por FastAPI.

    Returns:
        JSONResponse: Mensaje uniforme de parámetros inválidos.
    """
    logger.warning("Parámetros inválidos en %s: %s", request.url, exc.errors())
    return JSONResponse(status_code=422, content={"detail": "Parámetros inválidos."})


async def _read_and_validate_image(image: UploadFile) -> bytes:
    """
    Lee una imagen subida y valida tamaño y formato.

    Args:
        image (UploadFile): Fichero subido por el cliente.

    Returns:
        bytes: Contenido binario de la imagen validada.

    Raises:
        HTTPException: 413 si supera 20 MB; 415 si no es una imagen válida.
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

    return chunk


async def _call_ocr_service(
    *,
    client: httpx.AsyncClient,
    filename: str | None,
    content: bytes,
    content_type: str | None,
):
    """
    Reenvía una imagen validada al servicio OCR interno.

    Args:
        client (httpx.AsyncClient): Cliente HTTP compartido.
        filename (str | None): Nombre del fichero original.
        content (bytes): Bytes de la imagen.
        content_type (str | None): MIME type declarado por el cliente.

    Returns:
        list[dict]: Líneas OCR devueltas por el servicio interno.
    """
    await _request_llm_unload_if_idle(client)

    response = await _send_request(
        client=client,
        service_name="OCR",
        request_kwargs={
            "url": f"{OCR_URL}/extract",
            "files": {"image": (filename, content, content_type)},
            "timeout": 300.0,
        },
        unavailable_detail="Servicio OCR no disponible.",
        internal_detail="Error interno al procesar la imagen con OCR.",
    )
    return response["lines"]


async def _request_llm_unload_if_idle(client: httpx.AsyncClient) -> None:
    """
    Pide al servicio LLM liberar VRAM antes de OCR si Ollama esta ocioso.

    Es una optimizacion best-effort: cualquier fallo se registra y el OCR
    continua, porque descargar el modelo no forma parte del resultado funcional.
    """
    if not LLM_UNLOAD_BEFORE_OCR:
        return

    try:
        response = await client.post(
            url=f"{LLM_URL}/unload-if-idle",
            timeout=5.0,
        )
        response.raise_for_status()
        logger.info("Liberacion LLM antes de OCR solicitada: %s", response.json())
    except Exception:
        logger.warning(
            "No se pudo solicitar la liberacion del LLM antes de OCR.",
            exc_info=True,
        )


async def _post_json(
    *,
    client: httpx.AsyncClient,
    service_name: str,
    url: str,
    payload: dict,
    unavailable_detail: str,
    internal_detail: str,
) -> dict:
    """
    Envía una petición JSON a un servicio interno y devuelve su payload.

    Args:
        client (httpx.AsyncClient): Cliente HTTP compartido.
        service_name (str): Nombre lógico del servicio destino.
        url (str): Endpoint completo a invocar.
        payload (dict): Cuerpo JSON de la petición.
        unavailable_detail (str): Mensaje a devolver si el servicio no responde.
        internal_detail (str): Mensaje a devolver si el servicio responde error.

    Returns:
        dict: JSON decodificado de la respuesta interna.
    """
    return await _send_request(
        client=client,
        service_name=service_name,
        request_kwargs={
            "url": url,
            "json": payload,
            "timeout": 120.0,
        },
        unavailable_detail=unavailable_detail,
        internal_detail=internal_detail,
    )


async def _send_request(
    *,
    client: httpx.AsyncClient,
    service_name: str,
    request_kwargs: dict,
    unavailable_detail: str,
    internal_detail: str,
) -> dict:
    """
    Ejecuta una llamada POST a un servicio interno con manejo uniforme de errores.

    Args:
        client (httpx.AsyncClient): Cliente HTTP compartido (connection pooling).
        service_name (str): Nombre lógico del servicio.
        request_kwargs (dict): Argumentos a pasar a ``httpx.AsyncClient.post``.
        unavailable_detail (str): Mensaje para errores de conexión.
        internal_detail (str): Mensaje para errores HTTP del servicio.

    Returns:
        dict: JSON de la respuesta exitosa.

    Raises:
        HTTPException: 404 si el servicio responde 404; 502 si no conecta;
                       500 para el resto de errores internos.
    """
    try:
        response = await client.post(**request_kwargs)
        response.raise_for_status()
    except httpx.ConnectError:
        logger.error("No se pudo conectar con el servicio %s.", service_name)
        raise HTTPException(status_code=502, detail=unavailable_detail) from None
    except httpx.HTTPStatusError as http_err:
        status_code = http_err.response.status_code
        logger.error(
            "El servicio %s respondió con error %d.",
            service_name,
            status_code,
        )
        if status_code == 404:
            detail = http_err.response.json().get("detail", "Recurso no encontrado.")
            raise HTTPException(status_code=404, detail=detail) from http_err
        raise HTTPException(status_code=500, detail=internal_detail) from http_err

    return response.json()


def _build_manual_id(name: str) -> str:
    """
    Genera un identificador persistente y legible para un manual.

    Ejemplo:
        ``"Catan Edición Base"`` -> ``"catan-edicion-base-a1b2c3d4"``

    Args:
        name (str): Nombre libre introducido por el usuario.

    Returns:
        str: Slug ASCII con sufijo aleatorio corto.
    """
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-") or "manual"
    return f"{slug}-{uuid4().hex[:8]}"
