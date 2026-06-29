import asyncio
import logging
from collections.abc import Mapping, Sequence

import httpx
from pydantic import BaseModel, ConfigDict, Field

from llm import config

logger = logging.getLogger(__name__)

type JsonValue = (
    None | bool | int | float | str | Sequence["JsonValue"] | Mapping[str, "JsonValue"]
)

class OllamaResponseError(ValueError):
    """Ollama devolvió un JSON con forma inesperada."""


class _OllamaModel(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    name: str | None = None


class _OllamaTagsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    models: list[_OllamaModel] = Field(default_factory=list)


class _OllamaGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    response: str = ""


class OllamaClient:
    """Cliente fino para encapsular las llamadas HTTP a Ollama."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def get_model_names(self) -> list[str]:
        async with asyncio.timeout(config.OLLAMA_STARTUP_CHECK_TIMEOUT):
            response = await self.client.get(f"{config.OLLAMA_URL}/api/tags")
        response.raise_for_status()
        tags = _validate_json_response(response, _OllamaTagsResponse)
        return [model.name for model in tags.models if model.name is not None]

    async def generate(self, payload: Mapping[str, JsonValue]) -> str:
        response = await self._post_generate(
            payload,
            time_budget_seconds=config.OLLAMA_TIMEOUT,
        )
        return _validate_json_response(response, _OllamaGenerateResponse).response

    async def preload(self, payload: Mapping[str, JsonValue]) -> None:
        await self._post_generate(
            payload,
            time_budget_seconds=config.OLLAMA_PRELOAD_TIMEOUT,
        )

    async def _post_generate(
        self,
        payload: Mapping[str, JsonValue],
        *,
        time_budget_seconds: float,
    ) -> httpx.Response:
        async with asyncio.timeout(time_budget_seconds):
            response = await self.client.post(
                f"{config.OLLAMA_URL}/api/generate",
                json=payload,
            )
        response.raise_for_status()
        return response


def model_control_payload() -> dict[str, JsonValue]:
    """Construye los campos comunes para elegir modelo y retención en memoria."""
    payload: dict[str, JsonValue] = {"model": config.OLLAMA_MODEL}
    if config.OLLAMA_KEEP_ALIVE:
        payload["keep_alive"] = config.OLLAMA_KEEP_ALIVE
    return payload


def _validate_json_response[ResponseModelT: BaseModel](
    response: httpx.Response,
    model_type: type[ResponseModelT],
) -> ResponseModelT:
    try:
        return model_type.model_validate(response.json())
    except ValueError as validation_err:
        raise OllamaResponseError from validation_err


async def prepare_model_on_startup(client: httpx.AsyncClient) -> None:
    """
    Comprueba y, si procede, precarga el modelo configurado en Ollama.

    No lanza excepciones: cualquier fallo se registra como warning y el
    servicio sigue en pie. La primera request real del usuario dará el error
    informativo si Ollama o el modelo no están disponibles.
    """
    ollama = OllamaClient(client)
    try:
        model_names = await ollama.get_model_names()
    except (TimeoutError, httpx.HTTPError, OllamaResponseError):
        logger.warning(
            "No se pudo verificar la disponibilidad del modelo en %s al arrancar.",
            config.OLLAMA_URL,
            exc_info=True,
        )
        return

    if config.OLLAMA_MODEL not in model_names:
        logger.warning(
            "Modelo '%s' no encontrado en Ollama. Modelos disponibles: %s",
            config.OLLAMA_MODEL,
            model_names,
        )
        return

    logger.info("Modelo '%s' disponible en Ollama.", config.OLLAMA_MODEL)
    if not config.OLLAMA_PRELOAD_ON_STARTUP:
        return

    try:
        await ollama.preload({**model_control_payload(), "stream": False})
    except (TimeoutError, httpx.HTTPError):
        logger.warning(
            "No se pudo precargar el modelo '%s' en Ollama.",
            config.OLLAMA_MODEL,
            exc_info=True,
        )
        return

    logger.info("Modelo '%s' precargado en Ollama.", config.OLLAMA_MODEL)
