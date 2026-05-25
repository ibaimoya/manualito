import logging

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s - %(message)s"


def configure_logging() -> None:
    """Configura el formato base de logging compartido por los servicios."""
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
