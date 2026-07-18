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


def _compose_config() -> dict[str, object]:
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=_REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    config = json.loads(result.stdout)
    assert isinstance(config, dict)
    return config


def _compose_service(name: str) -> dict[str, object]:
    service = _compose_config()["services"][name]
    assert isinstance(service, dict)
    return service


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


def test_caddy_serves_local_tls_redirect_and_liveness_contract() -> None:
    """Caddy separa HTTPS, redirección HTTP y liveness sin puertos privilegiados."""
    caddyfile = (_FRONTEND_ROOT / "Caddyfile").read_text(encoding="utf-8")

    assert "grace_period 120s" in caddyfile
    assert "http_port 8080" in caddyfile
    assert "https_port 8443" in caddyfile
    assert "servers {" in caddyfile
    assert "protocols h1 h2" in caddyfile
    assert "read_header 10s" in caddyfile
    assert "http://:8080 {" in caddyfile
    assert "redir https://localhost{uri} 308" in caddyfile
    assert "https://localhost:8443" not in caddyfile
    assert "localhost {" in caddyfile
    assert "tls internal" in caddyfile
    assert "http://:8082 {" in caddyfile
    assert "respond /healthz 200" in caddyfile


def test_frontend_image_exposes_internal_ports_and_checks_liveness() -> None:
    """La imagen declara sus listeners y comprueba el endpoint interno de vida."""
    dockerfile = (_FRONTEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "EXPOSE 8080 8082 8443" in dockerfile
    assert "HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3" in dockerfile
    assert "wget --no-verbose --tries=1 --spider http://127.0.0.1:8082/healthz" in dockerfile


def test_compose_initializes_private_caddy_data_volume() -> None:
    """Compose prepara /data para UID 1001 sin exportar la CA al host."""
    config = _compose_config()
    init = config["services"]["caddy-data-init"]
    frontend = config["services"]["frontend"]

    assert isinstance(init, dict)
    assert isinstance(frontend, dict)
    assert init["user"] == "0:1001"
    assert init["network_mode"] == "none"
    assert init["read_only"] is True
    assert init["cap_drop"] == ["ALL"]
    assert init["cap_add"] == ["CHOWN", "FOWNER"]
    assert init["restart"] == "no"
    assert "chown 1001:1001 /data" in " ".join(init["command"])
    assert "chmod 0700 /data" in " ".join(init["command"])
    assert init["volumes"] == [
        {
            "type": "volume",
            "source": "caddy-data",
            "target": "/data",
            "volume": {},
        }
    ]
    assert frontend["volumes"] == [
        {
            "type": "volume",
            "source": "caddy-data",
            "target": "/data",
            "volume": {},
        }
    ]
    assert "caddy-data" in config["volumes"]
    assert frontend["depends_on"]["caddy-data-init"]["condition"] == (
        "service_completed_successfully"
    )


def test_compose_publishes_hardened_caddy_on_loopback() -> None:
    """Compose publica HTTP/HTTPS en loopback y mantiene la raíz inmutable."""
    frontend = _compose_service("frontend")
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
        },
        {
            "mode": "ingress",
            "target": 8443,
            "published": "443",
            "protocol": "tcp",
            "host_ip": "127.0.0.1",
        },
    ]
    assert frontend["stop_grace_period"] == "2m10s"
    assert frontend["logging"]["driver"] == "json-file"
    assert frontend["logging"]["options"]["max-size"]
