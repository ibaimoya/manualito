import json
import subprocess
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_FRONTEND_ROOT = _REPOSITORY_ROOT / "frontend"
_API_DOCKERFILE = _REPOSITORY_ROOT / "backend" / "api" / "Dockerfile"
_CADDYFILE_PATH = "/etc/caddy/Caddyfile"
_VALIDATION_DATA_HOME = "/tmp/caddy-validation"
_CADDY_VERSION = "2.11.4-alpine"
_CADDY_DIGEST = "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"
_GATEWAY_NET_SUBNET = "172.30.250.0/29"
_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"
_NO_STORE_CACHE_CONTROL = "no-cache, no-store, must-revalidate"
_INDEX_CACHE_CONTROL = f"{_NO_STORE_CACHE_CONTROL}, no-transform"
_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; img-src 'self' data: blob:; "
    "style-src 'self' 'unsafe-inline'; font-src 'self' data:; "
    "connect-src 'self'; manifest-src 'self'; worker-src 'self' blob:; "
    "base-uri 'self'; form-action 'self';"
)


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


def _caddy_block(caddyfile: str, declaration: str) -> str:
    try:
        start = caddyfile.index(declaration)
    except ValueError as exc:
        raise AssertionError(f"Bloque ausente: {declaration}") from exc
    opening_brace = caddyfile.index("{", start)
    depth = 0
    for position in range(opening_brace, len(caddyfile)):
        if caddyfile[position] == "{":
            depth += 1
        elif caddyfile[position] == "}":
            depth -= 1
            if depth == 0:
                return caddyfile[start : position + 1]
    raise AssertionError(f"Bloque sin cierre: {declaration}")


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
    api_proxy = _caddy_block(caddyfile, "(api-proxy) {")
    api = _caddy_block(caddyfile, "handle /api/* {")
    health = _caddy_block(caddyfile, "handle /health {")

    assert ":8080 {" in caddyfile
    assert "root * /srv" in caddyfile
    assert "reverse_proxy api:8000" in api_proxy
    assert caddyfile.count("reverse_proxy api:8000") == 1
    assert "import api-proxy" in api
    assert "import api-proxy" in health
    assert "try_files {path} /index.html" in caddyfile
    assert "file_server" in caddyfile


def test_caddy_compresses_and_limits_requests_with_bounded_upstream_keepalive() -> None:
    """El proxy comprime, limita cuerpos y no corta respuestas largas de FastAPI."""
    caddyfile = (_FRONTEND_ROOT / "Caddyfile").read_text(encoding="utf-8")
    app = _caddy_block(caddyfile, "(app) {")
    proxy = _caddy_block(caddyfile, "(api-proxy) {")
    transport = _caddy_block(proxy, "transport http {")
    health = _caddy_block(app, "handle /health {")

    assert "encode zstd gzip" in app
    assert "request_body {" in app
    assert "max_size 128MB" in app
    assert "keepalive 4s" in transport
    assert "response_header_timeout" not in proxy
    assert "read_timeout" not in proxy
    assert "write_timeout" not in proxy
    assert "log_skip" in health


def test_caddy_applies_route_specific_cache_contracts_without_asset_fallback() -> None:
    """Los artefactos PWA, assets e index reciben caché y fallback independientes."""
    caddyfile = (_FRONTEND_ROOT / "Caddyfile").read_text(encoding="utf-8")
    app = _caddy_block(caddyfile, "(app) {")
    assets = _caddy_block(app, "handle /assets/* {")
    pwa_files = _caddy_block(app, "handle @pwa_files {")
    manifest = _caddy_block(app, "handle /manifest.webmanifest {")
    fallback = _caddy_block(app, "handle {")

    assert f'header Cache-Control "{_ASSET_CACHE_CONTROL}"' in assets
    assert "file_server" in assets
    assert "try_files" not in assets
    assert r"@pwa_files path_regexp ^/(sw\.js|registerSW\.js|workbox-[^/]+\.js)$" in app
    assert f'header Cache-Control "{_NO_STORE_CACHE_CONTROL}"' in pwa_files
    assert "file_server" in pwa_files
    assert "try_files" not in pwa_files
    assert 'header Cache-Control "no-cache"' in manifest
    assert "file_server" in manifest
    assert "try_files" not in manifest
    assert "try_files {path} /index.html" in fallback
    assert "@index path /index.html" in fallback
    assert f'header @index Cache-Control "{_INDEX_CACHE_CONTROL}"' in fallback


