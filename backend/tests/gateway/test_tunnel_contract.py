"""Contratos del túnel opcional y su infraestructura declarativa."""

import json
import re
import subprocess
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_COMPOSE = _REPOSITORY_ROOT / "compose.yaml"
_CADDYFILE = _REPOSITORY_ROOT / "frontend" / "Caddyfile"
_DOCKERFILE = _REPOSITORY_ROOT / "frontend" / "Dockerfile"
_TERRAFORM = _REPOSITORY_ROOT / "deploy" / "terraform"
_TUNNEL_TOKEN = _REPOSITORY_ROOT / "secrets" / "tunnel_token.txt"
_CLOUDFLARED_VERSION = "2026.7.2"
_CLOUDFLARED_DIGEST = "sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d"
_EDGE_NET_SUBNET = "172.30.250.8/29"
_ROOT_CERTIFICATE = "/data/caddy/pki/authorities/local/root.crt"
_EDGE_CERTIFICATE = "/etc/cloudflared/ca/root.crt"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _dotenv_value(name: str) -> str:
    for raw_line in _read(_REPOSITORY_ROOT / ".env").splitlines():
        key, separator, value = raw_line.partition("=")
        if separator and key.strip() == name:
            return value.strip()
    raise AssertionError(f"{name} no está definido en .env")


