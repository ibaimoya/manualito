"""Errores de dominio del flujo de autenticación."""


class AuthError(Exception):
    """Clase base para errores esperados de auth."""


class InvalidCredentialsError(AuthError):
    """Credenciales inválidas con respuesta uniforme."""


class DuplicateIdentityError(AuthError):
    """Email o username ya pertenece a un usuario activo."""


class InvalidCsrfTokenError(AuthError):
    """Token CSRF ausente o inválido."""


class AuthenticationRequiredError(AuthError):
    """La request no trae una sesión válida."""


class AdminRequiredError(AuthError):
    """El usuario actual no tiene permisos de administrador."""