def test_caddy_sets_security_headers_once_and_excludes_docs_from_csp() -> None:
    """Las respuestas comparten hardening y Swagger queda fuera de la CSP."""
    caddyfile = (_FRONTEND_ROOT / "Caddyfile").read_text(encoding="utf-8")
    app = _caddy_block(caddyfile, "(app) {")
    security_headers = _caddy_block(app, "header {")
    not_docs = _caddy_block(app, "@not_docs {")

    assert "X-Content-Type-Options nosniff" in security_headers
    assert "X-Frame-Options SAMEORIGIN" in security_headers
    assert "Referrer-Policy strict-origin-when-cross-origin" in security_headers
    assert 'Permissions-Policy "camera=(self), microphone=(), geolocation=()"' in security_headers
    assert "-Server" in security_headers
    assert "interest-cohort" not in caddyfile
    assert "not path /docs /docs/* /redoc /redoc/*" in not_docs
    assert f'header @not_docs Content-Security-Policy "{_CONTENT_SECURITY_POLICY}"' in app
    for header_name in (
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Content-Security-Policy",
        "-Server",
    ):
        assert caddyfile.count(header_name) == 1


def test_localhost_exposes_docs_and_writes_redacted_json_access_logs() -> None:
    """Solo localhost publica docs y registra accesos sin credenciales ni token."""
    caddyfile = (_FRONTEND_ROOT / "Caddyfile").read_text(encoding="utf-8")
    localhost = _caddy_block(caddyfile, "localhost {")
    docs = _caddy_block(localhost, "handle @api_docs {")
    access_log = _caddy_block(localhost, "log {")
    query_filter = _caddy_block(access_log, "request>uri query {")

    assert "@api_docs path /docs /redoc /openapi.json /docs/oauth2-redirect" in localhost
    assert "import api-proxy" in docs
    assert "output stdout" in access_log
    assert "format filter" in access_log
    assert "wrap json" in access_log
    assert "request>headers>Cookie replace REDACTED" in access_log
    assert "request>headers>Authorization replace REDACTED" in access_log
    assert "request>headers>Referer replace REDACTED" in access_log
    assert "resp_headers>Set-Cookie replace REDACTED" in access_log
    assert "replace token REDACTED" in query_filter
    assert caddyfile.count("log {") == 1


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


def test_compose_isolates_gateway_from_backend_services() -> None:
    """Compose limita gateway-net a Caddy/API y conserva el backend separado."""
    config = _compose_config()
    services = config["services"]
    networks = config["networks"]

    assert _dotenv_value("GATEWAY_NET_SUBNET") == _GATEWAY_NET_SUBNET
    assert set(networks) == {"backend-net", "gateway-net"}
    assert networks["gateway-net"]["driver"] == "bridge"
    assert networks["gateway-net"]["internal"] is True
    assert networks["gateway-net"]["ipam"]["config"] == [{"subnet": _GATEWAY_NET_SUBNET}]
    assert networks["backend-net"]["driver"] == "bridge"
    assert networks["backend-net"].get("internal", False) is False

    gateway_members = {
        name for name, service in services.items() if "gateway-net" in service.get("networks", {})
    }
    backend_members = {
        name for name, service in services.items() if "backend-net" in service.get("networks", {})
    }
    assert gateway_members == {"api", "frontend"}
    assert backend_members == {
        "api",
        "celery-beat",
        "celery-worker-gpu",
        "celery-worker-mail",
        "celery-worker-manuals",
        "chroma",
        "database",
        "database-migrate",
        "flower",
        "llm",
        "mailpit",
        "ocr",
        "ollama",
        "ollama-init",
        "rag",
        "redis",
    }


def test_api_trusts_only_gateway_cidr_without_host_publication() -> None:
    """La API acepta proxy headers solo desde gateway-net y no publica 8000."""
    api = _compose_service("api")
    frontend = _compose_service("frontend")
    dockerfile = _API_DOCKERFILE.read_text(encoding="utf-8")

    assert api["environment"]["FORWARDED_ALLOW_IPS"] == _GATEWAY_NET_SUBNET
    assert "ports" not in api
    assert set(api["networks"]) == {"backend-net", "gateway-net"}
    assert set(frontend["networks"]) == {"gateway-net"}
    assert '"--proxy-headers"' in dockerfile
    assert "--forwarded-allow-ips" not in dockerfile
