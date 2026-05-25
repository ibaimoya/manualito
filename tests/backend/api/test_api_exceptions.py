from api.exceptions import (
    ApiError,
    ImageTooLargeError,
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
    InvalidImageError,
)


def test_api_exceptions_inherit_from_api_error():
    """Todas las excepciones del gateway heredan de su base de dominio."""
    assert issubclass(ImageTooLargeError, ApiError)
    assert issubclass(InvalidImageError, ApiError)
    assert issubclass(InternalServiceUnavailableError, ApiError)
    assert issubclass(InternalResourceNotFoundError, ApiError)
    assert issubclass(InternalServiceError, ApiError)
