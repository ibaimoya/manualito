"""Tests de configuración validada de API."""

import pytest

from api.config import ApiSettings

_REDIS_CREDENTIAL_KEY = "PASS" + "WORD"
_REDIS_CREDENTIAL_FILE_ENV = f"REDIS_{_REDIS_CREDENTIAL_KEY}_FILE"
_REDIS_CREDENTIAL_ENV = f"REDIS_{_REDIS_CREDENTIAL_KEY}"
_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV = f"REDIS_ALLOW_EMPTY_{_REDIS_CREDENTIAL_KEY}"


def test_api_settings_parses_environment_types(monkeypatch, tmp_path):
    """BaseSettings convierte env vars a tipos reales al cargar config."""
    redis_credential = tmp_path / "redis_credential.txt"
    redis_credential.write_text("redis secret", encoding="utf-8")
    asset_dir = tmp_path / "assets"
    monkeypatch.setenv("OCR_URL", "http://ocr:8000")
    monkeypatch.setenv("RAG_URL", "http://rag:8000")
    monkeypatch.setenv("LLM_URL", "http://llm:8000")
    monkeypatch.setenv("APP_VERSION", "9.8.7")
    monkeypatch.setenv("REDIS_HOST", "redis.local")
    monkeypatch.setenv("REDIS_PORT", "6380")
    monkeypatch.setenv(_REDIS_CREDENTIAL_FILE_ENV, str(redis_credential))
    monkeypatch.setenv("CELERY_BROKER_DB", "2")
    monkeypatch.setenv("CELERY_RESULT_DB", "3")
    monkeypatch.setenv("PASSWORD_HASH_CONCURRENCY", "4")
    monkeypatch.setenv("CONVERSATION_HISTORY_MESSAGES", "6")
    monkeypatch.setenv("CONVERSATION_CREATE_RATE_LIMIT", "12/minute")
    monkeypatch.setenv("CONVERSATION_MESSAGE_RATE_LIMIT", "45/minute")
    monkeypatch.setenv("PDF_TEXT_MIN_ALNUM_RATIO", "0.7")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_STARTTLS", "true")
    monkeypatch.setenv("EMAIL_VERIFICATION_TOKEN_MINUTES", "60")
    monkeypatch.setenv("PASSWORD_RESET_TOKEN_MINUTES", "15")
    monkeypatch.setenv("ASSET_STORAGE_DIR", str(asset_dir))

    settings = ApiSettings()

    assert settings.app_version == "9.8.7"
    assert settings.celery_broker_url == "redis://:redis%20secret@redis.local:6380/2"
    assert settings.celery_result_backend == "redis://:redis%20secret@redis.local:6380/3"
    assert settings.password_hash_concurrency == 4
    assert settings.conversation_history_messages == 6
    assert settings.conversation_create_rate_limit == "12/minute"
    assert settings.conversation_message_rate_limit == "45/minute"
    assert settings.pdf_text_min_alnum_ratio == pytest.approx(0.7)
    assert settings.smtp_port == 2525
    assert settings.smtp_starttls is True
    assert settings.email_verification_token_minutes == 60
    assert settings.password_reset_token_minutes == 15
    assert settings.asset_storage_dir == str(asset_dir)


def test_upload_limits_are_generous_by_default(monkeypatch):
    """Los límites de subida aceptan manuales reales sin desactivar protecciones."""
    monkeypatch.delenv("MAX_IMAGE_SIZE", raising=False)
    monkeypatch.delenv("MAX_MANUAL_PDF_SIZE", raising=False)
    monkeypatch.delenv("MAX_MANUAL_TOTAL_SIZE", raising=False)
    monkeypatch.delenv("MAX_MANUAL_PAGES", raising=False)

    settings = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="0.1.0",
    )

    assert settings.max_image_size == 30 * 1024 * 1024
    assert settings.max_manual_pdf_size == 200 * 1024 * 1024
    assert settings.max_manual_total_size == 200 * 1024 * 1024
    assert settings.max_manual_pages == 30


def test_redis_credential_is_required_by_default(monkeypatch):
    """Redis no arranca sin credencial salvo opt-in local explícito."""
    monkeypatch.delenv(_REDIS_CREDENTIAL_FILE_ENV, raising=False)
    monkeypatch.delenv(_REDIS_CREDENTIAL_ENV, raising=False)
    monkeypatch.delenv(_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV, raising=False)
    settings = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="0.1.0",
    )

    expected_message = f"{_REDIS_CREDENTIAL_FILE_ENV} o {_REDIS_CREDENTIAL_ENV}"
    with pytest.raises(RuntimeError, match=expected_message):
        _ = settings.celery_broker_url


def test_redis_without_credential_mode_requires_explicit_opt_in(monkeypatch):
    """El modo sin contraseña solo queda disponible para desarrollo aislado."""
    monkeypatch.delenv(_REDIS_CREDENTIAL_FILE_ENV, raising=False)
    monkeypatch.delenv(_REDIS_CREDENTIAL_ENV, raising=False)
    settings = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="0.1.0",
        redis_allow_empty_credential=True,
    )

    assert settings.celery_broker_url == "redis://redis:6379/0"


def test_celery_time_limits_must_be_ordered():
    """El soft time limit debe quedar por debajo del hard time limit."""
    with pytest.raises(ValueError, match="soft time limit"):
        ApiSettings(
            ocr_url="http://ocr:8000",
            rag_url="http://rag:8000",
            llm_url="http://llm:8000",
            app_version="0.1.0",
            celery_gpu_soft_time_limit=400,
            celery_gpu_hard_time_limit=300,
        )


def test_celery_hard_time_limits_must_fit_visibility_timeout():
    """Redis no debe reentregar una task antes de que Celery pueda cortarla."""
    with pytest.raises(ValueError, match="CELERY_VISIBILITY_TIMEOUT"):
        ApiSettings(
            ocr_url="http://ocr:8000",
            rag_url="http://rag:8000",
            llm_url="http://llm:8000",
            app_version="0.1.0",
            celery_gpu_hard_time_limit=3600,
        )


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
