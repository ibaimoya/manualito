import asyncio
import logging

import httpx

from llm import config

logger = logging.getLogger(__name__)


class OllamaClient:
    """Cliente fino para encapsular las llamadas HTTP a Ollama."""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_tags(self) -> dict:
        async with asyncio.timeout(config.OLLAMA_STARTUP_CHECK_TIMEOUT):
            response = await self.client.get(f"{config.OLLAMA_URL}/api/tags")
        response.raise_for_status()
        return response.json()

    async def generate(self, payload: dict) -> httpx.Response:
        return await self._post_generate(
            payload,
            time_budget_seconds=config.OLLAMA_TIMEOUT,
        )

    async def preload(self, payload: dict) -> httpx.Response:
        return await self._post_generate(
            payload,
            time_budget_seconds=config.OLLAMA_PRELOAD_TIMEOUT,
        )

    async def _post_generate(
        self,
        payload: dict,
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


def model_control_payload() -> dict[str, str]:
    """Construye los campos comunes para elegir modelo y retención en memoria."""
    payload = {"model": config.OLLAMA_MODEL}
    if config.OLLAMA_KEEP_ALIVE:
        payload["keep_alive"] = config.OLLAMA_KEEP_ALIVE
    return payload


async def prepare_model_on_startup(client: httpx.AsyncClient) -> None:
    """
    Comprueba y, si procede, precarga el modelo configurado en Ollama.

    No lanza excepciones: cualquier fallo se registra como warning y el
    servicio sigue en pie. La primera request real del usuario dará el error
    informativo si Ollama o el modelo no están disponibles.
    """
    ollama = OllamaClient(client)
    try:
        models = (await ollama.get_tags()).get("models", [])
        model_names = [model.get("name") for model in models]
    except (TimeoutError, httpx.HTTPError, ValueError):
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
    except (TimeoutError, httpx.HTTPError, ValueError):
        logger.warning(
            "No se pudo precargar el modelo '%s' en Ollama.",
            config.OLLAMA_MODEL,
            exc_info=True,
        )
        return

    logger.info("Modelo '%s' precargado en Ollama.", config.OLLAMA_MODEL)
