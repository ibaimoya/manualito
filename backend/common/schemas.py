"""Schemas Pydantic compartidos por los servicios del backend."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """Base Pydantic estricta para contratos internos y públicos."""

    model_config = ConfigDict(extra="forbid")


class HealthResponse(StrictModel):
    """Respuesta canónica del endpoint ``/health`` en todos los servicios."""

    status: Literal["ok"] = "ok"
