# Manualito

[![CI](https://github.com/ibaimoya/tfg/actions/workflows/ci.yml/badge.svg)](https://github.com/ibaimoya/tfg/actions/workflows/ci.yml)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
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
4. Te la lee en voz alta (TTS)

```
Foto → Preprocesado → OCR → RAG (ChromaDB) → LLM (Ollama) → TTS → Audio
```

---

## Stack Tecnológico

| **Capa**        | **Tecnología**                  |
|-----------------|-----------------------------|
| API Gateway     | FastAPI (Python)            |
| OCR             | PaddleOCR PP-OCRv5, CPU     |
| Vector DB       | ChromaDB                    |
| LLM             | Modelos en local vía Ollama |
| Frontend        | React PWA       |
| Infraestructura | Docker Compose              |

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
      | PaddleOCR | |  ChromaDB | |   Ollama  |
      +-----------+ +-----------+ +-----+-----+
                                        |
                                        v
                                  +-----------+
                                  |    TTS    |
                                  +-----------+
```

- **api** — Gateway público. Valida la imagen y orquesta las llamadas a los demás servicios.
- **ocr** — Extrae texto de las imágenes con PaddleOCR (CPU).
- **rag** — Recupera fragmentos relevantes del corpus de manuales almacenado en ChromaDB.
- **llm** — Genera la explicación con un modelo de lenguaje local vía Ollama (GPU).

---

## Arrancar el proyecto

Necesitas [Docker Desktop](https://www.docker.com/products/docker-desktop/) con soporte WSL2.

```bash
# Levantar todos los servicios
start.bat

# Parar todos los servicios
stop.bat
```

La API queda expuesta en `http://localhost:8000`.

---

## Tests

```bash
# Instalar dependencias de test
pip install -r tests/requirements-test.txt

# Ejecutar todos los tests
cd tests
python -m pytest -v
```

Los tests cubren los servicios API y OCR con técnicas de caja negra (BVA + EP). El servicio OCR se mockea en los tests del gateway para aislar cada capa.

---

## Licencia

[MIT](LICENSE)
