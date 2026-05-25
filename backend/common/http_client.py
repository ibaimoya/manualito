from typing import Any

import httpx


class HttpClientState:
    """Gestiona el ciclo de vida de un ``httpx.AsyncClient`` compartido."""

    def __init__(self, **client_options: Any):
        self._client_options = client_options
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        """
        Inicializa el cliente HTTP del proceso.

        El cliente se crea una vez durante el lifespan para reutilizar
        conexiones en vez de abrir un socket nuevo por cada request. Si
        ya existía un cliente previo se cierra antes de crear el nuevo,
        para evitar dejar sockets huérfanos cuando el lifespan se ejecuta
        varias veces seguidas (p. ej. en tests que reinician el ciclo).
        """
        if self._client is not None:
            await self._client.aclose()
        self._client = httpx.AsyncClient(**self._client_options)

    async def close(self) -> None:
        """Cierra el cliente HTTP compartido si ya estaba inicializado."""
        if self._client is not None:
            await self._client.aclose()
        self._client = None

    def get_client(self) -> httpx.AsyncClient:
        """Devuelve el cliente HTTP inicializado por el lifespan."""
        if self._client is None:
            raise RuntimeError("El cliente HTTP aún no se ha inicializado.")
        return self._client
