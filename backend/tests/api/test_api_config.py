"""Tests de configuración validada de API."""

from pathlib import Path

import pytest

from api.config import ApiSettings

_REDIS_CREDENTIAL_KEY = "PASS" + "WORD"
_REDIS_CREDENTIAL_FILE_ENV = f"REDIS_{_REDIS_CREDENTIAL_KEY}_FILE"
_REDIS_CREDENTIAL_ENV = f"REDIS_{_REDIS_CREDENTIAL_KEY}"
_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV = f"REDIS_ALLOW_EMPTY_{_REDIS_CREDENTIAL_KEY}"


def test_internal_timeout_supera_la_ventana_de_generacion_del_llm():
    """El límite interno de la API supera el tiempo de generación configurado del LLM."""
    llm_env = Path(__file__).parents[3] / "config" / "llm.env"
    lineas = llm_env.read_text(encoding="utf-8").splitlines()
    ollama_timeout = float(
        next(linea.split("=", 1)[1] for linea in lineas if linea.startswith("OLLAMA_TIMEOUT="))
    )

    assert ApiSettings().internal_json_timeout > ollama_timeout


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
    monkeypatch.setenv("OCR_POSTPROCESS_LOW_CONFIDENCE_LINE", "0.25")
    monkeypatch.setenv("OCR_POSTPROCESS_SHORT_TEXT_MAX_ALNUM", "2")
    monkeypatch.setenv("OCR_POSTPROCESS_VERY_SHORT_TEXT_MAX_CHARS", "3")
    monkeypatch.setenv("OCR_POSTPROCESS_SYMBOL_NOISE_RATIO", "0.5")
    monkeypatch.setenv("OCR_POSTPROCESS_MIN_ALNUM_TO_KEEP", "1")
    monkeypatch.setenv("OCR_CORRECTION_DISCARD_BELOW", "0.45")
    monkeypatch.setenv("OCR_CORRECTION_LLM_BELOW", "0.80")
    monkeypatch.setenv("OLLAMA_CORRECTION_MODEL", "gemma4:e4b")
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
    assert settings.ocr_postprocess_low_confidence_line == pytest.approx(0.25)
    assert settings.ocr_postprocess_short_text_max_alnum == 2
    assert settings.ocr_postprocess_very_short_text_max_chars == 3
    assert settings.ocr_postprocess_symbol_noise_ratio == pytest.approx(0.5)
    assert settings.ocr_postprocess_min_alnum_to_keep == 1
    assert settings.ocr_correction_discard_below == pytest.approx(0.45)
    assert settings.ocr_correction_llm_below == pytest.approx(0.80)
    assert settings.ollama_correction_model == "gemma4:e4b"
    assert settings.smtp_port == 2525
    assert settings.smtp_starttls is True
    assert settings.email_verification_token_minutes == 60
    assert settings.password_reset_token_minutes == 15
    assert settings.asset_storage_dir == str(asset_dir)


def test_upload_limits_use_inclusive_decimal_bytes_by_default(monkeypatch):
    """Los límites de subida aceptan manuales reales sin desactivar protecciones."""
    monkeypatch.delenv("MAX_IMAGE_SIZE", raising=False)
    monkeypatch.delenv("MAX_MANUAL_PDF_SIZE", raising=False)
    monkeypatch.delenv("MAX_MANUAL_TOTAL_SIZE", raising=False)
    monkeypatch.delenv("MAX_MANUAL_PAGES", raising=False)
    monkeypatch.delenv("MAX_IMAGE_PIXELS", raising=False)

    settings = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="1.0.0",
    )

    assert settings.max_image_size == 30_000_000
    assert settings.max_manual_pdf_size == 95_000_000
    assert settings.max_manual_total_size == 95_000_000
    assert settings.max_manual_pages == 30
    assert settings.max_image_pixels == 60_000_000


