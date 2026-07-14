"""Límites de parseo para el formulario multipart de manuales."""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException
from starlette.formparsers import MultiPartException
from starlette.types import Message, Receive, Scope, Send

from api import config
from api.manuals.exceptions import AssetStorageUnavailableError, ManualRequestTooLargeError

_MULTIPART_OVERHEAD_BUDGET = 1024 * 1024
_MAX_UPLOAD_REQUEST_SIZE = config.MAX_MANUAL_TOTAL_SIZE + _MULTIPART_OVERHEAD_BUDGET


class _UploadBodyTooLarge(MultiPartException):
    """Señal interna que hace que Starlette cierre los spools parciales."""


class ManualUploadRoute(APIRoute):
    """Parsea la subida con límites estrictos antes de resolver dependencias."""

    async def handle(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        """Cuenta el cuerpo ASGI real, incluso con chunked o longitud falsa."""
        received_size = 0

        async def limited_receive() -> Message:
            nonlocal received_size
            message = await receive()
            if message["type"] == "http.request":
                received_size += len(message.get("body", b""))
                if received_size > _MAX_UPLOAD_REQUEST_SIZE:
                    raise _UploadBodyTooLarge("Upload body exceeded maximum size.")
            return message

        await super().handle(scope, limited_receive, send)

    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original_route_handler = super().get_route_handler()

        async def limited_multipart_handler(request: Request) -> Response:
            if _declared_body_is_too_large(request):
                raise ManualRequestTooLargeError
            try:
                await request.form(max_files=31, max_fields=4, max_part_size=4096)
            except HTTPException as exc:
                if isinstance(exc.__cause__, _UploadBodyTooLarge) or isinstance(
                    exc.__context__,
                    _UploadBodyTooLarge,
                ):
                    raise ManualRequestTooLargeError from exc
                raise
            except OSError as exc:
                raise AssetStorageUnavailableError from exc
            return await original_route_handler(request)

        return limited_multipart_handler


def _declared_body_is_too_large(request: Request) -> bool:
    raw_content_length = request.headers.get("content-length")
    if raw_content_length is None:
        return False
    try:
        content_length = int(raw_content_length)
    except ValueError:
        return False
    return content_length > _MAX_UPLOAD_REQUEST_SIZE
