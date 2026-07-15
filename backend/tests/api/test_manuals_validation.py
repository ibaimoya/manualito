import base64
import hashlib
import io
import struct
import tempfile
import zlib
from uuid import uuid4

import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from api import config
from api.assets.storage import LocalAssetStore
from api.exceptions import (
    ImageTooLargeError,
    InvalidImageError,
    InvalidPdfError,
    ManualPageLimitExceededError,
    PdfTooLargeError,
)
from api.manuals import validation as manual_validation

_PDFIUM_ENCRYPTED_R2_BASE64 = (
    "JVBERi0xLjcKJeLjz9MKMSAwIG9iaiAKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBS"
    "Cj4+CmVuZG9iaiAKMiAwIG9iaiAKPDwKL0tpZHMgWzMgMCBSXQovVHlwZSAvUGFnZXMKL01l"
    "ZGlhQm94IFswIDAgMjAwIDIwMF0KL0NvdW50IDEKPj4KZW5kb2JqIAozIDAgb2JqIAo8PAov"
    "UmVzb3VyY2VzIAo8PAovRm9udCAKPDwKL0YyIDQgMCBSCi9GMSA1IDAgUgo+Pgo+PgovQ29u"
    "dGVudHMgNiAwIFIKL1BhcmVudCAyIDAgUgovVHlwZSAvUGFnZQovTWVkaWFCb3ggWzAgMCAy"
    "MDAgMjAwXQo+PgplbmRvYmogCjUgMCBvYmogCjw8Ci9TdWJ0eXBlIC9UeXBlMQovVHlwZSAv"
    "Rm9udAovQmFzZUZvbnQgL1RpbWVzLVJvbWFuCj4+CmVuZG9iaiAKNCAwIG9iaiAKPDwKL1N1"
    "YnR5cGUgL1R5cGUxCi9UeXBlIC9Gb250Ci9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9i"
    "aiAKNiAwIG9iaiAKPDwKL0xlbmd0aCA4Mwo+PgpzdHJlYW0KwCwrm0a+wKa6nWpdFnEpTNnc"
    "/Ar4TvH1RYAljX0TPa6fTE0lczZQfs1ji1sg6UY0vaJ1ML3rjHLZkWB2gCtUrycY3NSFi2s"
    "Z4wqClzf8XoCa5j4KZW5kc3RyZWFtIAplbmRvYmogCjcgMCBvYmogCjw8Ci9WIDEKL0ZpbHRl"
    "ciAvU3RhbmRhcmQKL1UgKEIZvVvqHwRnguaYES1rgLJcKV5LGeWPhpBIaABVXGZZ5j4pCi9S"
    "IDIKL1AgLTY0Ci9PIChltNFENMhDSusuLd05IuMjP0/fSlJ/F5o6XFzKBWPWJJ4pCj4+CmVu"
    "ZG9iaiB4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAK"
    "MDAwMDAwMDA2NiAwMDAwMCBuIAowMDAwMDAwMTQ5IDAwMDAwIG4gCjAwMDAwMDAzNjMgMDAw"
    "MDAgbiAKMDAwMDAwMDI4OSAwMDAwMCBuIAowMDAwMDAwNDM1IDAwMDAwIG4gCjAwMDAwMDA1"
    "NzEgMDAwMDAgbiAKdHJhaWxlcgoKPDwKL0lEIFs8MmI3NzhkZTFiY2VmMTczM2IzNWU2ODA4"
    "ODI4MTI0MDk+PDBmZWM5M2M1NmI4MTE1ZjE4NzE4OWY4NmEwNzZjYjgxPl0KL0VuY3J5cHQg"
    "NyAwIFIKL1Jvb3QgMSAwIFIKL1NpemUgOAo+PgpzdGFydHhyZWYKNzA3CiUlRU9GCg=="
)


