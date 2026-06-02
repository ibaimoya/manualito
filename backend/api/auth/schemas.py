"""Schemas Pydantic públicos de autenticación."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from api import config
from api.schemas import StrictModel
from database.models.constants import EMAIL_MAX_LENGTH, USERNAME_MAX_LENGTH


class RegisterRequest(StrictModel):
    """Datos necesarios para crear un usuario normal."""

    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)
    username: str = Field(min_length=1, max_length=USERNAME_MAX_LENGTH)
    password: str = Field(
        min_length=config.PASSWORD_MIN_LENGTH,
        max_length=config.PASSWORD_MAX_LENGTH,
    )


class LoginRequest(StrictModel):
    """Credenciales de login con email o username."""

    identifier: str = Field(min_length=1)
    password: str = Field(max_length=config.PASSWORD_MAX_LENGTH)


class UserPublic(StrictModel):
    """Representación segura de usuario expuesta por la API."""

    id: UUID
    email: str
    username: str
    role: str
    status: str
    created_at: datetime
    last_login_at: datetime | None


class AuthResponse(StrictModel):
    """Respuesta de login con usuario y token CSRF para el frontend."""

    user: UserPublic
    csrf_token: str
