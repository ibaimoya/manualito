# Changelog

Todos los cambios relevantes de Manualito se documentan en este archivo.

El formato sigue Keep a Changelog y las versiones siguen SemVer.

## [Unreleased]

## [1.0.0-rc.1] - 2026-06-21

Primera versión previa de Manualito, preparada para validar el flujo completo de
la aplicación antes de la publicación estable `1.0.0`.

### Added

- Aplicación web para subir manuales de juegos de mesa y convertirlos en
  explicaciones consultables.
- Pipeline de procesamiento de manuales con soporte para imágenes, PDF y
  documentos multipágina.
- Extracción y revisión de texto mediante OCR con Tesseract por defecto y
  motores PaddleOCR opcionales.
- Normalización, preprocesado, postprocesado y deduplicación del texto antes de
  indexarlo.
- Sistema RAG con ChromaDB, embeddings multilingües y respuestas generadas por
  un LLM local mediante Ollama.
- Chat por juego con conversaciones persistentes, fuentes utilizadas y
  explicaciones reutilizables.
- Autenticación con sesiones, cookies HttpOnly, CSRF, verificación de email,
  recuperación de contraseña y gestión de cuenta.
- Persistencia con PostgreSQL, SQLAlchemy async, Alembic y almacenamiento local
  de assets de manuales.
- Biblioteca de juegos, hub de juego, valoraciones, seguimiento y gestión de
  manuales asociados.
- Interfaz PWA con onboarding, navegación protegida, perfil, chat, biblioteca y
  edición del texto extraído.
- Procesamiento asíncrono con Celery, Redis y panel de monitorización con
  Flower.
- Despliegue local con Docker Compose, scripts de setup/start/stop para Windows
  y Linux, perfiles de LLM y selección de OCR.
- Documentación de arranque, despliegue local, arquitectura, pruebas y
  configuración del proyecto.
- Calidad automatizada con tests de backend y frontend, linting, cobertura,
  SonarQube Cloud y workflows de CI.
- Flujo de release con changelog validado, archivos fuente propios y checksums
  SHA256.