@pytest.mark.parametrize(
    "field",
    ("max_image_size", "max_manual_pdf_size", "max_manual_total_size"),
)
def test_upload_byte_limits_must_be_positive(field: str) -> None:
    """Una configuración inválida falla al arrancar y no durante una subida."""
    with pytest.raises(ValueError):
        ApiSettings.model_validate(
            {
                "ocr_url": "http://ocr:8000",
                "rag_url": "http://rag:8000",
                "llm_url": "http://llm:8000",
                "app_version": "1.0.0",
                field: 0,
            }
        )


def test_ocr_postprocess_defaults_match_ocr_env(monkeypatch):
    """Los umbrales OCR tienen defaults seguros aunque falte el env externo."""
    monkeypatch.delenv("OCR_POSTPROCESS_LOW_CONFIDENCE_LINE", raising=False)
    monkeypatch.delenv("OCR_POSTPROCESS_SHORT_TEXT_MAX_ALNUM", raising=False)
    monkeypatch.delenv("OCR_POSTPROCESS_VERY_SHORT_TEXT_MAX_CHARS", raising=False)
    monkeypatch.delenv("OCR_POSTPROCESS_SYMBOL_NOISE_RATIO", raising=False)
    monkeypatch.delenv("OCR_POSTPROCESS_MIN_ALNUM_TO_KEEP", raising=False)
    monkeypatch.delenv("OCR_CORRECTION_DISCARD_BELOW", raising=False)
    monkeypatch.delenv("OCR_CORRECTION_LLM_BELOW", raising=False)
    monkeypatch.delenv("OLLAMA_CORRECTION_MODEL", raising=False)

    settings = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="1.0.0",
    )

    assert settings.ocr_postprocess_low_confidence_line == pytest.approx(0.35)
    assert settings.ocr_postprocess_short_text_max_alnum == 3
    assert settings.ocr_postprocess_very_short_text_max_chars == 4
    assert settings.ocr_postprocess_symbol_noise_ratio == pytest.approx(0.60)
    assert settings.ocr_postprocess_min_alnum_to_keep == 1
    assert settings.ocr_correction_discard_below == pytest.approx(0.5)
    assert settings.ocr_correction_llm_below == pytest.approx(0.85)
    assert settings.ollama_correction_model == ""


def test_umbrales_de_correccion_cruzados_fallan_al_arrancar():
    """Una franja LLM vacía por umbrales cruzados se rechaza en el arranque."""
    with pytest.raises(ValueError, match="OCR_CORRECTION_LLM_BELOW"):
        ApiSettings.model_validate(
            {
                "ocr_url": "http://ocr:8000",
                "rag_url": "http://rag:8000",
                "llm_url": "http://llm:8000",
                "app_version": "1.0.0",
                "ocr_correction_discard_below": 0.85,
                "ocr_correction_llm_below": 0.5,
            }
        )


def test_redis_credential_is_required_by_default(monkeypatch):
    """Redis no arranca sin credencial salvo opt-in local explícito."""
    monkeypatch.delenv(_REDIS_CREDENTIAL_FILE_ENV, raising=False)
    monkeypatch.delenv(_REDIS_CREDENTIAL_ENV, raising=False)
    monkeypatch.delenv(_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV, raising=False)
    settings = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="1.0.0",
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
        app_version="1.0.0",
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
            app_version="1.0.0",
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
            app_version="1.0.0",
            celery_gpu_hard_time_limit=3600,
        )


def test_cookie_names_keep_host_prefix_only_when_secure():
    """Las constantes derivadas mantienen el prefijo __Host solo con Secure."""
    insecure = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="1.0.0",
        auth_cookie_secure=False,
    )
    secure = ApiSettings(
        ocr_url="http://ocr:8000",
        rag_url="http://rag:8000",
        llm_url="http://llm:8000",
        app_version="1.0.0",
        auth_cookie_secure=True,
    )

    assert insecure.resolved_auth_session_cookie_name == "manualito_session"
    assert insecure.resolved_auth_csrf_cookie_name == "manualito_csrf"
    assert secure.resolved_auth_session_cookie_name == "__Host-manualito_session"
    assert secure.resolved_auth_csrf_cookie_name == "__Host-manualito_csrf"


