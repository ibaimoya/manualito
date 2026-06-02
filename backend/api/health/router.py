"""Endpoint operacional de comprobación de salud del gateway."""

from fastapi import APIRouter

from common.schemas import HealthResponse

router = APIRouter()


@router.get("/health")
async def health() -> HealthResponse:
    """Comprueba que el gateway está disponible."""
    return HealthResponse()
