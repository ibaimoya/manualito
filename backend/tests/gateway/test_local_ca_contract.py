"""Contratos de confianza de la CA local sin tocar el almacén del sistema."""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_WINDOWS_WRAPPER = _REPOSITORY_ROOT / "local-ca.bat"
_LINUX_WRAPPER = _REPOSITORY_ROOT / "local-ca.sh"
_WINDOWS_IMPLEMENTATION = _REPOSITORY_ROOT / "deploy" / "windows" / "local-ca.ps1"
_LINUX_IMPLEMENTATION = _REPOSITORY_ROOT / "deploy" / "linux" / "local-ca.sh"
_WINDOWS_SETUP = _REPOSITORY_ROOT / "deploy" / "windows" / "manualito.ps1"
_LINUX_SETUP = _REPOSITORY_ROOT / "deploy" / "linux" / "manualito.sh"
_ROOT_CA_CONTAINER_PATH = "/data/caddy/pki/authorities/local/root.crt"
_STATE_FILE = "local-ca-fingerprints.txt"
_FINGERPRINT_PATTERN = re.compile(r"^[0-9A-F]{64}$")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _generate_test_ca(directory: Path, common_name: str) -> Path:
    openssl = shutil.which("openssl")
    if openssl is None:
        pytest.skip("OpenSSL no está disponible para generar la CA efímera")
    certificate = directory / f"{common_name}.crt"
    private_material = directory / f"{common_name}.pem"
    subprocess.run(
        [
            openssl,
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(private_material),
            "-out",
            str(certificate),
            "-days",
            "1",
            "-subj",
            f"/CN={common_name}",
            "-addext",
            "basicConstraints=critical,CA:TRUE",
            "-addext",
            "keyUsage=critical,keyCertSign,cRLSign",
        ],
        check=True,
        capture_output=True,
    )
    private_material.unlink()
    return certificate