def test_smtp_secret_file_and_reply_to_from_environment(monkeypatch, tmp_path):
    """Lee el archivo real indicado por el entorno sin mostrar la credencial."""
    secret_file = tmp_path / "smtp.txt"
    secret_file.write_text("  test-mail-credential\n", encoding="utf-8")
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("SMTP_PASSWORD_FILE", str(secret_file))
    monkeypatch.setenv("SMTP_REPLY_TO", "support@example.com")

    settings = ApiSettings()

    assert settings.resolved_smtp_password == "test-mail-credential"
    assert settings.smtp_reply_to == "support@example.com"
    assert "test-mail-credential" not in repr(settings)
    assert "test-mail-credential" not in settings.model_dump_json()


def test_smtp_password_from_environment_is_not_displayed(monkeypatch):
    """La credencial directa tampoco aparece al representar la configuración."""
    monkeypatch.delenv("SMTP_PASSWORD_FILE", raising=False)
    monkeypatch.setenv("SMTP_PASSWORD", "test-direct-credential")

    settings = ApiSettings()

    assert settings.resolved_smtp_password == "test-direct-credential"
    assert "test-direct-credential" not in repr(settings)
    assert "test-direct-credential" not in settings.model_dump_json()


def test_smtp_rejects_two_credential_sources(tmp_path):
    """Un archivo y una variable no pueden elegir credenciales distintas."""
    with pytest.raises(ValueError, match="solo SMTP_PASSWORD_FILE o SMTP_PASSWORD") as error:
        ApiSettings(
            smtp_password="test-conflicting-credential",
            smtp_password_file=str(tmp_path / "smtp.txt"),
        )

    assert "test-conflicting-credential" not in str(error.value)
    assert "test-conflicting-credential" not in repr(error.value)


@pytest.mark.parametrize(
    "file_kind", ["missing", "directory", "empty", "whitespace", "invalid_utf8"],
)
def test_smtp_rejects_unusable_secret_file(tmp_path, file_kind):
    """Un secreto inaccesible o vacío impide arrancar el envío."""
    secret_file = tmp_path / "smtp.txt"
    if file_kind == "directory":
        secret_file.mkdir()
    elif file_kind == "empty":
        secret_file.touch()
    elif file_kind == "whitespace":
        secret_file.write_text(" \n\t", encoding="utf-8")
    elif file_kind == "invalid_utf8":
        secret_file.write_bytes(b"\xff\xfe")

    with pytest.raises(ValueError, match="SMTP_PASSWORD_FILE"):
        ApiSettings(smtp_password=None, smtp_password_file=str(secret_file))


def test_smtp_secret_is_hidden_when_another_setting_fails():
    """Un error ajeno al correo no incluye su credencial en el diagnóstico."""
    with pytest.raises(ValueError, match="greater than or equal to 1") as error:
        ApiSettings(smtp_password="test-invalid-settings-credential", smtp_port=0)

    assert "test-invalid-settings-credential" not in str(error.value)
    assert "test-invalid-settings-credential" not in repr(error.value)


def test_smtp_rejects_two_tls_modes():
    """TLS implícito y STARTTLS son modos alternativos."""
    with pytest.raises(ValueError, match="SMTP_USE_TLS y SMTP_STARTTLS"):
        ApiSettings(smtp_use_tls=True, smtp_starttls=True)


def test_smtp_defaults_keep_local_mailpit(monkeypatch):
    """El entorno local sigue capturando los correos sin credenciales ni TLS."""
    for name in (
        "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_PASSWORD_FILE",
        "SMTP_STARTTLS", "SMTP_USE_TLS", "SMTP_FROM_EMAIL", "SMTP_REPLY_TO",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = ApiSettings()

    assert settings.smtp_host == "mailpit"
    assert settings.smtp_port == 1025
    assert settings.smtp_username is None
    assert settings.resolved_smtp_password is None
    assert settings.smtp_starttls is False
    assert settings.smtp_use_tls is False
    assert settings.smtp_from_email == "no-reply@manualito.local"
    assert settings.smtp_reply_to is None
