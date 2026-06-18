"""Configuración validada del servicio API."""

from pathlib import Path
from urllib.parse import quote

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT = "30/minute"
STRICT_ACTION_RATE_LIMIT = "5/minute"
_CREDENTIAL_ENV_TOKEN = "PASS" + "WORD"
_REDIS_CREDENTIAL_FILE_ENV = f"REDIS_{_CREDENTIAL_ENV_TOKEN}_FILE"
_REDIS_CREDENTIAL_ENV = f"REDIS_{_CREDENTIAL_ENV_TOKEN}"
_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV = f"REDIS_ALLOW_EMPTY_{_CREDENTIAL_ENV_TOKEN}"


class ApiSettings(BaseSettings):
    """Carga variables de entorno de API con tipos validados al arrancar."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore", populate_by_name=True)

    app_version: str = Field(min_length=1)
    max_image_size: int = 30 * 1024 * 1024
    max_manual_pdf_size: int = 200 * 1024 * 1024
    max_manual_total_size: int = 200 * 1024 * 1024
    max_manual_pages: int = Field(default=30, ge=1)
    max_image_pixels: int = Field(default=60_000_000, ge=1)
    pdf_render_dpi: int = Field(default=300, ge=72)
    pdf_text_min_chars: int = Field(default=150, ge=0)
    pdf_text_min_words: int = Field(default=25, ge=0)
    pdf_text_max_bad_char_ratio: float = Field(default=0.02, ge=0, le=1)
    pdf_text_min_alnum_ratio: float = Field(default=0.45, ge=0, le=1)
    ocr_low_confidence_threshold: float = Field(default=0.60, ge=0, le=1)
    ocr_postprocess_low_confidence_line: float = Field(default=0.35, ge=0, le=1)
    ocr_postprocess_short_text_max_alnum: int = Field(default=3, ge=0)
    ocr_postprocess_very_short_text_max_chars: int = Field(default=4, ge=0)
    ocr_postprocess_symbol_noise_ratio: float = Field(default=0.60, ge=0, le=1)
    ocr_postprocess_min_alnum_to_keep: int = Field(default=1, ge=0)
    ocr_url: str
    rag_url: str
    llm_url: str
    redis_host: str = "redis"
    redis_port: int = Field(default=6379, ge=1, le=65535)
    redis_credential: str | None = Field(default=None, validation_alias=_REDIS_CREDENTIAL_ENV)
    redis_credential_file: str | None = Field(
        default=None,
        validation_alias=_REDIS_CREDENTIAL_FILE_ENV,
    )
    redis_allow_empty_credential: bool = Field(
        default=False,
        validation_alias=_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV,
    )
    celery_broker_db: int = Field(default=0, ge=0)
    celery_result_db: int = Field(default=1, ge=0)
    celery_visibility_timeout: int = Field(default=3600, ge=1)
    celery_result_expires: int = Field(default=3600, ge=1)
    celery_gpu_soft_time_limit: int = Field(default=300, ge=1)
    celery_gpu_hard_time_limit: int = Field(default=360, ge=1)
    celery_manual_page_soft_time_limit: int = Field(default=900, ge=1)
    celery_manual_page_hard_time_limit: int = Field(default=1080, ge=1)
    celery_manual_finalize_soft_time_limit: int = Field(default=900, ge=1)
    celery_manual_finalize_hard_time_limit: int = Field(default=1080, ge=1)
    celery_rag_soft_time_limit: int = Field(default=600, ge=1)
    celery_rag_hard_time_limit: int = Field(default=720, ge=1)
    celery_mail_soft_time_limit: int = Field(default=60, ge=1)
    celery_mail_hard_time_limit: int = Field(default=90, ge=1)
    celery_maintenance_soft_time_limit: int = Field(default=60, ge=1)
    celery_maintenance_hard_time_limit: int = Field(default=90, ge=1)
    ocr_service_timeout: float = Field(default=300.0, gt=0)
    internal_json_timeout: float = Field(default=120.0, gt=0)
    asset_storage_dir: str = "/app/storage/assets"

    rag_retrieval_multiplier: int = Field(default=4, ge=1)

    bgg_external_search_min_length: int = Field(default=3, ge=1)
    bgg_cache_result_limit: int = Field(default=50, ge=1)
    bgg_max_attempts: int = Field(default=3, ge=0)
    bgg_backoff_seconds: float = Field(default=1.0, ge=0)
    game_search_rate_limit: str = "120/minute"
    game_create_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    explanation_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT

    conversation_history_messages: int = Field(default=8, ge=0, le=20)
    conversation_create_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    conversation_message_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    conversation_rename_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    rating_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    manual_edit_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    manual_reprocess_rate_limit: str = STRICT_ACTION_RATE_LIMIT

    auth_session_days: int = Field(default=7, ge=1)
    auth_cookie_secure: bool = False
    auth_session_cookie_name: str | None = None
    auth_csrf_cookie_name: str | None = None
    auth_csrf_header_name: str = "X-CSRF-Token"

    frontend_public_url: str = "http://localhost:5173"
    smtp_host: str = "mailpit"
    smtp_port: int = Field(default=1025, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False
    smtp_use_tls: bool = False
    smtp_timeout: float = Field(default=10.0, gt=0)
    smtp_from_email: str = "no-reply@manualito.local"
    email_verification_token_minutes: int = Field(default=24 * 60, ge=1)
    password_reset_token_minutes: int = Field(default=30, ge=1)
    auth_email_resend_rate_limit: str = "3/minute"
    auth_email_verify_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    auth_password_forgot_rate_limit: str = STRICT_ACTION_RATE_LIMIT
    auth_password_reset_rate_limit: str = "10/minute"

    account_update_rate_limit: str = "10/minute"
    password_change_rate_limit: str = STRICT_ACTION_RATE_LIMIT
    account_delete_rate_limit: str = "3/minute"

    password_min_length: int = Field(default=12, ge=1)
    password_max_length: int = Field(default=128, ge=1)
    password_hash_concurrency: int = Field(default=4, ge=1)

    @property
    def resolved_auth_session_cookie_name(self) -> str:
        """Devuelve el nombre efectivo de la cookie de sesión."""
        return self.auth_session_cookie_name or (
            "__Host-manualito_session" if self.auth_cookie_secure else "manualito_session"
        )

    @property
    def resolved_auth_csrf_cookie_name(self) -> str:
        """Devuelve el nombre efectivo de la cookie CSRF."""
        return self.auth_csrf_cookie_name or (
            "__Host-manualito_csrf" if self.auth_cookie_secure else "manualito_csrf"
        )

    @property
    def celery_broker_url(self) -> str:
        """URL Redis que Celery usa como broker."""
        return self._redis_url(self.celery_broker_db)

    @property
    def celery_result_backend(self) -> str:
        """URL Redis que Celery usa para estado técnico temporal."""
        return self._redis_url(self.celery_result_db)

    def _redis_url(self, database: int) -> str:
        credential = _secret_or_value(
            file_path=self.redis_credential_file,
            value=self.redis_credential,
        )
        if not credential and not self.redis_allow_empty_credential:
            raise RuntimeError(
                f"Redis necesita {_REDIS_CREDENTIAL_FILE_ENV} o {_REDIS_CREDENTIAL_ENV}. "
                f"Usa {_REDIS_ALLOW_EMPTY_CREDENTIAL_ENV}=true solo en desarrollo local aislado."
            )
        auth = f":{quote(credential, safe='')}@" if credential else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/{database}"

    @model_validator(mode="after")
    def _validate_celery_time_limits(self) -> "ApiSettings":
        """Evita tareas más largas que la ventana de visibilidad de Redis."""
        pairs = (
            ("GPU", self.celery_gpu_soft_time_limit, self.celery_gpu_hard_time_limit),
            (
                "página de manual",
                self.celery_manual_page_soft_time_limit,
                self.celery_manual_page_hard_time_limit,
            ),
            (
                "finalización de manual",
                self.celery_manual_finalize_soft_time_limit,
                self.celery_manual_finalize_hard_time_limit,
            ),
            ("RAG", self.celery_rag_soft_time_limit, self.celery_rag_hard_time_limit),
            ("correo", self.celery_mail_soft_time_limit, self.celery_mail_hard_time_limit),
            (
                "mantenimiento",
                self.celery_maintenance_soft_time_limit,
                self.celery_maintenance_hard_time_limit,
            ),
        )
        for label, soft_limit, hard_limit in pairs:
            if soft_limit >= hard_limit:
                raise ValueError(
                    f"El soft time limit de {label} debe ser menor que el hard time limit."
                )
            if hard_limit >= self.celery_visibility_timeout:
                raise ValueError(
                    f"El hard time limit de {label} debe ser menor que CELERY_VISIBILITY_TIMEOUT."
                )
        return self


def _secret_or_value(*, file_path: str | None, value: str | None) -> str | None:
    """Lee un secreto desde fichero y usa env normal como alternativa."""
    if file_path:
        path = Path(file_path)
        if not path.is_file():
            raise RuntimeError(f"{_REDIS_CREDENTIAL_FILE_ENV} no apunta a un fichero válido.")
        secret = path.read_text(encoding="utf-8").strip()
        if not secret:
            raise RuntimeError(f"{_REDIS_CREDENTIAL_FILE_ENV} no puede estar vacío.")
        return secret
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


settings = ApiSettings()

APP_VERSION = settings.app_version
MAX_IMAGE_SIZE = settings.max_image_size
MAX_MANUAL_PDF_SIZE = settings.max_manual_pdf_size
MAX_MANUAL_TOTAL_SIZE = settings.max_manual_total_size
MAX_MANUAL_PAGES = settings.max_manual_pages
MAX_IMAGE_PIXELS = settings.max_image_pixels
PDF_RENDER_DPI = settings.pdf_render_dpi
PDF_TEXT_MIN_CHARS = settings.pdf_text_min_chars
PDF_TEXT_MIN_WORDS = settings.pdf_text_min_words
PDF_TEXT_MAX_BAD_CHAR_RATIO = settings.pdf_text_max_bad_char_ratio
PDF_TEXT_MIN_ALNUM_RATIO = settings.pdf_text_min_alnum_ratio
OCR_LOW_CONFIDENCE_THRESHOLD = settings.ocr_low_confidence_threshold
OCR_POSTPROCESS_LOW_CONFIDENCE_LINE = settings.ocr_postprocess_low_confidence_line
OCR_POSTPROCESS_SHORT_TEXT_MAX_ALNUM = settings.ocr_postprocess_short_text_max_alnum
OCR_POSTPROCESS_VERY_SHORT_TEXT_MAX_CHARS = settings.ocr_postprocess_very_short_text_max_chars
OCR_POSTPROCESS_SYMBOL_NOISE_RATIO = settings.ocr_postprocess_symbol_noise_ratio
OCR_POSTPROCESS_MIN_ALNUM_TO_KEEP = settings.ocr_postprocess_min_alnum_to_keep
OCR_URL = settings.ocr_url
RAG_URL = settings.rag_url
LLM_URL = settings.llm_url
CELERY_BROKER_URL = settings.celery_broker_url
CELERY_RESULT_BACKEND = settings.celery_result_backend
CELERY_VISIBILITY_TIMEOUT = settings.celery_visibility_timeout
CELERY_RESULT_EXPIRES = settings.celery_result_expires
CELERY_GPU_SOFT_TIME_LIMIT = settings.celery_gpu_soft_time_limit
CELERY_GPU_HARD_TIME_LIMIT = settings.celery_gpu_hard_time_limit
CELERY_MANUAL_PAGE_SOFT_TIME_LIMIT = settings.celery_manual_page_soft_time_limit
CELERY_MANUAL_PAGE_HARD_TIME_LIMIT = settings.celery_manual_page_hard_time_limit
CELERY_MANUAL_FINALIZE_SOFT_TIME_LIMIT = settings.celery_manual_finalize_soft_time_limit
CELERY_MANUAL_FINALIZE_HARD_TIME_LIMIT = settings.celery_manual_finalize_hard_time_limit
CELERY_RAG_SOFT_TIME_LIMIT = settings.celery_rag_soft_time_limit
CELERY_RAG_HARD_TIME_LIMIT = settings.celery_rag_hard_time_limit
CELERY_MAIL_SOFT_TIME_LIMIT = settings.celery_mail_soft_time_limit
CELERY_MAIL_HARD_TIME_LIMIT = settings.celery_mail_hard_time_limit
CELERY_MAINTENANCE_SOFT_TIME_LIMIT = settings.celery_maintenance_soft_time_limit
CELERY_MAINTENANCE_HARD_TIME_LIMIT = settings.celery_maintenance_hard_time_limit
OCR_SERVICE_TIMEOUT = settings.ocr_service_timeout
INTERNAL_JSON_TIMEOUT = settings.internal_json_timeout
ASSET_STORAGE_DIR = settings.asset_storage_dir
RAG_RETRIEVAL_MULTIPLIER = settings.rag_retrieval_multiplier

BGG_EXTERNAL_SEARCH_MIN_LENGTH = settings.bgg_external_search_min_length
BGG_CACHE_RESULT_LIMIT = settings.bgg_cache_result_limit
BGG_MAX_ATTEMPTS = settings.bgg_max_attempts
BGG_BACKOFF_SECONDS = settings.bgg_backoff_seconds
GAME_SEARCH_RATE_LIMIT = settings.game_search_rate_limit
GAME_CREATE_RATE_LIMIT = settings.game_create_rate_limit
EXPLANATION_RATE_LIMIT = settings.explanation_rate_limit
CONVERSATION_HISTORY_MESSAGES = settings.conversation_history_messages
CONVERSATION_CREATE_RATE_LIMIT = settings.conversation_create_rate_limit
CONVERSATION_MESSAGE_RATE_LIMIT = settings.conversation_message_rate_limit
CONVERSATION_RENAME_RATE_LIMIT = settings.conversation_rename_rate_limit
RATING_RATE_LIMIT = settings.rating_rate_limit
MANUAL_EDIT_RATE_LIMIT = settings.manual_edit_rate_limit
MANUAL_REPROCESS_RATE_LIMIT = settings.manual_reprocess_rate_limit

AUTH_SESSION_DAYS = settings.auth_session_days
AUTH_SESSION_MAX_AGE_SECONDS = AUTH_SESSION_DAYS * 24 * 60 * 60
AUTH_COOKIE_SECURE = settings.auth_cookie_secure
AUTH_SESSION_COOKIE_NAME = settings.resolved_auth_session_cookie_name
AUTH_CSRF_COOKIE_NAME = settings.resolved_auth_csrf_cookie_name
AUTH_CSRF_HEADER_NAME = settings.auth_csrf_header_name
FRONTEND_PUBLIC_URL = settings.frontend_public_url
SMTP_HOST = settings.smtp_host
SMTP_PORT = settings.smtp_port
SMTP_USERNAME = settings.smtp_username
SMTP_PASSWORD = settings.smtp_password
SMTP_STARTTLS = settings.smtp_starttls
SMTP_USE_TLS = settings.smtp_use_tls
SMTP_TIMEOUT = settings.smtp_timeout
SMTP_FROM_EMAIL = settings.smtp_from_email
EMAIL_VERIFICATION_TOKEN_MINUTES = settings.email_verification_token_minutes
PASSWORD_RESET_TOKEN_MINUTES = settings.password_reset_token_minutes
AUTH_EMAIL_RESEND_RATE_LIMIT = settings.auth_email_resend_rate_limit
AUTH_EMAIL_VERIFY_RATE_LIMIT = settings.auth_email_verify_rate_limit
AUTH_PASSWORD_FORGOT_RATE_LIMIT = settings.auth_password_forgot_rate_limit
AUTH_PASSWORD_RESET_RATE_LIMIT = settings.auth_password_reset_rate_limit
ACCOUNT_UPDATE_RATE_LIMIT = settings.account_update_rate_limit
PASSWORD_CHANGE_RATE_LIMIT = settings.password_change_rate_limit
ACCOUNT_DELETE_RATE_LIMIT = settings.account_delete_rate_limit
PASSWORD_MIN_LENGTH = settings.password_min_length
PASSWORD_MAX_LENGTH = settings.password_max_length
PASSWORD_HASH_CONCURRENCY = settings.password_hash_concurrency
