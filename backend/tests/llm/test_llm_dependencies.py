import asyncio

import httpx

import llm.dependencies as dependencies


def test_start_http_client_initializes_ollama_client():
    """El servicio LLM inicializa un cliente HTTP compartido hacia Ollama."""
    asyncio.run(dependencies.close_http_client())
    try:
        asyncio.run(dependencies.start_http_client())

        client = dependencies.get_http_client()

        assert isinstance(client, httpx.AsyncClient)
    finally:
        asyncio.run(dependencies.close_http_client())
