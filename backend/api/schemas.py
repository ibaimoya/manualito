"""Schemas Pydantic globales del gateway."""

from pydantic import ConfigDict, Field

from common.schemas import StrictModel as CommonStrictModel


class StrictModel(CommonStrictModel):
    """Base Pydantic estricta para contratos públicos del gateway."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)


class ApiFieldError(StrictModel):
    """Error estable que el frontend puede asociar a un campo de formulario."""

    field: str | None
    code: str
    message: str


class ApiErrorResponse(StrictModel):
    """Respuesta uniforme para errores que el cliente puede representar."""

    detail: str
    errors: list[ApiFieldError] = Field(default_factory=list)
