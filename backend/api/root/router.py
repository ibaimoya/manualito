from html import escape
from pathlib import Path
from string import Template

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

ROOT_LOGO = (
    "╭┬╮╭─╮╭╮╷╷ ╷╭─╮╷  ╷╶┬╴╭─╮",
    "│││├─┤│╰┤│ │├─┤│  │ │ │ │",
    "╵ ╵╵ ╵╵ ╵╰─╯╵ ╵╰─╴╵ ╵ ╰─╯",
)
ROOT_TEMPLATE = Template(
    Path(__file__).with_name("index.html").read_text(encoding="utf-8")
)

router = APIRouter()


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root(request: Request) -> str:
    return ROOT_TEMPLATE.substitute(
        logo=escape("\n".join(ROOT_LOGO)),
        version=escape(request.app.version),
    )
