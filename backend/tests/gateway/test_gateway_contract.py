import json
import subprocess
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_FRONTEND_ROOT = _REPOSITORY_ROOT / "frontend"
_CADDYFILE_PATH = "/etc/caddy/Caddyfile"
_VALIDATION_DATA_HOME = "/tmp/caddy-validation"
_CADDY_VERSION = "2.11.4-alpine"
_CADDY_DIGEST = "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"


def _dotenv_value(name: str) -> str:
    for raw_line in (_REPOSITORY_ROOT / ".env").read_text(encoding="utf-8").splitlines():
        key, separator, value = raw_line.partition("=")
        if separator and key.strip() == name:
            return value.strip()
    raise AssertionError(f"{name} no está definido en .env")


def _compose_frontend() -> dict[str, object]:
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=_REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    frontend = json.loads(result.stdout)["services"]["frontend"]
    assert isinstance(frontend, dict)
    return frontend


def test_frontend_image_pins_and_validates_caddy_runtime() -> None:
    """La imagen fija Caddy y valida su configuración antes de publicarse."""
    dockerfile = (_FRONTEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert _dotenv_value("CADDY_VERSION") == _CADDY_VERSION
    assert _dotenv_value("CADDY_DIGEST") == _CADDY_DIGEST
    assert (
        "FROM caddy:${CADDY_VERSION:?CADDY_VERSION_no_definida}"
        "@${CADDY_DIGEST:?CADDY_DIGEST_no_definido} AS runtime"
    ) in dockerfile
    assert "setcap -r /usr/bin/caddy" in dockerfile
    assert "chown -R appuser:appuser /data /config" in dockerfile
    assert "COPY --link --from=builder --chown=1001:1001 /app/dist /srv" in dockerfile
    assert f"COPY --link --chown=1001:1001 Caddyfile {_CADDYFILE_PATH}" in dockerfile
    assert f"caddy fmt --diff {_CADDYFILE_PATH}" in dockerfile
    assert f"XDG_DATA_HOME={_VALIDATION_DATA_HOME}" in dockerfile
    assert f"caddy validate --config {_CADDYFILE_PATH} --adapter caddyfile" in dockerfile
    assert f'rm -rf "{_VALIDATION_DATA_HOME}"' in dockerfile
    assert "USER appuser" in dockerfile


def test_caddy_routes_the_spa_and_backend_contract() -> None:
    """El gateway conserva rutas API y reserva el fallback para la SPA."""
    caddyfile = (_FRONTEND_ROOT / "Caddyfile").read_text(encoding="utf-8")

    assert ":8080 {" in caddyfile
    assert "root * /srv" in caddyfile
    assert "handle /api/*" in caddyfile
    assert "handle /health" in caddyfile
    assert caddyfile.count("reverse_proxy api:8000") == 2
    assert "try_files {path} /index.html" in caddyfile
    assert "file_server" in caddyfile


def test_compose_publishes_hardened_caddy_on_loopback() -> None:
    """Compose publica solo el gateway HTTP y mantiene su raíz inmutable."""
    frontend = _compose_frontend()
    build = frontend["build"]
    assert isinstance(build, dict)

    assert build["args"]["CADDY_VERSION"] == _CADDY_VERSION
    assert build["args"]["CADDY_DIGEST"] == _CADDY_DIGEST
    assert frontend["read_only"] is True
    assert frontend["cap_drop"] == ["ALL"]
    assert frontend["security_opt"] == ["no-new-privileges:true"]
    assert any(str(mount).startswith("/config:") for mount in frontend["tmpfs"])
    assert frontend["ports"] == [
        {
            "mode": "ingress",
            "target": 8080,
            "published": "80",
            "protocol": "tcp",
            "host_ip": "127.0.0.1",
        }
    ]
    assert frontend["logging"]["driver"] == "json-file"
    assert frontend["logging"]["options"]["max-size"]
