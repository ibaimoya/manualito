# Manualito

[![CI](https://github.com/ibaimoya/tfg/actions/workflows/ci.yml/badge.svg)](https://github.com/ibaimoya/tfg/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ibaimoya_tfg&metric=alert_status&token=fbc956ab25c51ad7a60728ae1451ce5f0457841f)](https://sonarcloud.io/summary/new_code?id=ibaimoya_tfg)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=ibaimoya_tfg&metric=coverage&token=fbc956ab25c51ad7a60728ae1451ce5f0457841f)](https://sonarcloud.io/summary/new_code?id=ibaimoya_tfg)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=ibaimoya_tfg&metric=code_smells&token=fbc956ab25c51ad7a60728ae1451ce5f0457841f)](https://sonarcloud.io/summary/new_code?id=ibaimoya_tfg)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=ibaimoya_tfg&metric=security_rating&token=fbc956ab25c51ad7a60728ae1451ce5f0457841f)](https://sonarcloud.io/summary/new_code?id=ibaimoya_tfg)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=ibaimoya_tfg&metric=reliability_rating&token=fbc956ab25c51ad7a60728ae1451ce5f0457841f)](https://sonarcloud.io/summary/new_code?id=ibaimoya_tfg)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=ibaimoya_tfg&metric=sqale_rating&token=fbc956ab25c51ad7a60728ae1451ce5f0457841f)](https://sonarcloud.io/summary/new_code?id=ibaimoya_tfg)
[![Python 3.11](https://img.shields.io/badge/python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Ollama](https://img.shields.io/badge/Ollama-000000?logo=ollama&logoColor=white)](https://ollama.com)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-9A3412?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCc+PGNpcmNsZSBjeD0nOC41JyBjeT0nMTInIHI9JzUnIGZpbGw9J3doaXRlJyBmaWxsLW9wYWNpdHk9JzAuNCcvPjxjaXJjbGUgY3g9JzE1LjUnIGN5PScxMicgcj0nNScgZmlsbD0nd2hpdGUnIGZpbGwtb3BhY2l0eT0nMC43Jy8+PGNpcmNsZSBjeD0nMTInIGN5PScxMicgcj0nNScgZmlsbD0nd2hpdGUnIGZpbGwtb3BhY2l0eT0nMScvPjwvc3ZnPg==&logoColor=white)](https://www.trychroma.com/)
[![uv](https://img.shields.io/badge/uv-6D28D9?logo=uv&logoColor=white)](https://github.com/astral-sh/uv)
[![Ruff](https://img.shields.io/badge/Ruff-261230?logo=ruff&logoColor=CA8A04)](https://github.com/astral-sh/ruff)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![HP SCDS](https://img.shields.io/badge/HP%20SCDS-Observatorio%20Tecnol%C3%B3gico-0096D6?logo=hp&logoColor=white)](https://hpscds.com/en/innovation/technological-observatory/)

Manualito es una aplicación web progresiva que permite a los usuarios fotografiar manuales de juegos de mesa y recibir una explicación en voz alta del contenido. El sistema procesa la imagen a través de un pipeline de inteligencia artificial que combina reconocimiento óptico de caracteres (OCR), recuperación aumentada por generación (RAG) y un modelo de lenguaje (LLM) para transformar el texto extraído en una explicación clara y accesible.

Proyecto desarrollado como Trabajo de Fin de Grado en el marco del [Observatorio Tecnológico HP SCDS](https://hpscds.com/en/innovation/technological-observatory/), un programa de colaboración entre HP SCDS y universidades españolas para la realización de TFGs en entorno empresarial.

---

## Tabla de contenidos

- [¿Qué hace?](#qué-hace)
- [Stack Tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Arrancar el proyecto](#arrancar-el-proyecto)
- [Tests](#tests)
- [Licencia](#licencia)

---

## ¿Qué hace?

1. Recibes el manual de un juego de mesa y no te enteras de nada
2. Le sacas una foto con el móvil
3. Manualito extrae el texto (OCR), busca contexto relevante (RAG) y genera una explicación clara (LLM)

```
Foto → Preprocesado → OCR → RAG (ChromaDB) → LLM (Ollama) → Texto
```

---

## Stack Tecnológico

| **Capa**                | **Tecnología**                                        |
|-------------------------|-------------------------------------------------------|
| API Gateway             | FastAPI (Python)                                      |
| OCR                     | Tesseract OCR por defecto, PaddleOCR CPU/GPU opcional |
| Vector DB               | ChromaDB                                              |
| RAG                     | Sentence Transformers                                 |
| LLM                     | Modelos locales vía Ollama                            |
| Frontend                | React PWA                                             |
| Gestión de dependencias | uv                                                    |
| Infraestructura         | Docker Compose                                        |

---

## Arquitectura

Cuatro servicios en contenedores independientes comunicados por red interna:

```
                  +-------------+
  App (PWA) ----->|  API (8000) |
                  +--+----+--+--+
                     |    |  |
            +--------+    |  +--------+
            |             |           |
            v             v           v
      +-----------+ +-----------+ +-----------+
      |    OCR    | |    RAG    | |    LLM    |
      | Tesseract | |  ChromaDB | |   Ollama  |
      +-----------+ +-----------+ +-----+-----+

```

- **api** — Gateway público. Valida la imagen y orquesta las llamadas a los demás servicios.
- **ocr** — Extrae texto de las imágenes con Tesseract por defecto; PaddleOCR CPU/GPU sigue disponible por configuración.
- **rag** — Recupera fragmentos relevantes del corpus de manuales almacenado en ChromaDB.
- **llm** — Genera la explicación con un modelo de lenguaje local vía Ollama (GPU).

---

## Arrancar el proyecto

Necesitas [Docker Desktop](https://www.docker.com/products/docker-desktop/) con soporte WSL2.

```bash
# Levantar todos los servicios
docker compose up --build -d

# Parar todos los servicios
docker compose down
```

La API queda expuesta en `http://localhost:8000`.

Las variables de runtime del backend se configuran en `config/backend.env`.
Docker Compose las inyecta en los servicios mediante `env_file`, así que no
hace falta pasarlas por consola.

Para usar PaddleOCR CPU en lugar de Tesseract, arranca el servicio OCR con el
override dedicado:

```bash
docker compose -f docker-compose.yml -f docker-compose.ocr-paddle-cpu.yml up --build ocr
```

Los modelos de PaddleOCR CPU se cachean en el volumen Docker
`ocr-paddlex-cpu-cache`. La variante GPU usa `docker-compose.ocr-gpu.yml` y
cachea sus modelos en `ocr-paddlex-gpu-cache`.

---

## Tests

```bash
# Instalar dependencias de test
uv sync --locked --no-default-groups --only-group test

# Ejecutar todos los tests
uv run --locked --no-default-groups --only-group test pytest -v
```

Los tests cubren los servicios API y OCR con técnicas de caja negra (BVA + EP). El servicio OCR se mockea en los tests del gateway para aislar cada capa.

---

## Licencia

[MIT](LICENSE)
