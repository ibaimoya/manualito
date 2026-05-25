import logging

import httpx

from api import config
from api.exceptions import (
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
)

logger = logging.getLogger(__name__)


async def call_ocr_service(
    *,
    client: httpx.AsyncClient,
    filename: str | None,
    content: bytes,
    content_type: str | None,
) -> list[dict]:
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
    await request_llm_unload_if_idle(client)

    response = await send_request(
        client=client,
        service_name="OCR",
        request_kwargs={
            "url": f"{config.OCR_URL}/extract",
            "files": {"image": (filename, content, content_type)},
            "timeout": config.OCR_SERVICE_TIMEOUT,
        },
        unavailable_detail="Servicio OCR no disponible.",
        internal_detail="Error interno al procesar la imagen con OCR.",
    )
    return response["lines"]


async def request_llm_unload_if_idle(client: httpx.AsyncClient) -> None:
    """
    Pide al servicio LLM liberar VRAM antes de OCR si Ollama está ocioso.

    Es una optimización best-effort: cualquier fallo se registra y el OCR
    continúa, porque descargar el modelo no forma parte del resultado funcional.
    """
    if not config.LLM_UNLOAD_BEFORE_OCR:
        return

    try:
        response = await client.post(
            url=f"{config.LLM_URL}/unload-if-idle",
            timeout=config.LLM_UNLOAD_TIMEOUT,
        )
        response.raise_for_status()
        logger.info("Liberación LLM antes de OCR solicitada: %s", response.json())
    except (httpx.HTTPError, ValueError):
        logger.warning(
            "No se pudo solicitar la liberación del LLM antes de OCR.",
            exc_info=True,
        )


async def post_json(
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
    return await send_request(
        client=client,
        service_name=service_name,
        request_kwargs={
            "url": url,
            "json": payload,
            "timeout": config.INTERNAL_JSON_TIMEOUT,
        },
        unavailable_detail=unavailable_detail,
        internal_detail=internal_detail,
    )


async def send_request(
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
        InternalResourceNotFoundError: Si el servicio responde 404.
        InternalServiceUnavailableError: Si no se puede conectar.
        InternalServiceError: Para el resto de errores internos.
    """
    try:
        response = await client.post(**request_kwargs)
        response.raise_for_status()
    except httpx.ConnectError:
        logger.error("No se pudo conectar con el servicio %s.", service_name)
        raise InternalServiceUnavailableError(unavailable_detail) from None
    except httpx.HTTPStatusError as http_err:
        status_code = http_err.response.status_code
        logger.error(
            "El servicio %s respondió con error %d.",
            service_name,
            status_code,
        )
        if status_code == 404:
            detail = http_err.response.json().get("detail", "Recurso no encontrado.")
            raise InternalResourceNotFoundError(detail) from http_err
        raise InternalServiceError(internal_detail) from http_err

    return response.json()
