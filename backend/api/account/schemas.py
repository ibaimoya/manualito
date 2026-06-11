"""Schemas públicos de cuenta y perfil."""

from typing import Literal

from pydantic import EmailStr, Field

from api import config
from api.schemas import StrictModel
from database.models.constants import EMAIL_MAX_LENGTH, USERNAME_MAX_LENGTH

AvatarColor = Literal["primary", "accent", "contrast", "success", "warning"]
AvatarFigure = Literal[
    "initials",
    "meeple",
    "dice",
    "crown",
    "flag",
    "sparkle",
    "book",
    "bulb",
    "zap",
    "hourglass",
    "trophy",
    "puzzle",
    "swords",
    "ghost",
    "shield",
    "rocket",
]


class UpdateProfileRequest(StrictModel):
    """Cambios parciales de identidad; los campos ausentes no se tocan."""

    username: str | None = Field(default=None, min_length=1, max_length=USERNAME_MAX_LENGTH)
    email: EmailStr | None = Field(default=None, max_length=EMAIL_MAX_LENGTH)
    avatar_color: AvatarColor | None = None
    avatar_figure: AvatarFigure | None = None


class ChangePasswordRequest(StrictModel):
    """Cambio de contraseña verificando la actual."""

    current_password: str = Field(min_length=1, max_length=config.PASSWORD_MAX_LENGTH)
    new_password: str = Field(
        min_length=config.PASSWORD_MIN_LENGTH,
        max_length=config.PASSWORD_MAX_LENGTH,
    )


class DeleteAccountRequest(StrictModel):
    """Confirmación explícita del borrado escribiendo el propio usuario."""

    username: str = Field(min_length=1, max_length=USERNAME_MAX_LENGTH)


class MeStatsResponse(StrictModel):
    """Actividad agregada del usuario autenticado."""

    games_count: int = Field(ge=0)
    conversations_count: int = Field(ge=0)
    manuals_count: int = Field(ge=0)
