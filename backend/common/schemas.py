"""Schemas Pydantic compartidos por los servicios del backend."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    """Respuesta canónica del endpoint ``/health`` en todos los servicios."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
