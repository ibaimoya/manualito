from unittest.mock import AsyncMock

import pytest
from api_app import app, get_http_client
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def override_http_client():
    """
    Inyecta un ``AsyncMock`` como cliente HTTP en todos los tests de la API.

    ``TestClient`` (sin bloque ``with``) no arranca el ``lifespan`` de FastAPI,
    así que ``_http_client`` queda en ``None`` y ``get_http_client`` lanzaría
    ``RuntimeError`` al resolverse la dependencia —incluso en tests que nunca
    llegan a usar el cliente (p. ej. los que validan errores 415/422 antes de
    la lógica del endpoint). Hacemos el override ``autouse`` para aislar cada
    test del ciclo de vida real; los tests que necesiten configurar respuestas
    pueden pedir el fixture explícitamente.
    """
    mock_client = AsyncMock()
    app.dependency_overrides[get_http_client] = lambda: mock_client
    try:
        yield mock_client
    finally:
        app.dependency_overrides.pop(get_http_client, None)
