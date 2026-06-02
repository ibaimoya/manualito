"""Configuración validada del servicio API."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT = "30/minute"


class ApiSettings(BaseSettings):
    """Carga variables de entorno de API con tipos validados al arrancar."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    max_image_size: int = 20 * 1024 * 1024
    ocr_url: str
    rag_url: str
    llm_url: str
    llm_unload_before_ocr: bool = True
    llm_unload_timeout: float = Field(default=5.0, gt=0)
    ocr_service_timeout: float = Field(default=300.0, gt=0)
    internal_json_timeout: float = Field(default=120.0, gt=0)
    manual_storage_dir: str = "/app/storage/manual-assets"

    rag_retrieval_multiplier: int = Field(default=4, ge=1)

    bgg_external_search_min_length: int = Field(default=3, ge=1)
    bgg_cache_result_limit: int = Field(default=50, ge=1)
    bgg_max_attempts: int = Field(default=3, ge=0)
    bgg_backoff_seconds: float = Field(default=1.0, ge=0)
    game_search_rate_limit: str = "120/minute"

    conversation_history_messages: int = Field(default=8, ge=0, le=20)
    conversation_create_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT
    conversation_message_rate_limit: str = DEFAULT_INTERACTIVE_ACTION_RATE_LIMIT

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
    auth_password_forgot_rate_limit: str = "5/minute"
    auth_password_reset_rate_limit: str = "10/minute"

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


settings = ApiSettings()

MAX_IMAGE_SIZE = settings.max_image_size
OCR_URL = settings.ocr_url
RAG_URL = settings.rag_url
LLM_URL = settings.llm_url
LLM_UNLOAD_BEFORE_OCR = settings.llm_unload_before_ocr
LLM_UNLOAD_TIMEOUT = settings.llm_unload_timeout
OCR_SERVICE_TIMEOUT = settings.ocr_service_timeout
INTERNAL_JSON_TIMEOUT = settings.internal_json_timeout
MANUAL_STORAGE_DIR = settings.manual_storage_dir
RAG_RETRIEVAL_MULTIPLIER = settings.rag_retrieval_multiplier

BGG_EXTERNAL_SEARCH_MIN_LENGTH = settings.bgg_external_search_min_length
BGG_CACHE_RESULT_LIMIT = settings.bgg_cache_result_limit
BGG_MAX_ATTEMPTS = settings.bgg_max_attempts
BGG_BACKOFF_SECONDS = settings.bgg_backoff_seconds
GAME_SEARCH_RATE_LIMIT = settings.game_search_rate_limit
CONVERSATION_HISTORY_MESSAGES = settings.conversation_history_messages
CONVERSATION_CREATE_RATE_LIMIT = settings.conversation_create_rate_limit
CONVERSATION_MESSAGE_RATE_LIMIT = settings.conversation_message_rate_limit

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
PASSWORD_MIN_LENGTH = settings.password_min_length
PASSWORD_MAX_LENGTH = settings.password_max_length
PASSWORD_HASH_CONCURRENCY = settings.password_hash_concurrency
