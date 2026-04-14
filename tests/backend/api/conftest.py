import pytest
from api_app import app
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    return TestClient(app)
