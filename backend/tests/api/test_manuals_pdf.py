from pathlib import Path
from uuid import uuid4

import pypdfium2 as pdfium
import pytest
from PIL import Image

from api.assets.storage import LocalAssetStore
from api.manuals import pdf as manual_pdf


@pytest.mark.anyio
async def test_render_pdf_page_outputs_validated_jpeg(tmp_path, monkeypatch):
    """El render PDF produce una imagen JPEG validada para el OCR."""
    monkeypatch.setattr(manual_pdf.config, "PDF_RENDER_DPI", 144)
    monkeypatch.setattr(manual_pdf.config, "MAX_IMAGE_PIXELS", 1_000_000)

    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=uuid4())
    image = await manual_pdf.render_pdf_page(
        _blank_pdf(tmp_path / "source.pdf", width=72, height=72),
        page_number=1,
        batch=batch,
    )

    assert image.mime_type == "image/jpeg"
    assert image.extension == ".jpg"
    assert image.width == 144
    assert image.height == 144
    with image.path.open("rb") as rendered:
        assert rendered.read(2) == b"\xff\xd8"
    with Image.open(image.path) as rendered:
        rendered.load()
        assert rendered.mode == "RGB"
        assert rendered.size == (144, 144)
    assert image.byte_size == image.path.stat().st_size
    assert len(image.sha256) == 64
    assert "content" not in image.__dataclass_fields__


@pytest.mark.anyio
async def test_render_pdf_page_caps_rendered_pixels(tmp_path, monkeypatch):
    """El render baja escala si 300 DPI superaria el limite de pixeles."""
    monkeypatch.setattr(manual_pdf.config, "PDF_RENDER_DPI", 300)
    monkeypatch.setattr(manual_pdf.config, "MAX_IMAGE_PIXELS", 10)

    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=uuid4())
    image = await manual_pdf.render_pdf_page(
        _blank_pdf(tmp_path / "source.pdf", width=72, height=72),
        page_number=1,
        batch=batch,
    )

    assert image.width * image.height <= 10


@pytest.mark.anyio
async def test_extract_pdf_page_text_returns_empty_text_for_blank_page(tmp_path):
    """Una pagina sin capa de texto cae al fallback OCR."""
    text = await manual_pdf.extract_pdf_page_text(
        _blank_pdf(tmp_path / "source.pdf", width=72, height=72),
        page_number=1,
    )

    assert text == ""


def test_pdf_text_is_usable_requires_substantial_clean_text(monkeypatch):
    """La decision PDF-text usa umbrales medibles, no interpretacion semantica."""
    monkeypatch.setattr(manual_pdf.config, "PDF_TEXT_MIN_CHARS", 20)
    monkeypatch.setattr(manual_pdf.config, "PDF_TEXT_MIN_WORDS", 3)
    monkeypatch.setattr(manual_pdf.config, "PDF_TEXT_MAX_BAD_CHAR_RATIO", 0.02)
    monkeypatch.setattr(manual_pdf.config, "PDF_TEXT_MIN_ALNUM_RATIO", 0.5)

    assert manual_pdf.pdf_text_is_usable("Preparacion inicial. Regla uno. Regla dos.")
    assert not manual_pdf.pdf_text_is_usable("Pagina 1")
    assert not manual_pdf.pdf_text_is_usable("Regla uno regla dos regla tres " + "\ufffd" * 10)
    assert not manual_pdf.pdf_text_is_usable("Regla uno regla dos regla tres " + "-/" * 40)


def _blank_pdf(path: Path, *, width: int, height: int) -> Path:
    document = pdfium.PdfDocument.new()
    document.new_page(width, height)
    try:
        document.save(path)
    finally:
        document.close()
    return path
