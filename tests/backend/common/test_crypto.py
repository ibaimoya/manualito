from common.crypto import sha256_hex


def test_sha256_hex_accepts_text_and_bytes():
    """El helper comparte la misma salida para texto UTF-8 y bytes."""
    assert sha256_hex("manualito") == sha256_hex(b"manualito")
    assert len(sha256_hex("manualito")) == 64
