import io
import json
import os
import subprocess
import time
from collections.abc import Iterator
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from threading import Barrier, Event
from typing import Any, BinaryIO
from uuid import UUID, uuid4

import httpx
import pytest

pytestmark = pytest.mark.upload_load

_PDF_SIZE_BYTES = 95_000_000
_CONCURRENT_UPLOADS = 3
_API_CONTAINER_MEMORY = "384m"
_API_CONTAINER_MEMORY_BYTES = 384 * 1024 * 1024
_API_CONTAINER_PORT = 8000
_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


class _CoordinatedPdf(io.BufferedReader):
    """Hace que los tres cuerpos multipart comiencen a emitirse juntos."""

    def __init__(self, path: Path, barrier: Barrier, may_continue: Event) -> None:
        super().__init__(path.open("rb", buffering=0))
        self._barrier = barrier
        self._may_continue = may_continue
        self._started = False

    def read(self, size: int | None = -1, /) -> bytes:
        if not self._started:
            self._started = True
            self._barrier.wait(timeout=30)
            if not self._may_continue.wait(timeout=30):
                raise TimeoutError("La comprobacion de salud no libero las subidas")
        return super().read(size)


def test_api_stays_healthy_during_three_concurrent_95_mb_uploads(
    tmp_path: Path,
    upload_runtime: Any,
    upload_world: Any,
    upload_authenticator: Any,
) -> None:
    """Tres subidas en el máximo se aceptan sin OOM ni temporales residuales."""
    assert upload_runtime.storage_started_empty
    pdf_path = tmp_path / "manual-95mb.pdf"
    _write_exact_size_pdf(pdf_path, target_size=_PDF_SIZE_BYTES)
    assert pdf_path.stat().st_size == _PDF_SIZE_BYTES

    with _run_api_container(upload_runtime.asset_root) as base_url:
        clients = tuple(_http_client(base_url) for _ in range(_CONCURRENT_UPLOADS))
        control_client = _http_client(base_url)
        try:
            initial_health = control_client.get("/health")
            assert initial_health.status_code == 200
            identities = (
                upload_world.users[0],
                upload_world.users[0],
                upload_world.users[1],
            )
            auths = tuple(
                upload_authenticator(client, identity, upload_world.password)
                for client, identity in zip(clients, identities, strict=True)
            )
            requests = (
                (clients[0], auths[0], upload_world.game_ids[0]),
                (clients[1], auths[1], upload_world.game_ids[1]),
                (clients[2], auths[2], upload_world.game_ids[0]),
            )
            spool_before = _tree_entries(upload_runtime.spool_dir)
            all_bodies_started = Event()
            bodies_may_continue = Event()
            barrier = Barrier(_CONCURRENT_UPLOADS, action=all_bodies_started.set)

            with ThreadPoolExecutor(max_workers=_CONCURRENT_UPLOADS) as executor:
                futures = [
                    executor.submit(
                        _upload_pdf,
                        client,
                        auth,
                        game_id,
                        pdf_path,
                        barrier,
                        bodies_may_continue,
                    )
                    for client, auth, game_id in requests
                ]
                assert _wait_for_upload_bodies(all_bodies_started, futures)
                try:
                    health_response = control_client.get("/health")
                    assert health_response.status_code == 200
                finally:
                    bodies_may_continue.set()
                assert _wait_for_pending_batches(
                    upload_runtime.asset_root,
                    futures,
                    expected=_CONCURRENT_UPLOADS,
                )
                responses = [future.result(timeout=240) for future in futures]

            assert [response.status_code for response in responses] == [202, 202, 202]
            for response, (client, auth, _game_id) in zip(
                responses,
                requests,
                strict=True,
            ):
                manual_id = response.json()["manual_id"]
                detail_response = client.get(
                    f"/api/manuals/{manual_id}",
                    headers=_request_headers(auth),
                )
                assert detail_response.status_code == 200
            final_health = control_client.get("/health")
            assert final_health.status_code == 200
        finally:
            control_client.close()
            for client in clients:
                client.close()

    assert not list(upload_runtime.asset_root.rglob("*.part"))
    assert not list(upload_runtime.asset_root.rglob(".pending"))
    assert _tree_entries(upload_runtime.spool_dir) == spool_before