def _write_fake_docker(bin_dir: Path) -> None:
    fake = bin_dir / "fake_docker.py"
    fake.write_text(
        "\n".join(
            [
                "import os",
                "import shutil",
                "import sys",
                "",
                "args = sys.argv[1:]",
                "if args and args[0] == 'inspect':",
                "    print('healthy')",
                "elif args and args[0] == 'compose' and 'ps' in args:",
                "    print('manualito-test-frontend')",
                "elif args and args[0] == 'compose' and 'cp' in args:",
                "    shutil.copyfile(os.environ['MANUALITO_TEST_CA_SOURCE'], args[-1])",
                "elif args and args[0] == 'compose' and 'up' in args:",
                "    pass",
                "else:",
                "    raise SystemExit(f'comando Docker falso inesperado: {args}')",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    if os.name == "nt":
        (bin_dir / "docker.cmd").write_text(
            '@python "%~dp0fake_docker.py" %*\n',
            encoding="utf-8",
        )
    else:
        docker = bin_dir / "docker"
        docker.write_text(
            '#!/usr/bin/env bash\nexec python3 "$(dirname "$0")/fake_docker.py" "$@"\n',
            encoding="utf-8",
        )
        docker.chmod(0o700)


def _cli_command(action: str) -> list[str]:
    if os.name == "nt":
        return ["cmd.exe", "/d", "/c", "call", str(_WINDOWS_WRAPPER), action]
    return ["bash", str(_LINUX_WRAPPER), action]


def _run_cli(action: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        _cli_command(action),
        cwd=_REPOSITORY_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def _state_file(state_home: Path) -> Path:
    platform_dir = "Manualito" if os.name == "nt" else "manualito"
    return state_home / platform_dir / _STATE_FILE


def test_local_ca_wrappers_delegate_to_each_platform() -> None:
    """Los wrappers raíz delegan sin duplicar la lógica de confianza."""
    windows = _read(_WINDOWS_WRAPPER)
    linux = _read(_LINUX_WRAPPER)

    assert "deploy\\windows\\local-ca.ps1" in windows
    assert "%*" in windows
    assert "deploy/linux/local-ca.sh" in linux
    assert '"$@"' in linux


def test_local_ca_implementations_keep_the_private_ca_inside_caddy() -> None:
    """La CLI extrae solo el certificado y usa almacenes acotados por huella."""
    windows = _read(_WINDOWS_IMPLEMENTATION)
    linux = _read(_LINUX_IMPLEMENTATION)

    for implementation in (windows, linux):
        assert _ROOT_CA_CONTAINER_PATH in implementation
        assert "root.key" not in implementation
        assert _STATE_FILE in implementation
        assert "MANUALITO_LOCAL_CA_SKIP_STORE" in implementation

    assert '"-user", "-addstore", "Root"' in windows
    assert '"-user", "-delstore", "Root"' in windows
    assert "LocalApplicationData" in windows
    assert "XDG_STATE_HOME" in linux
    assert "/usr/local/share/ca-certificates" in linux
    assert "update-ca-certificates" in linux
    assert "sudo" in linux
    assert "/etc/os-release" in linux


def test_setup_offers_ca_trust_only_after_caddy_is_healthy() -> None:
    """Setup ofrece confianza una vez y CI continúa con el comando manual."""
    setup_bat = _read(_REPOSITORY_ROOT / "setup.bat")
    setup_sh = _read(_REPOSITORY_ROOT / "setup.sh")
    windows = _read(_WINDOWS_SETUP)
    linux = _read(_LINUX_SETUP)

    assert "MANUALITO_SETUP_TRUST_PROMPT" in setup_bat
    assert "MANUALITO_SETUP_TRUST_PROMPT" in setup_sh
    assert "Wait-CaddyHealthy" in windows
    assert ".\\local-ca.bat trust" in windows
    assert "wait_caddy_healthy" in linux
    assert "./local-ca.sh trust" in linux
    assert "CI" in windows
    assert "CI" in linux


def test_local_ca_cycle_and_rotation_use_an_isolated_store(
    tmp_path: Path,
) -> None:
    """Trust, rotación y untrust son idempotentes con la frontera SO omitida."""
    first_ca = _generate_test_ca(tmp_path, "Manualito Test CA One")
    second_ca = _generate_test_ca(tmp_path, "Manualito Test CA Two")
    bin_dir = tmp_path / "bin"
    state_home = tmp_path / "state"
    bin_dir.mkdir()
    _write_fake_docker(bin_dir)

    env = os.environ.copy()
    env["PATH"] = os.pathsep.join((str(bin_dir), env["PATH"]))
    env["MANUALITO_LOCAL_CA_SKIP_STORE"] = "1"
    env["MANUALITO_TEST_CA_SOURCE"] = str(first_ca)
    if os.name == "nt":
        env["LOCALAPPDATA"] = str(state_home)
    else:
        env["XDG_STATE_HOME"] = str(state_home)

    first_trust = _run_cli("trust", env)
    assert first_trust.returncode == 0, first_trust.stdout + first_trust.stderr
    state_file = _state_file(state_home)
    first_records = state_file.read_text(encoding="utf-8").splitlines()
    assert len(first_records) == 1
    assert _FINGERPRINT_PATTERN.fullmatch(first_records[0])

    status = _run_cli("status", env)
    assert status.returncode == 0, status.stdout + status.stderr
    assert first_records[0] in status.stdout

    repeated_trust = _run_cli("trust", env)
    assert repeated_trust.returncode == 0, repeated_trust.stdout + repeated_trust.stderr
    assert state_file.read_text(encoding="utf-8").splitlines() == first_records

    env["MANUALITO_TEST_CA_SOURCE"] = str(second_ca)
    rotated_trust = _run_cli("trust", env)
    assert rotated_trust.returncode == 0, rotated_trust.stdout + rotated_trust.stderr
    rotated_records = state_file.read_text(encoding="utf-8").splitlines()
    assert len(rotated_records) == 1
    assert _FINGERPRINT_PATTERN.fullmatch(rotated_records[0])
    assert rotated_records != first_records

    untrust = _run_cli("untrust", env)
    assert untrust.returncode == 0, untrust.stdout + untrust.stderr
    assert not state_file.exists()

    repeated_untrust = _run_cli("untrust", env)
    assert repeated_untrust.returncode == 0, repeated_untrust.stdout + repeated_untrust.stderr
