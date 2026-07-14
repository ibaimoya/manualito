import tempfile
import tracemalloc
from io import BytesIO
from typing import BinaryIO
from uuid import uuid4

import pypdfium2 as pdfium
import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from api.assets.storage import LocalAssetStore
from api.exceptions import PdfTooLargeError
from api.manuals.exceptions import ManualTooLargeError
from api.manuals.service import _store_images
from api.manuals.validation import validate_manual_pdf

pytestmark = pytest.mark.upload_integration

_PDF_LIMIT = 95_000_000
_WRITE_BLOCK = b"0" * (1024 * 1024)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("byte_size", "accepted"),
    [
        (_PDF_LIMIT - 1, True),
        (_PDF_LIMIT, True),
        (_PDF_LIMIT + 1, False),
    ],
    ids=["limit-minus-one", "exact-limit", "limit-plus-one"],
)
async def test_pdf_actual_size_decimal_boundary(tmp_path, byte_size, accepted):
    """PDFium valida ficheros reales justo alrededor de 95 MB decimales."""
    source = _large_valid_pdf(byte_size)
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=uuid4())
    upload = UploadFile(
        file=source,
        filename="ignored.pdf",
        size=None,
        headers=Headers({"content-type": "application/pdf"}),
    )
    try:
        if accepted:
            result = await validate_manual_pdf(upload, batch=batch)
            assert result.byte_size == byte_size
            assert result.page_count == 1
        else:
            with pytest.raises(PdfTooLargeError):
                await validate_manual_pdf(upload, batch=batch)
            assert not list(batch.path.glob("*.part"))
    finally:
        await batch.abort()


@pytest.mark.anyio
async def test_staging_95_mb_pdf_keeps_python_peak_below_16_mib(tmp_path):
    """La copia incremental no materializa el PDF completo en el heap de Python."""
    source = _large_valid_pdf(_PDF_LIMIT)
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=uuid4())
    try:
        tracemalloc.start()
        staged = await batch.stage(source, max_bytes=_PDF_LIMIT)
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        assert peak < 16 * 1024 * 1024
        assert staged.byte_size == _PDF_LIMIT
        with pdfium.PdfDocument(staged.path) as document:
            assert len(document) == 1
    finally:
        if tracemalloc.is_tracing():
            tracemalloc.stop()
        source.close()
        await batch.abort()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("total_size", "accepted"),
    [
        (_PDF_LIMIT - 1, True),
        (_PDF_LIMIT, True),
        (_PDF_LIMIT + 1, False),
    ],
    ids=["limit-minus-one", "exact-limit", "limit-plus-one"],
)
async def test_valid_image_set_actual_total_decimal_boundary(tmp_path, total_size, accepted):
    """Cuatro JPEG reales aplican el agregado inclusivo de 95 MB."""
    sizes = [30_000_000, 30_000_000, 30_000_000, total_size - 90_000_000]
    uploads = [_large_valid_jpeg(size) for size in sizes]
    batch = await LocalAssetStore(tmp_path / "assets").create_manual_batch(owner_user_id=uuid4())
    try:
        if accepted:
            stored = await _store_images(batch=batch, images=uploads)
            assert sum(item.byte_size for item in stored) == total_size
        else:
            with pytest.raises(ManualTooLargeError):
                await _store_images(batch=batch, images=uploads)
    finally:
        await batch.abort()


def _large_valid_pdf(byte_size: int) -> BinaryIO:
    """Genera incrementalmente un PDF exacto con un stream no referenciado."""
    padding = max(0, byte_size - 1_000)
    for _ in range(10):
        prefix, suffix, footer = _pdf_layout(padding)
        difference = byte_size - (len(prefix) + padding + len(suffix) + len(footer))
        if difference == 0:
            break
        padding += difference
        if padding < 0:
            raise ValueError("El tamaño solicitado es demasiado pequeño para el PDF")
    else:
        raise AssertionError("No convergió el tamaño del fixture PDF")

    source = tempfile.TemporaryFile(mode="w+b")  # noqa: SIM115
    source.write(prefix)
    _write_repeated(source, padding)
    source.write(suffix)
    source.write(footer)
    assert source.tell() == byte_size
    source.seek(0)
    return source


def _large_valid_jpeg(byte_size: int) -> UploadFile:
    encoded = BytesIO()
    Image.new("RGB", (10, 10), color=(20, 40, 60)).save(encoded, format="JPEG")
    source = tempfile.TemporaryFile(mode="w+b")  # noqa: SIM115
    source.write(encoded.getvalue())
    source.truncate(byte_size)
    source.seek(0)
    return UploadFile(
        file=source,
        filename="ignored.jpg",
        size=None,
        headers=Headers({"content-type": "image/jpeg"}),
    )


def _pdf_layout(padding: int) -> tuple[bytes, bytes, bytes]:
    header = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] "
            b"/Resources << >> /Contents 4 0 R >>\nendobj\n"
        ),
        b"4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
        f"5 0 obj\n<< /Length {padding} >>\nstream\n".encode(),
    ]
    offsets: list[int] = []
    prefix = bytearray(header)
    for item in objects:
        offsets.append(len(prefix))
        prefix.extend(item)

    suffix = b"\nendstream\nendobj\n"
    xref_offset = len(prefix) + padding + len(suffix)
    footer = bytearray(b"xref\n0 6\n0000000000 65535 f \n")
    for offset in offsets:
        footer.extend(f"{offset:010d} 00000 n \n".encode())
    footer.extend(
        (f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n").encode()
    )
    return bytes(prefix), suffix, bytes(footer)


def _write_repeated(destination: BinaryIO, byte_count: int) -> None:
    remaining = byte_count
    while remaining:
        chunk = _WRITE_BLOCK[: min(remaining, len(_WRITE_BLOCK))]
        destination.write(chunk)
        remaining -= len(chunk)
