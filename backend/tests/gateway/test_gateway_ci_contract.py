"""Contratos de CI del gateway en GitHub y GitLab."""

from pathlib import Path

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GITHUB_CI = _REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"
_GITLAB_CI = _REPOSITORY_ROOT / ".gitlab-ci.yml"
_GITLAB_GATEWAY = _REPOSITORY_ROOT / ".gitlab" / "ci" / "gateway.yml"
_CADDY_IMAGE = (
    "caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"
)
_TERRAFORM_VERSION = "1.15.8"
_SETUP_TERRAFORM_ACTION = "hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e"
_TERRAFORM_IMAGE = (
    "hashicorp/terraform:1.15.8@"
    "sha256:7ae513256f7ce67879e218ae8593d6fbe216ec9e123abe6c94e4e10704857963"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _yaml_mapping_block(source: str, key: str, *, indent: int) -> str:
    lines = source.splitlines()
    declaration = f"{' ' * indent}{key}:"
    try:
        start = lines.index(declaration)
    except ValueError as exc:
        raise AssertionError(f"Bloque YAML ausente: {key}") from exc

    prefix = " " * indent
    for end in range(start + 1, len(lines)):
        line = lines[end]
        if not line or line.lstrip().startswith("#"):
            continue
        if line.startswith(prefix) and not line.startswith(f"{prefix} "):
            return "\n".join(lines[start:end])
    return "\n".join(lines[start:])


@pytest.mark.skipif(not _GITHUB_CI.exists(), reason="Repositorio sin CI de GitHub")
def test_github_gateway_is_a_pinned_quality_gate() -> None:
    """GitHub valida Caddy, Terraform y ambos renders antes del quality gate."""
    workflow = _read(_GITHUB_CI)
    gateway = _yaml_mapping_block(workflow, "gateway-config", indent=2)
    sonar = _yaml_mapping_block(workflow, "sonarqube", indent=2)

    assert "name: Caddy - Validación" in gateway
    assert "runs-on: ubuntu-latest" in gateway
    assert _CADDY_IMAGE in gateway
    assert "caddy fmt --diff /etc/caddy/Caddyfile" in gateway
    assert "caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile" in gateway
    assert gateway.count('--env "APP_HOSTNAME=$APP_HOSTNAME"') == 2
    assert "docker compose config --quiet" in gateway
    assert "docker compose --profile tunnel config --quiet" in gateway
    assert "secrets/tunnel_token.txt" in gateway
    assert _SETUP_TERRAFORM_ACTION in gateway
    assert f"terraform_version: {_TERRAFORM_VERSION}" in gateway
    assert "working-directory: deploy/terraform" in gateway
    assert "terraform fmt -recursive -check" in gateway
    assert "terraform init -backend=false" in gateway
    assert "terraform validate" in gateway
    assert "gateway-config" in sonar


@pytest.mark.skipif(not _GITLAB_CI.exists(), reason="Repositorio sin CI de GitLab")
def test_gitlab_gateway_uses_caddy_without_a_docker_daemon() -> None:
    """GitLab incluye gates Caddy/Compose y Terraform requeridos por release."""
    root = _read(_GITLAB_CI)
    gateway = _read(_GITLAB_GATEWAY)
    quality = _read(_REPOSITORY_ROOT / ".gitlab" / "ci" / "quality.yml")
    release = _read(_REPOSITORY_ROOT / ".gitlab" / "ci" / "release.yml")

    assert "- local: .gitlab/ci/gateway.yml" in root
    assert gateway.startswith("# Caddy - Validación:")
    assert "gateway-config:" in gateway
    assert "stage: check" in gateway
    assert f"name: {_CADDY_IMAGE}" in gateway
    assert 'entrypoint: [""]' in gateway
    assert "apk add --no-cache docker-cli-compose" in gateway
    assert "set -a" in gateway
    assert ". ./.env" in gateway
    assert "set +a" in gateway
    assert "caddy fmt --diff frontend/Caddyfile" in gateway
    assert "caddy validate --config frontend/Caddyfile --adapter caddyfile" in gateway
    assert "docker compose config --quiet" in gateway
    assert "docker compose --profile tunnel config --quiet" in gateway
    assert "secrets/tunnel_token.txt" in gateway
    assert "terraform-config:" in gateway
    assert f"name: {_TERRAFORM_IMAGE}" in gateway
    assert "terraform -chdir=deploy/terraform fmt -recursive -check" in gateway
    assert "terraform -chdir=deploy/terraform init -backend=false" in gateway
    assert "terraform -chdir=deploy/terraform validate" in gateway
    assert "job: gateway-config" in quality
    assert "job: terraform-config" in quality
    assert "job: gateway-config" in release
    assert "job: terraform-config" in release
