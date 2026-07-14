import json
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.upload_integration

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_ASSET_ROOT = "/app/storage/assets"
_SPOOL_DIR = f"{_ASSET_ROOT}/.spool"
_CELERY_SERVICES = (
    "celery-worker-manuals",
    "celery-worker-gpu",
    "celery-worker-mail",
    "celery-beat",
)


def _dotenv_value(name: str) -> str:
    for raw_line in (_REPOSITORY_ROOT / ".env").read_text(encoding="utf-8").splitlines():
        key, separator, value = raw_line.partition("=")
        if separator and key.strip() == name:
            return value.strip()
    raise AssertionError(f"{name} no está definido en .env")


def test_compose_prepares_disk_backed_upload_spool_for_api_only() -> None:
    """La API puede volcar uploads grandes sin consumir el tmpfs de /tmp."""
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=_REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    services = json.loads(result.stdout)["services"]

    assert services["api"]["environment"]["TMPDIR"] == _SPOOL_DIR
    api_volume = next(
        volume for volume in services["api"]["volumes"] if volume["target"] == _ASSET_ROOT
    )
    init_volume = next(
        volume
        for volume in services["asset-storage-init"]["volumes"]
        if volume["target"] == _ASSET_ROOT
    )
    assert api_volume["source"] == init_volume["source"] == "assets-data"
    assert services["api"]["depends_on"]["asset-storage-init"]["condition"] == (
        "service_completed_successfully"
    )
    assert services["asset-storage-init"]["entrypoint"] == ["/usr/bin/install"]
    assert services["asset-storage-init"]["user"] == f"0:{_dotenv_value('APP_GID')}"
    assert set(services["asset-storage-init"]["cap_add"]) == {"CHOWN", "FOWNER"}
    assert services["asset-storage-init"]["command"] == [
        "-d",
        "-o",
        _dotenv_value("APP_UID"),
        "-g",
        _dotenv_value("APP_GID"),
        "-m",
        "0770",
        _ASSET_ROOT,
        _SPOOL_DIR,
    ]
    assert all("TMPDIR" not in services[name]["environment"] for name in _CELERY_SERVICES)
