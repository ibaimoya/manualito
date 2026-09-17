"""Errores de dominio del flujo de autenticación."""

from collections.abc import Iterable
from dataclasses import dataclass
from dataclasses import field as dataclass_field


@dataclass(frozen=True, slots=True)
class AuthFieldError:
    """Error de formulario con código estable para la capa HTTP."""

    field: str | None
    code: str
    message: str
    params: dict[str, int] = dataclass_field(default_factory=dict)


class AuthError(Exception):
    """Clase base para errores esperados de auth."""


class AuthFormValidationError(AuthError):
    """Validación de auth que puede pintarse como error de formulario."""

    def __init__(self, errors: AuthFieldError | Iterable[AuthFieldError]):
        normalized_errors = (errors,) if isinstance(errors, AuthFieldError) else tuple(errors)
        self.errors = normalized_errors
        message = "; ".join(error.message for error in normalized_errors) or "Datos inválidos."
        super().__init__(message)


class UsernameValidationError(AuthFormValidationError):
    """El username no cumple las reglas públicas de registro."""

    def __init__(self, code: str, message: str, *, params: dict[str, int] | None = None):
        super().__init__(
            AuthFieldError(field="username", code=code, message=message, params=params or {})
        )


class PasswordValidationError(AuthFormValidationError):
    """La contraseña no cumple la política de registro."""

    def __init__(self, code: str, message: str, *, params: dict[str, int] | None = None):
        super().__init__(
            AuthFieldError(field="password", code=code, message=message, params=params or {})
        )


class InvalidCredentialsError(AuthError):
    """Credenciales inválidas con respuesta uniforme."""


class DuplicateIdentityError(AuthError):
    """Email o username ya pertenece a un usuario activo."""


class InvalidEmailVerificationTokenError(AuthError):
    """Token de verificación ausente, caducado o consumido."""


class InvalidPasswordResetTokenError(AuthError):
    """Token de reset ausente, caducado o consumido."""


class InvalidCsrfTokenError(AuthError):
    """Token CSRF ausente o inválido."""


class AuthenticationRequiredError(AuthError):
    """La request no trae una sesión válida."""


class AdminRequiredError(AuthError):
    """El usuario actual no tiene permisos de administrador."""
