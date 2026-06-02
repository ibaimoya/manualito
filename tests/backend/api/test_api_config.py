"""Tests de configuración validada de API."""

from api.config import ApiSettings


def test_api_settings_parses_environment_types(monkeypatch):
    """BaseSettings convierte env vars a tipos reales al cargar config."""
    monkeypatch.setenv("OCR_URL", "http://ocr:8000")
    monkeypatch.setenv("RAG_URL", "http://rag:8000")
    monkeypatch.setenv("LLM_URL", "http://llm:8000")
    monkeypatch.setenv("LLM_UNLOAD_BEFORE_OCR", "false")
    monkeypatch.setenv("PASSWORD_HASH_CONCURRENCY", "4")
    monkeypatch.setenv("CONVERSATION_HISTORY_MESSAGES", "6")
    monkeypatch.setenv("CONVERSATION_CREATE_RATE_LIMIT", "12/minute")
    monkeypatch.setenv("CONVERSATION_MESSAGE_RATE_LIMIT", "45/minute")

    settings = ApiSettings()

    assert settings.llm_unload_before_ocr is False
    assert settings.password_hash_concurrency == 4
    assert settings.conversation_history_messages == 6
    assert settings.conversation_create_rate_limit == "12/minute"
    assert settings.conversation_message_rate_limit == "45/minute"


def test_cookie_names_keep_host_prefix_only_when_secure():
    """Las constantes derivadas mantienen el prefijo __Host solo con Secure."""
    insecure = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        auth_cookie_secure=False,
    )
    secure = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        auth_cookie_secure=True,
    )

    assert insecure.resolved_auth_session_cookie_name == "manualito_session"
    assert insecure.resolved_auth_csrf_cookie_name == "manualito_csrf"
    assert secure.resolved_auth_session_cookie_name == "__Host-manualito_session"
    assert secure.resolved_auth_csrf_cookie_name == "__Host-manualito_csrf"
