import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("OLLAMA_URL", "http://ollama:11434")


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP síncrono reutilizable para toda la sesión de tests."""
    from llm.main import app

    return TestClient(app)
