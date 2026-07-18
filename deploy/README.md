# Despliegue local

Esta carpeta contiene el arranque local de Manualito. El flujo normal no es
llamar a `docker compose` a mano, sino usar los scripts de la raíz.

## Resumen rápido
`setup` prepara la configuración local, `start` arranca la aplicación y `stop`
la detiene con el mismo perfil.

La aplicación completa queda en `https://localhost`; `http://localhost`
redirige con 308 y la API solo se alcanza bajo `/api/*`. OpenAPI está disponible
en `https://localhost/docs`. Flower y Mailpit mantienen sus puertos locales
`5555` y `8025`.

### Windows

Desde la carpeta raíz del proyecto, ejecuta los scripts con doble clic o desde PowerShell:

```powershell
.\setup.bat
.\start.bat
.\stop.bat
```
Para Windows usa[Docker Desktop](https://www.docker.com/products/docker-desktop/) con soporte WSL2.

### Linux

Para Linux, desde la terminal y dentro de la carpeta raíz del proyecto:

```bash
./setup.sh
./start.sh
./stop.sh
```

En este caso el usuario que lo ejecute tiene que estar en el grupo `docker`, puedes ver una guía de como configurar
docker en Linux [aquí](https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-22-04).


## Flujo de setup

1. Comprueba Docker y Docker Compose.
2. Detecta NVIDIA si existe.
3. Comprueba si Docker puede usar la GPU NVIDIA.
4. Si Manualito ya está arrancado, pregunta si debe pararlo antes de medir VRAM.
5. Recomienda un perfil LLM.
6. Recomienda OCR.
7. Pide confirmación.
8. Guarda `deploy/local/selected.env`.
9. Prepara Docker Compose con los overrides necesarios y espera a que Caddy esté
   sano.
10. En modo interactivo, ofrece confiar una vez en la CA local. En CI o modo no
    interactivo muestra el comando manual y continúa.

La recomendación es conservadora, úsala a no ser que sepas lo que estás cambiando.

## Perfiles LLM

| Perfil | Modelo actual | Uso                                           |
| --- | --- |-----------------------------------------------|
| `CPU + low` | `granite3.3:2b` | máxima compatibilidad                         |
| `CPU + high` | `gemma4:e4b` | experimental (puede ser muy lento)            |
| `NVIDIA + low` | `granite3.3:2b` | mayor velocidad                               |
| `NVIDIA + high` | `gemma4:e4b` | perfil de referencia (mejor calidad esperada) |

Los modelos no se definen en los scripts. La fuente de verdad está aquí:

| Fichero | Contenido |
| --- | --- |
| `deploy/profiles/llm/low.env` | modelo ligero y contexto asociado |
| `deploy/profiles/llm/high.env` | modelo de mayor calidad y contexto asociado |

## OCR

| OCR | Uso |
| --- | --- |
| `tesseract` | opción conservadora |
| `paddle_cpu` | muy fiable, pero lento |
| `paddle_gpu` | mejor OCR esperado si hay NVIDIA compatible y margen de VRAM |

Si `paddle_gpu` no es viable, aparece como no disponible y no se puede elegir.
Si es viable pero no recomendable por margen de VRAM, se puede elegir bajo tu
responsabilidad.

## Estructura

| Ruta | Uso |
| --- | --- |
| `deploy/windows/manualito.ps1` | lógica común de `setup.bat`, `start.bat` y `stop.bat` |
| `deploy/linux/manualito.sh` | lógica común de `setup.sh`, `start.sh` y `stop.sh` |
| `deploy/compose/accelerators/` | overrides de aceleración |
| `deploy/compose/ocr/` | overrides de OCR |
| `deploy/profiles/llm/` | perfiles de modelo |
| `deploy/local/selected.env` | selección local generada por `setup` |
| `deploy/local/logs/` | logs completos de Docker |

`deploy/local/` es estado local de la máquina. No representa una configuración
portable del proyecto.

## HTTPS y CA local

Caddy conserva su CA en el volumen `caddy-data`; solo `root.crt` puede copiarse
al host. `root.key` nunca sale del volumen. Confiar o dejar de confiar en la CA
es una decisión explícita del usuario y `stop` no modifica el almacén de
certificados.

En Windows, la instalación se limita al almacén Root del usuario y no requiere
UAC:

```powershell
.\local-ca.bat trust
.\local-ca.bat status
.\local-ca.bat untrust
```

En Debian o Ubuntu, la implementación usa `sudo update-ca-certificates`:

```bash
./local-ca.sh trust
./local-ca.sh status
./local-ca.sh untrust
```

Las huellas que Manualito instala se registran en el estado local del usuario.
La rotación retira únicamente huellas registradas por Manualito; nunca elimina
certificados por nombre o sujeto.

## Redes y túnel opcional

- `gateway-net`: solo Caddy (`frontend`) y FastAPI (`api`). La subred fija
  delimita qué proxy puede enviar cabeceras reenviadas a Uvicorn.
- `backend-net`: API, workers, datos y servicios de IA; no tiene subred fija.
- `edge-net`: solo Caddy y `cloudflared`; no publica el listener interno
  `app.manualito.dev:8444` al host.

El stack base no arranca ningún túnel. Para habilitar Cloudflare Tunnel, primero
provisiona la infraestructura de [`terraform/`](terraform/README.md), guarda el
token en `secrets/tunnel_token.txt` y arranca el perfil explícito:

```bash
docker compose --profile tunnel up -d
```

El init `edge-ca-init` copia únicamente `root.crt` al volumen `edge-ca`.
`cloudflared` verifica con esa CA el origen HTTPS y Caddy acepta
`CF-Connecting-IP` solo desde la subred de `edge-net`. Las rutas `/docs`,
`/redoc` y `/openapi.json` responden 404 en `app.manualito.dev`.

## Logs

La consola muestra solo el progreso resumido. La salida completa de Docker queda
en `deploy/local/logs/`, con nombres como:

```text
setup-20260621-134623.log
start-20260621-134439.log
stop-20260621-134533.log
```

Si un comando falla, el script muestra la ruta del log que hay que revisar.

## Comandos útiles

Usar la recomendación sin interacción:

```bash
./setup.sh --use-recommended
```

En Windows:

```powershell
.\setup.bat --use-recommended
```

Probar el flujo sin ejecutar Docker Compose:

```bash
./setup.sh --dry-run --use-recommended
```

```powershell
.\setup.bat --dry-run --use-recommended
```

## Problemas comunes

| Síntoma | Qué hacer |
| --- | --- |
| Docker no responde | Arranca Docker Desktop o el daemon de Docker y vuelve a ejecutar el script. |
| NVIDIA aparece, pero Docker no puede usarla | Ejecuta `setup` en el mismo entorno donde vas a usar `start`; en WSL revisa la integración de Docker Desktop. |
| El perfil guardado no sirve en este entorno | Vuelve a ejecutar `setup` para regenerar `deploy/local/selected.env`. |
| Un comando de Docker falla | Abre el log indicado en `deploy/local/logs/`. |
