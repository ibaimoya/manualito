import logging

import httpx

from llm import config

logger = logging.getLogger(__name__)


class OllamaClient:
    """Cliente fino para encapsular las llamadas HTTP a Ollama."""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_tags(self) -> dict:
        response = await self.client.get(
            f"{config.OLLAMA_URL}/api/tags",
            timeout=config.OLLAMA_STARTUP_CHECK_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()

    async def get_ps(self) -> dict:
        response = await self.client.get(
            f"{config.OLLAMA_URL}/api/ps",
            timeout=config.OLLAMA_PS_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()

    async def generate(self, payload: dict) -> httpx.Response:
        response = await self.client.post(
            f"{config.OLLAMA_URL}/api/generate",
            json=payload,
            timeout=config.OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
        return response

    async def unload_model(self) -> None:
        response = await self.client.post(
            f"{config.OLLAMA_URL}/api/generate",
            json={
                "model": config.OLLAMA_MODEL,
                "prompt": "",
                "stream": False,
                "keep_alive": 0,
            },
            timeout=config.OLLAMA_UNLOAD_TIMEOUT,
        )
        response.raise_for_status()


def ollama_model_matches(model_payload: dict) -> bool:
    """Indica si una entrada de Ollama corresponde al modelo configurado."""
    model_names = {model_payload.get("name"), model_payload.get("model")}
    return config.OLLAMA_MODEL in model_names


async def warn_if_model_missing(client: httpx.AsyncClient) -> None:
    """
    Comprueba contra ``/api/tags`` si el modelo configurado existe en Ollama.

    No lanza excepciones: cualquier fallo (Ollama aún no arrancado, timeout,
    etc.) se registra como warning y el servicio sigue en pie. La primera
    request real del usuario dará el error informativo si el modelo no está.
    """
    try:
        models = (await OllamaClient(client).get_tags()).get("models", [])
        model_names = [model.get("name") for model in models]
        if config.OLLAMA_MODEL not in model_names:
            logger.warning(
                "Modelo '%s' no encontrado en Ollama. Modelos disponibles: %s",
                config.OLLAMA_MODEL,
                model_names,
            )
        else:
            logger.info("Modelo '%s' disponible en Ollama.", config.OLLAMA_MODEL)
    except (httpx.HTTPError, ValueError):
        logger.warning(
            "No se pudo verificar la disponibilidad del modelo en %s al arrancar.",
            config.OLLAMA_URL,
            exc_info=True,
        )
