import asyncio
import logging
from collections.abc import Mapping, Sequence
from typing import NotRequired, TypedDict

import httpx
from pydantic import ValidationError

from api import config
from api.exceptions import (
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
)
from api.ocr.schemas import OcrLinesResponse

logger = logging.getLogger(__name__)

type JsonValue = (
    None | bool | int | float | str | Sequence["JsonValue"] | Mapping[str, "JsonValue"]
)
type JsonObject = dict[str, JsonValue]


class _PostRequestKwargs(TypedDict):
    url: str
    json: NotRequired[Mapping[str, JsonValue]]
    files: NotRequired[dict[str, tuple[str | None, bytes, str | None]]]


async def call_ocr_service(
    *,
    client: httpx.AsyncClient,
    filename: str | None,
    content: bytes,
    content_type: str | None,
) -> list[dict[str, object]]:
    """
    Reenvía una imagen validada al servicio OCR interno.

    Args:
        client (httpx.AsyncClient): Cliente HTTP compartido.
        filename (str | None): Nombre del fichero original.
        content (bytes): Bytes de la imagen.
        content_type (str | None): MIME type declarado por el cliente.

    Returns:
        list[dict[str, object]]: Líneas OCR devueltas por el servicio interno.
    """
    response = await send_request(
        client=client,
        service_name="OCR",
        request_kwargs={
            "url": f"{config.OCR_URL}/extract",
            "files": {"image": (filename, content, content_type)},
        },
        timeout_seconds=config.OCR_SERVICE_TIMEOUT,
        unavailable_detail="Servicio OCR no disponible.",
        internal_detail="Error interno al procesar la imagen con OCR.",
    )
    try:
        return [line.model_dump() for line in OcrLinesResponse.model_validate(response).lines]
    except ValidationError as validation_err:
        raise InternalServiceError(
            "Error interno al procesar la imagen con OCR."
        ) from validation_err


async def post_json(
    *,
    client: httpx.AsyncClient,
    service_name: str,
    url: str,
    payload: Mapping[str, JsonValue],
    unavailable_detail: str,
    internal_detail: str,
) -> JsonObject:
    """
    Envía una petición JSON a un servicio interno y devuelve su payload.

    Args:
        client (httpx.AsyncClient): Cliente HTTP compartido.
        service_name (str): Nombre lógico del servicio destino.
        url (str): Endpoint completo a invocar.
        payload (Mapping[str, JsonValue]): Cuerpo JSON de la petición.
        unavailable_detail (str): Mensaje a devolver si el servicio no responde.
        internal_detail (str): Mensaje a devolver si el servicio responde error.

    Returns:
        JsonObject: JSON decodificado de la respuesta interna.
    """
    return await send_request(
        client=client,
        service_name=service_name,
        request_kwargs={
            "url": url,
            "json": payload,
        },
        timeout_seconds=config.INTERNAL_JSON_TIMEOUT,
        unavailable_detail=unavailable_detail,
        internal_detail=internal_detail,
    )


async def send_request(
    *,
    client: httpx.AsyncClient,
    service_name: str,
    request_kwargs: _PostRequestKwargs,
    timeout_seconds: float,
    unavailable_detail: str,
    internal_detail: str,
) -> JsonObject:
    """
    Ejecuta una llamada POST a un servicio interno con manejo uniforme de errores.

    Args:
        client (httpx.AsyncClient): Cliente HTTP compartido (connection pooling).
        service_name (str): Nombre lógico del servicio.
        request_kwargs (_PostRequestKwargs): Argumentos de ``httpx.AsyncClient.post``.
        timeout_seconds (float): Límite máximo del bloque de petición.
        unavailable_detail (str): Mensaje para errores de conexión.
        internal_detail (str): Mensaje para errores HTTP del servicio.

    Returns:
        JsonObject: JSON de la respuesta exitosa.

    Raises:
        InternalResourceNotFoundError: Si el servicio responde 404.
        InternalServiceUnavailableError: Si no se puede conectar.
        InternalServiceError: Para el resto de errores internos.
    """
    try:
        async with asyncio.timeout(timeout_seconds):
            response = await client.post(**request_kwargs)
        response.raise_for_status()
    except (TimeoutError, httpx.RequestError):
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
            detail = _response_detail(http_err.response, default="Recurso no encontrado.")
            raise InternalResourceNotFoundError(detail) from http_err
        raise InternalServiceError(internal_detail) from http_err

    try:
        body = response.json()
    except ValueError as json_err:
        logger.error("El servicio %s devolvió una respuesta JSON inválida.", service_name)
        raise InternalServiceError(internal_detail) from json_err
    if not isinstance(body, dict):
        logger.error("El servicio %s devolvió un JSON no objeto.", service_name)
        raise InternalServiceError(internal_detail)
    return body


def _response_detail(response: httpx.Response, *, default: str) -> str:
    """Extrae un detail JSON opcional sin confiar en el formato del servicio."""
    try:
        body = response.json()
    except ValueError:
        return default
    if not isinstance(body, dict):
        return default
    detail = body.get("detail")
    return detail if isinstance(detail, str) and detail else default
