"""Comprueba los scripts reales con archivos temporales y sin credenciales externas."""

import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
LOCAL_SECRETS = (
    "postgres_user.txt",
    "postgres_password.txt",
    "redis_password.txt",
    "flower_basic_auth.txt",
)


def shell_environment():
    # Windows PowerShell carga sus módulos, no los heredados de PowerShell 7.
    return {key: value for key, value in os.environ.items() if key.upper() != "PSMODULEPATH"}


def run_setup(directory: Path, *, database_exists: bool = False, dry_run: bool = False):
    if os.name == "nt":
        command = [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ROOT / "deploy/windows/secrets.ps1"),
            "-Directory",
            str(directory),
        ]
        if database_exists:
            command.append("-DatabaseExists")
        if dry_run:
            command.append("-DryRun")
    else:
        command = [
            "bash",
            str(ROOT / "deploy/linux/secrets.sh"),
            str(directory),
            str(int(database_exists)),
            str(int(dry_run)),
        ]
    return subprocess.run(
        command, env=shell_environment(), capture_output=True, timeout=20, check=False
    )


def test_creates_independent_credentials_without_printing_them(tmp_path):
    directory = tmp_path / "new install" / "secrets"
    result = run_setup(directory)

    assert result.returncode == 0, result.stderr.decode(errors="replace")
    assert sorted(path.name for path in directory.iterdir()) == sorted(LOCAL_SECRETS)
    assert (directory / "postgres_user.txt").read_text() == "manualito\n"
    passwords = []
    for name in LOCAL_SECRETS[1:]:
        value = (directory / name).read_text().strip()
        password = value.removeprefix("admin:")
        assert re.fullmatch(r"[0-9a-f]{64}", password)
        assert password.encode() not in result.stdout + result.stderr
        passwords.append(password)
    assert len(set(passwords)) == 3
    assert (directory / "flower_basic_auth.txt").read_text().startswith("admin:")


def test_preserves_existing_credentials_and_only_creates_missing_files(tmp_path):
    directory = tmp_path / "secrets"
    directory.mkdir()
    existing = {
        "postgres_user.txt": b"custom-user\n",
        "postgres_password.txt": b"existing-password\n",
        "resend_api_key.txt": b"test-provider-key\n",
        "tunnel_token.txt": b"test-tunnel-token\n",
    }
    for name, value in existing.items():
        (directory / name).write_bytes(value)

    assert run_setup(directory, database_exists=True).returncode == 0
    contents = {path.name: path.read_bytes() for path in directory.iterdir()}
    modified_times = {path.name: path.stat().st_mtime_ns for path in directory.iterdir()}
    assert all(contents[name] == value for name, value in existing.items())
    assert run_setup(directory, database_exists=True).returncode == 0
    assert contents == {path.name: path.read_bytes() for path in directory.iterdir()}
    assert modified_times == {path.name: path.stat().st_mtime_ns for path in directory.iterdir()}


@pytest.mark.parametrize("missing", ["postgres_user.txt", "postgres_password.txt"])
def test_missing_database_credential_is_not_replaced_for_existing_database(tmp_path, missing):
    directory = tmp_path / "secrets"
    directory.mkdir()
    retained = next(name for name in LOCAL_SECRETS[:2] if name != missing)
    (directory / retained).write_text("existing-value")

    assert run_setup(directory, database_exists=True).returncode != 0
    assert not (directory / missing).exists()
    assert (directory / retained).read_text() == "existing-value"
    assert len(list(directory.iterdir())) == 1


@pytest.mark.parametrize("invalid", ["empty", "whitespace", "directory"])
def test_invalid_secret_stops_without_replacing_it(tmp_path, invalid):
    directory = tmp_path / "secrets"
    directory.mkdir()
    path = directory / "redis_password.txt"
    if invalid == "directory":
        path.mkdir()
    else:
        path.write_bytes(b" \t\r\n" if invalid == "whitespace" else b"")

    assert run_setup(directory).returncode != 0
    if invalid == "directory":
        assert path.is_dir()
    else:
        assert path.read_bytes() == (b" \t\r\n" if invalid == "whitespace" else b"")
    assert len(list(directory.iterdir())) == 1


def test_dry_run_does_not_create_files(tmp_path):
    directory = tmp_path / "secrets"
    assert run_setup(directory, dry_run=True).returncode == 0
    assert not directory.exists()


@pytest.mark.skipif(os.name == "nt", reason="Permisos POSIX del setup de Linux")
def test_linux_permissions_protect_host_and_allow_container_reading(tmp_path):
    directory = tmp_path / "secrets"
    assert run_setup(directory).returncode == 0
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700
    assert all(stat.S_IMODE(path.stat().st_mode) == 0o644 for path in directory.iterdir())


@pytest.mark.skipif(os.name != "nt", reason="ACL del setup de Windows")
def test_windows_acl_only_allows_owner_system_and_administrators(tmp_path):
    directory = tmp_path / "secrets"
    assert run_setup(directory).returncode == 0
    script = """
    $paths = @($env:TEST_SECRETS_DIR) + @(Get-ChildItem $env:TEST_SECRETS_DIR).FullName
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($path in $paths) {
        $acl = Get-Acl -LiteralPath $path
        if (-not $acl.AreAccessRulesProtected) { exit 1 }
        $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
        foreach ($rule in $rules) {
            if ($rule.IdentityReference.Value -notin @($owner, 'S-1-5-18', 'S-1-5-32-544')) {
                exit 2
            }
        }
    }
    """
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command", script],
        env={**shell_environment(), "TEST_SECRETS_DIR": str(directory)},
        capture_output=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == 0, result.stderr.decode(errors="replace")


@pytest.mark.skipif(os.name == "nt", reason="Los enlaces de Windows requieren privilegios")
@pytest.mark.parametrize("link_directory", [False, True])
def test_symlinks_are_rejected_without_changing_their_target(tmp_path, link_directory):
    target = tmp_path / "original"
    target.mkdir()
    original = target / "redis_password.txt"
    original.write_text("existing-value")
    directory = tmp_path / "secrets"
    if link_directory:
        directory.symlink_to(target, target_is_directory=True)
    else:
        directory.mkdir()
        (directory / original.name).symlink_to(original)

    assert run_setup(directory).returncode != 0
    assert original.read_text() == "existing-value"
