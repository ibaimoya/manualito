"""Tests de configuración validada de API."""

import pytest

from api.config import ApiSettings


def test_api_settings_parses_environment_types(monkeypatch):
    """BaseSettings convierte env vars a tipos reales al cargar config."""
    monkeypatch.setenv("OCR_URL", "http://ocr:8000")
    monkeypatch.setenv("RAG_URL", "http://rag:8000")
    monkeypatch.setenv("LLM_URL", "http://llm:8000")
    monkeypatch.setenv("APP_VERSION", "9.8.7")
    monkeypatch.setenv("LLM_UNLOAD_BEFORE_OCR", "false")
    monkeypatch.setenv("PASSWORD_HASH_CONCURRENCY", "4")
    monkeypatch.setenv("CONVERSATION_HISTORY_MESSAGES", "6")
    monkeypatch.setenv("CONVERSATION_CREATE_RATE_LIMIT", "12/minute")
    monkeypatch.setenv("CONVERSATION_MESSAGE_RATE_LIMIT", "45/minute")
    monkeypatch.setenv("PDF_TEXT_MIN_ALNUM_RATIO", "0.7")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_STARTTLS", "true")
    monkeypatch.setenv("EMAIL_VERIFICATION_TOKEN_MINUTES", "60")
    monkeypatch.setenv("PASSWORD_RESET_TOKEN_MINUTES", "15")

    settings = ApiSettings()

    assert settings.app_version == "9.8.7"
    assert settings.llm_unload_before_ocr is False
    assert settings.password_hash_concurrency == 4
    assert settings.conversation_history_messages == 6
    assert settings.conversation_create_rate_limit == "12/minute"
    assert settings.conversation_message_rate_limit == "45/minute"
    assert settings.pdf_text_min_alnum_ratio == pytest.approx(0.7)
    assert settings.smtp_port == 2525
    assert settings.smtp_starttls is True
    assert settings.email_verification_token_minutes == 60
    assert settings.password_reset_token_minutes == 15


def test_cookie_names_keep_host_prefix_only_when_secure():
    """Las constantes derivadas mantienen el prefijo __Host solo con Secure."""
    insecure = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="0.1.0",
        auth_cookie_secure=False,
    )
    secure = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="0.1.0",
        auth_cookie_secure=True,
    )

    assert insecure.resolved_auth_session_cookie_name == "manualito_session"
    assert insecure.resolved_auth_csrf_cookie_name == "manualito_csrf"
    assert secure.resolved_auth_session_cookie_name == "__Host-manualito_session"
    assert secure.resolved_auth_csrf_cookie_name == "__Host-manualito_csrf"