def _compose_config(*, tunnel: bool) -> dict[str, object]:
    command = ["docker", "compose"]
    if tunnel:
        command.extend(("--profile", "tunnel"))
    command.extend(("config", "--format", "json"))
    result = subprocess.run(
        command,
        cwd=_REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    config = json.loads(result.stdout)
    assert isinstance(config, dict)
    return config


def _caddy_block(caddyfile: str, declaration: str) -> str:
    try:
        start = caddyfile.index(declaration)
    except ValueError as exc:
        raise AssertionError(f"Bloque ausente: {declaration}") from exc
    opening_brace = caddyfile.index("{", start + len(declaration) - 1)
    depth = 0
    for position in range(opening_brace, len(caddyfile)):
        if caddyfile[position] == "{":
            depth += 1
        elif caddyfile[position] == "}":
            depth -= 1
            if depth == 0:
                return caddyfile[start : position + 1]
    raise AssertionError(f"Bloque sin cierre: {declaration}")


def test_tunnel_profile_pins_and_hardens_cloudflared() -> None:
    """El túnel es opt-in, no publica puertos y usa una imagen inmutable."""
    base = _compose_config(tunnel=False)
    tunnel = _compose_config(tunnel=True)
    services = tunnel["services"]
    cloudflared = services["cloudflared"]

    assert isinstance(services, dict)
    assert isinstance(cloudflared, dict)
    assert _dotenv_value("CLOUDFLARED_VERSION") == _CLOUDFLARED_VERSION
    assert _dotenv_value("CLOUDFLARED_DIGEST") == _CLOUDFLARED_DIGEST
    assert cloudflared["profiles"] == ["tunnel"]
    assert cloudflared["image"] == (
        f"cloudflare/cloudflared:{_CLOUDFLARED_VERSION}@{_CLOUDFLARED_DIGEST}"
    )
    assert cloudflared["user"] == "65532:65532"
    assert cloudflared["read_only"] is True
    assert cloudflared["cap_drop"] == ["ALL"]
    assert cloudflared["security_opt"] == ["no-new-privileges:true"]
    assert "ports" not in cloudflared
    assert cloudflared["networks"] == {"edge-net": None}
    assert cloudflared["entrypoint"] == ["cloudflared", "--output", "json"]
    assert cloudflared["command"] == [
        "tunnel",
        "--no-autoupdate",
        "run",
        "--token-file",
        "/run/secrets/tunnel_token",
    ]
    assert cloudflared["logging"]["driver"] == "json-file"
    assert cloudflared["logging"]["options"]["max-size"]
    assert "cloudflared" not in base["services"]


def test_edge_network_and_ca_volume_are_narrowly_shared() -> None:
    """Solo Caddy y cloudflared comparten edge-net y únicamente root.crt sale de /data."""
    config = _compose_config(tunnel=True)
    services = config["services"]
    networks = config["networks"]
    init = services["edge-ca-init"]
    cloudflared = services["cloudflared"]

    assert _dotenv_value("EDGE_NET_SUBNET") == _EDGE_NET_SUBNET
    assert networks["edge-net"]["ipam"]["config"] == [{"subnet": _EDGE_NET_SUBNET}]
    edge_members = {
        name for name, service in services.items() if "edge-net" in service.get("networks", {})
    }
    assert edge_members == {"cloudflared", "frontend"}
    assert init["profiles"] == ["tunnel"]
    assert init["network_mode"] == "none"
    assert init["read_only"] is True
    assert init["cap_drop"] == ["ALL"]
    assert init["cap_add"] == ["DAC_READ_SEARCH"]
    command = " ".join(init["command"])
    assert _ROOT_CERTIFICATE in command
    assert "/edge-ca/root.crt" in command
    assert "root.key" not in _read(_COMPOSE)
    assert "edge-ca" in config["volumes"]
    edge_mount = next(mount for mount in cloudflared["volumes"] if mount["source"] == "edge-ca")
    assert edge_mount["target"] == "/etc/cloudflared/ca"
    assert edge_mount["read_only"] is True
    assert cloudflared["secrets"] == [
        {"source": "tunnel_token", "target": "/run/secrets/tunnel_token"}
    ]
    token_file = config["secrets"]["tunnel_token"]["file"].replace("\\", "/")
    assert token_file.endswith("/secrets/tunnel_token.txt")


def test_caddy_exposes_a_strict_edge_listener_without_host_publication() -> None:
    """El listener 8444 confía CF-Connecting-IP solo desde edge-net y oculta docs."""
    caddyfile = _read(_CADDYFILE)
    app_hostname = _dotenv_value("APP_HOSTNAME")
    edge_server = _caddy_block(caddyfile, "servers :8444 {")
    edge_site = _caddy_block(caddyfile, "{$APP_HOSTNAME}:8444 {")
    edge_docs = _caddy_block(edge_site, "handle @edge_docs {")
    frontend = _compose_config(tunnel=True)["services"]["frontend"]

    assert "trusted_proxies static {$EDGE_NET_SUBNET}" in edge_server
    assert "trusted_proxies_strict" in edge_server
    assert "client_ip_headers CF-Connecting-IP" in edge_server
    assert "protocols h1 h2" in edge_server
    assert "read_header 10s" in edge_server
    assert "tls internal" in edge_site
    assert "@edge_docs path /docs /docs/* /redoc /redoc/* /openapi.json" in edge_site
    assert "respond 404" in edge_docs
    assert "import access-log" in edge_site
    assert "import app" in edge_site
    assert all(port["target"] != 8444 for port in frontend["ports"])
    assert frontend["environment"]["APP_HOSTNAME"] == app_hostname
    assert frontend["networks"]["edge-net"]["aliases"] == [app_hostname]
    assert frontend["environment"]["EDGE_NET_SUBNET"] == _EDGE_NET_SUBNET
    assert frontend["build"]["args"]["EDGE_NET_SUBNET"] == _EDGE_NET_SUBNET
    assert "EXPOSE 8080 8082 8443 8444" in _read(_DOCKERFILE)


def test_terraform_models_the_zone_tunnel_origin_tls_and_dns() -> None:
    """Terraform declara túnel, ingress TLS verificado y DNS sin valores sensibles."""
    terraform = "\n".join(_read(path) for path in sorted(_TERRAFORM.glob("*.tf")))
    app_hostname = _dotenv_value("APP_HOSTNAME")
    account_id_variable = _caddy_block(terraform, 'variable "cloudflare_account_id"')
    zone_id_variable = _caddy_block(terraform, 'variable "cloudflare_zone_id"')
    app_hostname_variable = _caddy_block(terraform, 'variable "app_hostname"')
    tunnel_name_variable = _caddy_block(terraform, 'variable "tunnel_name"')

    assert 'source  = "cloudflare/cloudflare"' in terraform
    assert 'version = "5.22.0"' in terraform
    assert 'resource "cloudflare_zero_trust_tunnel_cloudflared" "app"' in terraform
    assert 'resource "cloudflare_zero_trust_tunnel_cloudflared_config" "app"' in terraform
    assert 'data "cloudflare_zero_trust_tunnel_cloudflared_token" "app"' in terraform
    assert 'resource "cloudflare_dns_record" "app"' in terraform
    assert terraform.count("cloudflare_zero_trust_tunnel_cloudflared.app.id") == 3
    assert "data.cloudflare_zero_trust_tunnel_cloudflared_token.app.token" in terraform
    assert re.search(r'service\s*=\s*"https://frontend:8444"', terraform)
    assert re.search(r"origin_server_name\s*=\s*var\.app_hostname", terraform)
    assert re.search(r"hostname\s*=\s*var\.app_hostname", terraform)
    assert re.search(r"zone_id\s*=\s*var\.cloudflare_zone_id", terraform)
    assert re.search(r"name\s*=\s*var\.app_hostname", terraform)
    assert re.search(rf'ca_pool\s*=\s*"{_EDGE_CERTIFICATE}"', terraform)
    assert f'default     = "{app_hostname}"' in app_hostname_variable
    assert 'regex("^[0-9a-f]{32}$"' in account_id_variable
    assert 'regex("^[0-9a-f]{32}$"' in zone_id_variable
    assert "validation {" in app_hostname_variable
    assert "validation {" in tunnel_name_variable
    assert 'service = "http_status:404"' in terraform
    assert "no_tls_verify" not in terraform
    assert 'variable "cloudflare_api_token"' in terraform
    assert re.search(r"sensitive\s*=\s*true", terraform)
    assert "default" not in _caddy_block(terraform, 'variable "cloudflare_api_token"')
    assert "terraform apply" in _read(_TERRAFORM / "README.md")


def test_tunnel_token_and_terraform_state_are_ignored() -> None:
    """El token real y el estado Terraform nunca entran en el árbol Git."""
    root_ignore = _read(_REPOSITORY_ROOT / ".gitignore")

    assert "secrets/tunnel_token.txt" in root_ignore
    assert "/deploy/terraform/.terraform/" in root_ignore
    assert "/deploy/terraform/*.tfstate*" in root_ignore
    assert "/deploy/terraform/terraform.tfvars" in root_ignore
    assert "/deploy/terraform/crash.log" in root_ignore
    assert "/deploy/terraform/crash.*.log" in root_ignore
    ignored = subprocess.run(
        ["git", "check-ignore", "--quiet", str(_TUNNEL_TOKEN)],
        cwd=_REPOSITORY_ROOT,
        check=False,
    )
    assert ignored.returncode == 0
    assert not _TUNNEL_TOKEN.exists()