@pytest.mark.anyio
async def test_validate_manual_image_stages_and_validates_a_real_jpeg(
    tmp_path,
    valid_jpeg_bytes,
):
    """La validación devuelve un descriptor por ruta y nunca duplica los bytes."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(valid_jpeg_bytes, "camera-name.jpg", "image/jpeg")

    result = await manual_validation.validate_manual_image(upload, batch=batch)

    assert result.path.is_file()
    assert result.byte_size == len(valid_jpeg_bytes)
    assert result.mime_type == "image/jpeg"
    assert result.extension == ".jpg"
    assert (result.width, result.height) == (10, 10)
    assert result.sha256 == hashlib.sha256(valid_jpeg_bytes).hexdigest()
    assert upload.file.closed
    assert "content" not in result.__dataclass_fields__


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("image_format", "mime_type", "extension"),
    [("PNG", "image/png", ".png"), ("WEBP", "image/webp", ".webp")],
)
async def test_validate_manual_image_accepts_other_supported_static_decoders(
    tmp_path,
    image_format,
    mime_type,
    extension,
):
    """PNG y WebP estáticos recorren sus decoders reales de Pillow."""
    content = _image_bytes(image_format)
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())

    result = await manual_validation.validate_manual_image(
        _upload_file(content, f"image.{extension}", mime_type),
        batch=batch,
    )

    assert result.mime_type == mime_type
    assert result.extension == extension


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("image_format", "declared_mime_type"),
    [
        ("JPEG", "image/png"),
        ("PNG", "image/webp"),
        ("WEBP", "image/jpeg"),
    ],
)
async def test_validate_manual_image_rejects_mime_signature_mismatch_and_discards_part(
    tmp_path,
    image_format,
    declared_mime_type,
):
    """Ningún MIME admitido puede ocultar otro formato real soportado."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(
        _image_bytes(image_format),
        "renamed-image",
        declared_mime_type,
    )

    with pytest.raises(InvalidImageError):
        await manual_validation.validate_manual_image(upload, batch=batch)

    assert upload.file.closed
    assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("image_format", "mime_type"),
    [
        (None, "image/jpeg"),
        ("JPEG", "image/jpeg"),
        ("PNG", "image/png"),
        ("WEBP", "image/webp"),
    ],
    ids=["unknown", "truncated-jpeg", "truncated-png", "truncated-webp"],
)
async def test_validate_manual_image_rejects_corrupt_content(
    tmp_path,
    image_format,
    mime_type,
):
    """Los decoders reales rechazan binario desconocido y fixtures truncados."""
    content = b"not-an-image" if image_format is None else _image_bytes(image_format)[:-16]
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(content, "broken-image", mime_type)

    with pytest.raises(InvalidImageError):
        await manual_validation.validate_manual_image(upload, batch=batch)

    assert upload.file.closed
    assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("image_format", "mime_type"),
    [("PNG", "image/png"), ("WEBP", "image/webp"), ("MPO", "image/jpeg")],
    ids=["animated-png", "animated-webp", "ambiguous-mpo"],
)
async def test_validate_manual_image_rejects_real_multiframe_sources(
    tmp_path,
    image_format,
    mime_type,
):
    """APNG, WebP animado y el ambiguo MPO no representan una página estática."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(
        _multiframe_image_bytes(image_format),
        "multiframe-image",
        mime_type,
    )

    with pytest.raises(InvalidImageError):
        await manual_validation.validate_manual_image(upload, batch=batch)

    assert upload.file.closed
    assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
async def test_validate_manual_image_rejects_dimensions_over_pixel_budget(
    tmp_path,
    valid_png_bytes,
):
    """Las dimensiones declaradas se cortan antes de reservar el bitmap gigante."""
    oversized_header = _png_with_dimensions(
        valid_png_bytes,
        width=config.MAX_IMAGE_PIXELS + 1,
        height=1,
    )
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(oversized_header, "wide.png", "image/png")

    with pytest.raises(InvalidImageError):
        await manual_validation.validate_manual_image(upload, batch=batch)


@pytest.mark.anyio
async def test_validate_manual_image_rejects_preflight_size_and_closes_upload(tmp_path):
    """UploadFile.size permite cortar antes de copiar, sin dejar un temporal."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(
        b"small-body",
        "claimed-large.jpg",
        "image/jpeg",
        size=config.MAX_IMAGE_SIZE + 1,
    )

    with pytest.raises(ImageTooLargeError):
        await manual_validation.validate_manual_image(upload, batch=batch)

    assert upload.file.closed
    assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("byte_size", "accepted"),
    [
        (config.MAX_IMAGE_SIZE - 1, True),
        (config.MAX_IMAGE_SIZE, True),
        (config.MAX_IMAGE_SIZE + 1, False),
    ],
    ids=["limit-minus-one", "exact-limit", "limit-plus-one"],
)
async def test_validate_manual_image_actual_size_bva(
    tmp_path,
    valid_jpeg_bytes,
    byte_size,
    accepted,
):
    """El contador real acepta 30 MB decimales y corta exactamente en 30 MB + 1."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _padded_upload(valid_jpeg_bytes, byte_size=byte_size, mime_type="image/jpeg")

    if accepted:
        result = await manual_validation.validate_manual_image(upload, batch=batch)
        assert result.byte_size == byte_size
    else:
        with pytest.raises(ImageTooLargeError):
            await manual_validation.validate_manual_image(upload, batch=batch)
        assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
async def test_validate_manual_pdf_uses_a_real_file_and_counts_pages(tmp_path):
    """PDFium abre la ruta staged y devuelve metadatos sin contenido binario."""
    content = _pdf_bytes(page_count=2)
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())

    result = await manual_validation.validate_manual_pdf(
        _upload_file(content, "manual.pdf", "application/pdf"),
        batch=batch,
    )

    assert result.path.is_file()
    assert result.byte_size == len(content)
    assert result.page_count == 2
    assert result.sha256 == hashlib.sha256(content).hexdigest()
    assert "content" not in result.__dataclass_fields__


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("content", "mime_type"),
    [
        (b"not a pdf", "application/pdf"),
        (b"%PDF-corrupt", "application/pdf"),
        (None, "image/jpeg"),
    ],
    ids=["signature", "corrupt", "mime"],
)
async def test_validate_manual_pdf_rejects_invalid_sources(tmp_path, content, mime_type):
    """Firma, estructura y MIME son condiciones independientes y obligatorias."""
    content = _pdf_bytes(page_count=1) if content is None else content
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(content, "manual.pdf", mime_type)

    with pytest.raises(InvalidPdfError):
        await manual_validation.validate_manual_pdf(upload, batch=batch)

    assert list(batch.path.glob("*.part")) == []


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_password_protected_pdf(tmp_path):
    """Los PDFs protegidos se rechazan aunque PDFium soporte contraseñas."""
    content = base64.b64decode(_PDFIUM_ENCRYPTED_R2_BASE64)
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(content, "encrypted.pdf", "application/pdf")

    with pytest.raises(InvalidPdfError):
        await manual_validation.validate_manual_pdf(upload, batch=batch)


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_zero_page_document(tmp_path):
    """Un contenedor PDF sin páginas no puede crear un manual vacío."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(_pdf_bytes(page_count=0), "empty.pdf", "application/pdf")

    with pytest.raises(InvalidPdfError):
        await manual_validation.validate_manual_pdf(upload, batch=batch)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("page_count", "accepted"),
    [(29, True), (30, True), (31, False)],
)
async def test_validate_manual_pdf_real_page_count_bva(tmp_path, page_count, accepted):
    """El límite inclusivo acepta 29/30 páginas y rechaza 31."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())

    if accepted:
        result = await manual_validation.validate_manual_pdf(
            _upload_file(_pdf_bytes(page_count=page_count), "manual.pdf", "application/pdf"),
            batch=batch,
        )
        assert result.page_count == page_count
    else:
        upload = _upload_file(
            _pdf_bytes(page_count=page_count),
            "manual.pdf",
            "application/pdf",
        )
        with pytest.raises(ManualPageLimitExceededError):
            await manual_validation.validate_manual_pdf(upload, batch=batch)


@pytest.mark.anyio
async def test_validate_manual_pdf_rejects_preflight_size_and_closes_upload(tmp_path):
    """Un tamaño recibido superior al límite se rechaza antes del staging."""
    batch = await LocalAssetStore(tmp_path).create_manual_batch(owner_user_id=uuid4())
    upload = _upload_file(
        b"%PDF-small",
        "claimed-large.pdf",
        "application/pdf",
        size=config.MAX_MANUAL_PDF_SIZE + 1,
    )

    with pytest.raises(PdfTooLargeError):
        await manual_validation.validate_manual_pdf(upload, batch=batch)

    assert upload.file.closed
    assert list(batch.path.glob("*.part")) == []


def _image_bytes(image_format: str) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (10, 10), color=(100, 150, 200)).save(output, format=image_format)
    return output.getvalue()


def _multiframe_image_bytes(image_format: str) -> bytes:
    first = Image.new("RGB", (8, 8), color="red")
    second = Image.new("RGB", (8, 8), color="blue")
    output = io.BytesIO()
    save_options: dict[str, object] = {
        "format": image_format,
        "save_all": True,
        "append_images": [second],
    }
    if image_format in {"PNG", "WEBP"}:
        save_options.update(duration=100, loop=0)
    first.save(output, **save_options)
    return output.getvalue()


def _png_with_dimensions(content: bytes, *, width: int, height: int) -> bytes:
    patched = bytearray(content)
    patched[16:20] = struct.pack(">I", width)
    patched[20:24] = struct.pack(">I", height)
    patched[29:33] = struct.pack(">I", zlib.crc32(patched[12:29]) & 0xFFFFFFFF)
    return bytes(patched)


def _upload_file(
    data: bytes,
    filename: str,
    content_type: str,
    *,
    size: int | None = None,
) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        size=len(data) if size is None else size,
        headers=Headers({"content-type": content_type}),
    )


def _padded_upload(prefix: bytes, *, byte_size: int, mime_type: str) -> UploadFile:
    # UploadFile recibe la propiedad del handle y el validador prueba que lo cierra.
    source = tempfile.TemporaryFile(mode="w+b")  # noqa: SIM115
    source.write(prefix)
    source.truncate(byte_size)
    source.seek(0)
    return UploadFile(
        file=source,
        filename="padded.jpg",
        size=None,
        headers=Headers({"content-type": mime_type}),
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
        (f"{content_object_number} 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n").encode(),
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
            f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
        ).encode()
    )
    return bytes(body)