@contextmanager
def _run_api_container(asset_root: Path) -> Iterator[str]:
    """Ejecuta la imagen real de API con memoria y swap estrictamente acotados."""
    image = os.environ.get("UPLOAD_LOAD_API_IMAGE")
    if image is None:
        pytest.skip(
            "La carga en contenedor requiere UPLOAD_LOAD_API_IMAGE; "
            "el job programado construye y configura esa imagen."
        )
    getuid = getattr(os, "getuid", None)
    getgid = getattr(os, "getgid", None)
    if os.name != "posix" or getuid is None or getgid is None:
        pytest.skip("La carga en contenedor se ejecuta en un runner Linux con cgroups.")
    if not _docker_is_available():
        pytest.fail("UPLOAD_LOAD_API_IMAGE está configurada, pero Docker no está disponible.")

    database_url = os.environ.get("UPLOAD_LOAD_CONTAINER_DATABASE_URL")
    redis_host = os.environ.get("UPLOAD_LOAD_CONTAINER_REDIS_HOST")
    if database_url is None or redis_host is None:
        pytest.fail(
            "El job de carga debe definir las direcciones de PostgreSQL y Redis "
            "visibles desde el contenedor."
        )

    run_token = os.environ.get("GITHUB_RUN_ID", uuid4().hex)
    container_name = f"manualito-upload-load-api-{run_token}-{uuid4().hex[:8]}"
    container_env = os.environ.copy()
    container_env.update(
        {
            "APP_VERSION": "upload-load-test",
            "ASSET_STORAGE_DIR": "/app/storage/assets",
            "DATABASE_URL": database_url,
            "REDIS_ALLOW_EMPTY_PASSWORD": "true",
            "REDIS_HOST": redis_host,
            "REDIS_PASSWORD": "",
            "REDIS_PORT": os.environ.get("REDIS_PORT", "6379"),
            "TMPDIR": "/app/storage/assets/.spool",
        }
    )
    created = False
    try:
        result = _docker(
            "run",
            "--detach",
            "--pull",
            "never",
            "--name",
            container_name,
            "--label",
            "dev.manualito.test=upload-load",
            "--label",
            f"dev.manualito.test-run={run_token}",
            "--memory",
            _API_CONTAINER_MEMORY,
            "--memory-swap",
            _API_CONTAINER_MEMORY,
            "--pids-limit",
            "256",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777",
            "--add-host",
            "host.docker.internal:host-gateway",
            "--publish",
            f"127.0.0.1::{_API_CONTAINER_PORT}",
            "--mount",
            f"type=bind,source={asset_root.resolve()},target=/app/storage/assets",
            "--user",
            f"{getuid()}:{getgid()}",
            "--env-file",
            str(_REPOSITORY_ROOT / "config/backend.env"),
            "--env-file",
            str(_REPOSITORY_ROOT / "config/ocr.env"),
            "--env-file",
            str(_REPOSITORY_ROOT / "config/celery.env"),
            "--env-file",
            str(_REPOSITORY_ROOT / "config/database.env"),
            "--env",
            "APP_VERSION",
            "--env",
            "ASSET_STORAGE_DIR",
            "--env",
            "DATABASE_URL",
            "--env",
            "REDIS_ALLOW_EMPTY_PASSWORD",
            "--env",
            "REDIS_HOST",
            "--env",
            "REDIS_PASSWORD",
            "--env",
            "REDIS_PORT",
            "--env",
            "TMPDIR",
            image,
            env=container_env,
        )
        created = True
        assert result.stdout.strip(), "Docker no devolvió el identificador del contenedor API."
        _assert_container_limits(container_name)
        base_url = _wait_for_container_health(container_name)
        yield base_url
    finally:
        if created:
            _stop_and_assert_clean_container_exit(container_name)
        else:
            _docker("rm", "--force", container_name, check=False)


