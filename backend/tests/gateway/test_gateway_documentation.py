"""Contratos positivos de la documentacion del gateway y su origen publico."""

from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (_REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def _dotenv_value(name: str) -> str:
    for raw_line in _read(".env").splitlines():
        key, separator, value = raw_line.partition("=")
        if separator and key.strip() == name:
            return value.strip()
    raise AssertionError(f"{name} no está definido en .env")


def test_project_documentation_describes_the_https_gateway_architecture() -> None:
    """La guia principal presenta Caddy, HTTPS y las tres redes del despliegue."""
    readme = _read("README.md")

    assert "`https://localhost`" in readme
    assert "Caddy" in readme
    assert "`gateway-net`" in readme
    assert "`backend-net`" in readme
    assert "`edge-net`" in readme
    assert "Cloudflare Tunnel" in readme


def test_deployment_documentation_covers_ca_trust_and_the_optional_tunnel() -> None:
    """La guia de despliegue explica la CA local y el perfil opt-in del tunel."""
    deployment = _read("deploy/README.md")
    terraform = _read("deploy/terraform/README.md")
    app_hostname = _dotenv_value("APP_HOSTNAME")

    assert ".\\local-ca.bat trust" in deployment
    assert "./local-ca.sh trust" in deployment
    assert "docker compose --profile tunnel up -d" in deployment
    assert "secrets/tunnel_token.txt" in deployment
    assert "`APP_HOSTNAME`" in deployment
    assert app_hostname in deployment
    assert "`app_hostname`" in terraform
    assert app_hostname in terraform


def test_frontend_documentation_separates_vite_development_from_caddy_runtime() -> None:
    """La guia del frontend distingue el proxy Vite del gateway de produccion."""
    frontend = _read("frontend/README.md")

    assert "Runtime Docker" in frontend
    assert "Caddy" in frontend
    assert "`https://localhost`" in frontend
    assert "`Caddyfile`" in frontend
    assert "`http://localhost:5173`" in frontend
    assert "`VITE_API_TARGET`" in frontend


def test_runtime_and_start_scripts_publish_the_gateway_origin() -> None:
    """Emails y salida de start comparten el unico origen publico HTTPS."""
    backend_env = _read("config/backend.env")
    backend_config = _read("backend/api/config.py")
    windows = _read("deploy/windows/manualito.ps1")
    linux = _read("deploy/linux/manualito.sh")

    assert "FRONTEND_PUBLIC_URL=https://localhost" in backend_env
    assert 'frontend_public_url: str = "https://localhost"' in backend_config
    assert 'Write-Field "app" "https://localhost"' in windows
    assert 'Write-Field "openapi" "https://localhost/docs"' in windows
    assert 'write_field "app" "https://localhost"' in linux
    assert 'write_field "openapi" "https://localhost/docs"' in linux


def test_unreleased_changelog_records_the_gateway_as_added_functionality() -> None:
    """Unreleased describe la nueva capacidad local y remota antes de publicar."""
    unreleased = _read("CHANGELOG.md").split("## [1.0.0-rc.1]", maxsplit=1)[0]

    assert "### Added" in unreleased
    assert "Caddy" in unreleased
    assert "HTTPS local" in unreleased
    assert "Cloudflare Tunnel" in unreleased
