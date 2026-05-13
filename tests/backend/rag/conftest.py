import pytest
from fastapi.testclient import TestClient
from rag_app import app


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)