def _docker_is_available() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            cwd=_REPOSITORY_ROOT,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _docker(
    *args: str,
    env: dict[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            ["docker", *args],
            cwd=_REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("Docker no pudo ejecutar la prueba de carga.") from exc
    if check and result.returncode != 0:
        detail = result.stderr.strip()[-2_000:] or "sin detalle en stderr"
        raise RuntimeError(f"Docker falló durante la prueba de carga: {detail}")
    return result


def _docker_inspect(container_name: str, section: str) -> dict[str, object]:
    result = _docker(
        "inspect",
        "--format",
        f"{{{{json .{section}}}}}",
        container_name,
    )
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Docker inspect no devolvió un objeto para {section}.")
    return payload


def _assert_container_limits(container_name: str) -> None:
    host_config = _docker_inspect(container_name, "HostConfig")
    assert host_config["Memory"] == _API_CONTAINER_MEMORY_BYTES
    assert host_config["MemorySwap"] == _API_CONTAINER_MEMORY_BYTES
    assert host_config["ReadonlyRootfs"] is True
    assert host_config["PidsLimit"] == 256


def _wait_for_container_health(container_name: str) -> str:
    published = _docker("port", container_name, f"{_API_CONTAINER_PORT}/tcp").stdout.strip()
    if not published:
        raise RuntimeError("Docker no publicó el puerto HTTP de la API.")
    host_port = published.splitlines()[0].rsplit(":", maxsplit=1)[-1]
    base_url = f"http://127.0.0.1:{host_port}"
    deadline = time.monotonic() + 90
    last_status = "starting"

    while time.monotonic() < deadline:
        state = _docker_inspect(container_name, "State")
        if state.get("Running") is not True:
            logs = _container_logs(container_name)
            raise RuntimeError(f"La API en contenedor terminó antes del healthcheck.\n{logs}")
        health = state.get("Health")
        if isinstance(health, dict):
            last_status = str(health.get("Status", "unknown"))
        if last_status == "healthy":
            try:
                response = httpx.get(
                    f"{base_url}/health",
                    timeout=2,
                    trust_env=False,
                )
            except httpx.HTTPError:
                pass
            else:
                if response.status_code == 200:
                    return base_url
        time.sleep(0.25)

    logs = _container_logs(container_name)
    raise RuntimeError(f"La API no quedó healthy (estado {last_status}) dentro del plazo.\n{logs}")


def _stop_and_assert_clean_container_exit(container_name: str) -> None:
    try:
        state = _docker_inspect(container_name, "State")
        if state.get("Running") is True:
            _docker("stop", "--time", "20", container_name)
        final_state = _docker_inspect(container_name, "State")
        if final_state.get("OOMKilled") is True:
            logs = _container_logs(container_name)
            raise AssertionError(f"El contenedor API fue terminado por OOM.\n{logs}")
        exit_code = final_state.get("ExitCode")
        if exit_code != 0:
            logs = _container_logs(container_name)
            raise AssertionError(
                f"El contenedor API terminó con código {exit_code}, sin OOM.\n{logs}"
            )
    finally:
        _docker("rm", "--force", container_name, check=False)


def _container_logs(container_name: str) -> str:
    result = _docker("logs", "--tail", "200", container_name, check=False)
    return (result.stdout + result.stderr).strip()


def _http_client(base_url: str) -> httpx.Client:
    return httpx.Client(
        base_url=base_url,
        timeout=httpx.Timeout(240, connect=10),
        trust_env=False,
    )


def _upload_pdf(
    client: httpx.Client,
    auth: Any,
    game_id: UUID,
    pdf_path: Path,
    barrier: Barrier,
    may_continue: Event,
) -> httpx.Response:
    with _CoordinatedPdf(pdf_path, barrier, may_continue) as source:
        return client.post(
            "/api/manuals",
            data={"game_id": str(game_id)},
            files={"pdf": ("manual.pdf", source, "application/pdf")},
            headers=_request_headers(auth),
        )


def _request_headers(auth: Any) -> dict[str, str]:
    cookie_header = "; ".join(f"{name}={value}" for name, value in auth.cookies.items())
    return {**auth.headers, "Cookie": cookie_header}


def _wait_for_pending_batches(
    asset_root: Path,
    futures: list[Future[httpx.Response]],
    *,
    expected: int,
) -> bool:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            pending_count = sum(1 for _path in asset_root.rglob(".pending"))
        except OSError:
            pending_count = 0
        if pending_count >= expected:
            return True
        if all(future.done() for future in futures):
            return False
        time.sleep(0.01)
    return False


def _wait_for_upload_bodies(
    started: Event,
    futures: list[Future[httpx.Response]],
) -> bool:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if started.wait(timeout=0.05):
            return True
        for future in futures:
            if future.done():
                future.result()
    return False


def _tree_entries(root: Path) -> set[str]:
    return {path.relative_to(root).as_posix() for path in root.rglob("*")}


def _write_exact_size_pdf(path: Path, *, target_size: int) -> None:
    """Genera un PDF de una página con un stream disperso no referenciado."""
    padding_size = target_size - 2_048
    for _attempt in range(10):
        offsets: list[int] = []
        with path.open("w+b") as destination:
            destination.write(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
            _write_pdf_object(
                destination,
                offsets,
                1,
                b"<< /Type /Catalog /Pages 2 0 R >>",
            )
            _write_pdf_object(
                destination,
                offsets,
                2,
                b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            )
            _write_pdf_object(
                destination,
                offsets,
                3,
                (
                    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] "
                    b"/Resources << >> /Contents 4 0 R >>"
                ),
            )
            _write_pdf_object(
                destination,
                offsets,
                4,
                b"<< /Length 0 >>\nstream\n\nendstream",
            )
            offsets.append(destination.tell())
            destination.write(b"5 0 obj\n")
            destination.write(f"<< /Length {padding_size} >>\nstream\n".encode())
            if padding_size:
                destination.seek(padding_size - 1, io.SEEK_CUR)
                destination.write(b"\0")
            destination.write(b"\nendstream\nendobj\n")
            xref_offset = destination.tell()
            destination.write(b"xref\n0 6\n0000000000 65535 f \n")
            for offset in offsets:
                destination.write(f"{offset:010d} 00000 n \n".encode())
            destination.write(
                (f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n").encode()
            )
            actual_size = destination.tell()
        if actual_size == target_size:
            return
        padding_size += target_size - actual_size
    raise AssertionError("No se pudo ajustar el PDF al tamaño requerido")


def _write_pdf_object(
    destination: BinaryIO,
    offsets: list[int],
    object_number: int,
    content: bytes,
) -> None:
    offsets.append(destination.tell())
    destination.write(f"{object_number} 0 obj\n".encode())
    destination.write(content)
    destination.write(b"\nendobj\n")
