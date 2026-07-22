"""Contratos de seguridad imprescindibles de la entrada de producción."""

from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_CADDYFILE = _REPOSITORY_ROOT / "frontend" / "Caddyfile"
_COMPOSE = _REPOSITORY_ROOT / "compose.yaml"
_TERRAFORM_TUNNEL = _REPOSITORY_ROOT / "deploy" / "terraform" / "tunnel.tf"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _caddy_block(source: str, declaration: str) -> str:
    try:
        start = source.index(declaration)
    except ValueError as exc:
        raise AssertionError(f"Bloque ausente: {declaration}") from exc

    opening_brace = source.index("{", start + len(declaration) - 1)
    depth = 0
    for position in range(opening_brace, len(source)):
        if source[position] == "{":
            depth += 1
        elif source[position] == "}":
            depth -= 1
            if depth == 0:
                return source[start : position + 1]
    raise AssertionError(f"Bloque sin cierre: {declaration}")


def test_edge_listener_trusts_cloudflare_client_ip_only_from_edge_network() -> None:
    edge_server = _caddy_block(_read(_CADDYFILE), "servers :8444 {")

    assert "trusted_proxies static {$EDGE_NET_SUBNET}" in edge_server
    assert "trusted_proxies_strict" in edge_server
    assert "client_ip_headers CF-Connecting-IP" in edge_server


def test_public_origin_hides_api_documentation() -> None:
    edge_site = _caddy_block(_read(_CADDYFILE), "{$APP_HOSTNAME}:8444 {")
    edge_docs = _caddy_block(edge_site, "handle @edge_docs {")

    assert "@edge_docs path /docs /docs/* /redoc /redoc/* /openapi.json" in edge_site
    assert "respond 404" in edge_docs


def test_cloudflared_uses_verified_tls_to_caddy() -> None:
    edge_site = _caddy_block(_read(_CADDYFILE), "{$APP_HOSTNAME}:8444 {")
    compose = _read(_COMPOSE)
    tunnel = _read(_TERRAFORM_TUNNEL)

    assert "tls internal" in edge_site
    assert "install -m 0444 /data/caddy/pki/authorities/local/root.crt /edge-ca/root.crt" in compose
    assert "- edge-ca:/etc/cloudflared/ca:ro" in compose
    assert 'service  = "https://frontend:8444"' in tunnel
    assert "origin_server_name = var.app_hostname" in tunnel
    assert 'ca_pool            = "/etc/cloudflared/ca/root.crt"' in tunnel
    assert "no_tls_verify" not in tunnel
