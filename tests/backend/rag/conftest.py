import pytest
from fastapi.testclient import TestClient

from rag.main import app


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)
