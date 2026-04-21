"""Filtros de logging reutilizables por los servicios FastAPI.

Cada módulo del subpaquete expone una fábrica ``make_*_filter`` y un
instalador ``install_*_filter`` que los servicios invocan al arrancar
para reducir el ruido en los logs de Uvicorn.
"""

from .health_log import install_health_log_filter, make_health_log_filter

__all__ = ["install_health_log_filter", "make_health_log_filter"]
