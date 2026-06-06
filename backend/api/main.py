from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from slowapi.middleware import SlowAPIMiddleware

from api import dependencies
from api.auth.router import router as auth_router
from api.conversations.router import router as conversations_router
from api.exceptions import register_exception_handlers
from api.games.router import router as games_router
from api.health.router import router as health_router
from api.manuals.router import router as manuals_router
from api.ocr.router import router as ocr_router
from api.rate_limit import limiter
from common.logging import configure_logging, install_health_log_filter
from database.session import dispose_engine

configure_logging()
install_health_log_filter()

API_VERSION = "0.1.0"
ROOT_STATUS_HTML = (
    '<span class="dot">●</span> <span class="ready">ready</span> '
    f"· /docs · /health · v{API_VERSION}"
)
ROOT_LOGO = (
    "╭┬╮╭─╮╭╮╷╷ ╷╭─╮╷  ╷╶┬╴╭─╮",
    "│││├─┤│╰┤│ │├─┤│  │ │ │ │",
    "╵ ╵╵ ╵╵ ╵╰─╯╵ ╵╰─╴╵ ╵ ╰─╯",
)
ROOT_LOGO_TEXT = "\n".join(ROOT_LOGO)
ROOT_PAGE = f"""\
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manualito API</title>
<style>
:root {{ color-scheme: dark; }}
html {{
  min-height: 100%;
}}
body {{
  min-height: 100dvh;
  margin: 0;
  display: grid;
  place-items: center;
  background: #17151d;
  color: #f7f3ed;
}}
.card {{
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 2.4rem 2rem 1.8rem;
}}
pre {{
  margin: 0;
  font: 400 clamp(15px, 2vw, 20px)/1 ui-monospace, SFMono-Regular,
    Consolas, "Liberation Mono", monospace;
  text-align: center;
  white-space: pre;
}}
.meta {{
  margin: 1.4rem 0 0;
  font: 400 clamp(15px, 2vw, 20px)/1 ui-monospace, SFMono-Regular,
    Consolas, "Liberation Mono", monospace;
}}
.ready {{
  color: #22c55e;
}}
.dot {{
  color: #22c55e;
  font-size: 1.1em;
}}
</style>
</head>
<body>
<main class="card">
<pre>{ROOT_LOGO_TEXT}</pre>
<p class="meta">{ROOT_STATUS_HTML}</p>
</main>
</body>
</html>
"""


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Crea el ``httpx.AsyncClient`` compartido y lo cierra al parar el servicio."""
    await dependencies.start_http_client()
    try:
        yield
    finally:
        try:
            await dependencies.close_http_client()
        finally:
            await dispose_engine()


app = FastAPI(title="Manualito API", version=API_VERSION, lifespan=lifespan)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
register_exception_handlers(app)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root() -> str:
    return ROOT_PAGE


app.include_router(health_router, tags=["Health"])
app.include_router(auth_router, tags=["Authentication"])
app.include_router(ocr_router, tags=["OCR"])
app.include_router(games_router, tags=["Games"])
app.include_router(manuals_router, tags=["Manuals"])
app.include_router(conversations_router, tags=["Conversations"])
