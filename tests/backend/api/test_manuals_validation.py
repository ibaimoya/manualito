from io import BytesIO

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from api.exceptions import (
    InvalidImageError,
    InvalidPdfError,
    ManualPageLimitExceededError,
    PdfTooLargeError,
)
from api.manuals import validation as manual_validation


class _FakePdfDocument:
    """PDFium fake para probar tamaños sin depender de un PDF real grande."""

    def __init__(self, _content: bytes) -> None:
        self.page_count = 1

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False

    def __len__(self) -> int:
        return self.page_count


@pytest.mark.anyio
async def test_validate_manual_pdf_accepts_pdf_and_counts_pages():
    """La validacion PDF confirma firma real y cuenta paginas con PDFium."""
    upload = _upload_file(_pdf_bytes(page_count=2), "manual.pdf", "application/pdf")

    result = await manual_validation.validate_manual_pdf(upload)

    assert result.mime_type == "application/pdf"
    assert result.extension == ".pdf"
    assert result.page_count == 2
    assert len(result.sha256) == 64


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_mime_that_does_not_match_pdf():
    """El MIME declarado sigue siendo un filtro rapido, aunque no sea suficiente."""
    upload = _upload_file(_pdf_bytes(page_count=1), "manual.jpg", "image/jpeg")

    with pytest.raises(InvalidPdfError):
        await manual_validation.validate_manual_pdf(upload)


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_invalid_signature():
    """Un contenido que no empieza como PDF no se abre con PDFium."""
    upload = _upload_file(b"not a pdf", "manual.pdf", "application/pdf")

    with pytest.raises(InvalidPdfError):
        await manual_validation.validate_manual_pdf(upload)


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_corrupt_pdf():
    """Un fichero con firma PDF pero cuerpo corrupto se expresa como error estable."""
    upload = _upload_file(b"%PDF-bad", "manual.pdf", "application/pdf")

    with pytest.raises(InvalidPdfError):
        await manual_validation.validate_manual_pdf(upload)


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_too_large_file(monkeypatch):
    """El validador lee solo limite+1 bytes para cortar PDFs enormes pronto."""
    monkeypatch.setattr(manual_validation.config, "MAX_MANUAL_PDF_SIZE", 4)
    upload = _upload_file(b"%PDF-" + b"x" * 20, "manual.pdf", "application/pdf")

    with pytest.raises(PdfTooLargeError):
        await manual_validation.validate_manual_pdf(upload)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("page_count", "accepted"),
    [(29, True), (30, True), (31, False)],
    ids=["29_paginas", "30_paginas", "31_paginas"],
)
async def test_validate_manual_pdf_page_count_bva(monkeypatch, page_count, accepted):
    """BVA del número de páginas: el límite acepta 30 y rechaza 31."""
    monkeypatch.setattr(manual_validation.config, "MAX_MANUAL_PAGES", 30)
    upload = _upload_file(_pdf_bytes(page_count=page_count), "manual.pdf", "application/pdf")

    if accepted:
        result = await manual_validation.validate_manual_pdf(upload)
        assert result.page_count == page_count
    else:
        with pytest.raises(ManualPageLimitExceededError):
            await manual_validation.validate_manual_pdf(upload)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("size", "accepted"),
    [(9, True), (10, True), (11, False)],
    ids=["limite_menos_1", "limite_exacto", "limite_mas_1"],
)
async def test_validate_manual_pdf_size_bva(monkeypatch, size, accepted):
    """BVA del tamaño de PDF: corta justo por encima del límite configurado."""
    monkeypatch.setattr(manual_validation.config, "MAX_MANUAL_PDF_SIZE", 10)
    monkeypatch.setattr(manual_validation.pdfium, "PdfDocument", _FakePdfDocument)
    upload = _upload_file(b"%PDF-" + b"x" * (size - len(b"%PDF-")), "manual.pdf", "application/pdf")

    if accepted:
        result = await manual_validation.validate_manual_pdf(upload)
        assert result.page_count == 1
    else:
        with pytest.raises(PdfTooLargeError):
            await manual_validation.validate_manual_pdf(upload)


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_too_many_pages(monkeypatch):
    """El limite de paginas se aplica tras contar el PDF en backend."""
    monkeypatch.setattr(manual_validation.config, "MAX_MANUAL_PAGES", 1)
    upload = _upload_file(_pdf_bytes(page_count=2), "manual.pdf", "application/pdf")

    with pytest.raises(ManualPageLimitExceededError):
        await manual_validation.validate_manual_pdf(upload)


def test_validate_manual_image_rejects_decompression_bomb(monkeypatch):
    """Pillow puede rechazar imagenes pequenas que explotan a demasiados pixeles."""

    def raise_decompression_bomb(_content):
        raise manual_validation.Image.DecompressionBombError("too many pixels")

    monkeypatch.setattr(manual_validation.Image, "open", raise_decompression_bomb)

    with pytest.raises(InvalidImageError):
        manual_validation._validate_manual_image_content(b"image", "image/jpeg")


def _upload_file(data: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def _pdf_bytes(*, page_count: int) -> bytes:
    content_object_number = page_count + 3
    page_numbers = range(3, content_object_number)
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        (
            b"2 0 obj\n<< /Type /Pages /Kids ["
            + b" ".join(f"{number} 0 R".encode() for number in page_numbers)
            + f"] /Count {page_count} >>\nendobj\n".encode()
        ),
        *[
            (
                f"{number} 0 obj\n"
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] "
                f"/Resources << >> /Contents {content_object_number} 0 R >>\n"
                "endobj\n"
            ).encode()
            for number in page_numbers
        ],
        (
            f"{content_object_number} 0 obj\n"
            "<< /Length 0 >>\nstream\n\nendstream\nendobj\n"
        ).encode(),
    ]
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    body = bytearray(header)
    offsets = [0]
    for item in objects:
        offsets.append(len(body))
        body.extend(item)

    xref_offset = len(body)
    body.extend(f"xref\n0 {len(offsets)}\n".encode())
    body.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        body.extend(f"{offset:010d} 00000 n \n".encode())
    body.extend(
        (
            "trailer\n"
            f"<< /Size {len(offsets)} /Root 1 0 R >>\n"
            "startxref\n"
            f"{xref_offset}\n"
            "%%EOF\n"
        ).encode()
    )
    return bytes(body)
