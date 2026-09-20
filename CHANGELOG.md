# Changelog

Todos los cambios relevantes de Manualito se documentan en este archivo.

El formato sigue [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones siguen [SemVer 2.0.0](https://semver.org/lang/es/).

## [Unreleased]

Próxima versión: `1.0.1`.

### Added

- Incorporado el contenido completo de la memoria y los anexos, con sus
  figuras, capturas, acrónimos y bibliografía.
- Añadidos los PDF descargables y las fuentes LaTeX del trabajo.
- Añadida la ampliación de figuras y la consulta de los benchmarks mediante
  gráficos y datos descargables.

### Changed

- Renovados el índice, el menú de capítulos y la presentación del buscador
  de la documentación.
- Mejoradas las transiciones, las tablas, las fórmulas y la adaptación móvil.

### Fixed

- Corregida la visualización de acentos y caracteres especiales en Markdown.
- Corregida la vuelta al índice desde las páginas de documentación.
- Mejorada la legibilidad de las figuras en el tema oscuro.

---

## [1.0.0] - 2026-09-17

Primera versión estable de Manualito.

### Added

- Corrección automática del texto OCR con reglas y apoyo del LLM, con las
  correcciones identificadas en el visor.
- Recuperación híbrida de información y sincronización periódica del índice
  de manuales.
- Lectura de manuales compartidos sin permisos de edición y carga de archivos
  mediante arrastre.
- Tutorial inicial y recorridos contextuales desde Ayuda.
- Interfaz y respuestas en español e inglés.
- Envío de correos de cuenta con Resend y plantillas en ambos idiomas.
- Web de presentación con acceso a la aplicación, documentación pública y
  benchmarks de OCR, recuperación y modelos de lenguaje.

### Changed

- Rediseñados el visor, la bienvenida, las pantallas de acceso y los estados
  de error.
- Mejoradas la navegación, la adaptación móvil, las transiciones y las
  notificaciones.
- Simplificado el arranque local con generación de secretos y selección del
  servicio de correo.

### Fixed

- Corregidos los tiempos de espera y la gestión de errores del chat, la
  atribución de fuentes y el filtrado de manuales autorizados.
- Corregidos la navegación de los tutoriales, las validaciones del registro y
  los desbordamientos de la interfaz.
- Desactivados Mailpit y su acceso desde la interfaz cuando se utiliza Resend.

### Removed

- Retirados el gestor de certificados locales y el laboratorio obsoleto del
  visor.

---

## [1.0.0-rc.1] - 2026-08-19

---


Primera versión previa de Manualito, preparada para validar el flujo completo de
la aplicación antes de la publicación estable `1.0.0`.

### Added

- Aplicación web para subir manuales de juegos de mesa y convertirlos en
  explicaciones consultables.
- Pipeline de procesamiento de manuales con soporte para imágenes, PDF y
  documentos multipágina.
- Extracción y revisión de texto mediante OCR con Tesseract por defecto y
  motores PaddleOCR opcionales.
- Estandarizado el flujo de contribución en GitHub y GitLab con convenciones de
  ramas y commits, etiquetas, plantillas de issues y hooks de pre-commit.
- Normalización, preprocesado, postprocesado y deduplicación del texto antes de
  indexarlo.
- Sistema RAG con ChromaDB, embeddings multilingües y respuestas generadas por
  un LLM local mediante Ollama.
- Búsqueda híbrida que combina el significado de la pregunta con sus términos
  literales, acotada a los manuales autorizados de cada usuario y al juego
  consultado.
- Sincronización periódica que mantiene el índice de búsqueda alineado con los
  manuales guardados y corrige las desviaciones de forma automática.
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
  validación de tipos, SonarQube Cloud y workflows de CI.
- Generación de releases automática a partir de tags.
- Flujo de release con changelog validado, archivos fuente propios y checksums
  SHA256.
- Gateway Caddy para servir la SPA y FastAPI bajo un único origen,
  con caché por tipo de recurso, cabeceras de seguridad y logs redactados.
- HTTPS local con redirección desde HTTP y persistencia de los certificados.
- Perfil opcional de Cloudflare Tunnel para app.manualito.dev, con origen TLS
  verificado, redes aisladas e infraestructura declarativa en Terraform.
- Añadido soporte para español e inglés, con selector de idioma persistente y
  respuestas del chat adaptadas al idioma seleccionado.
- Publicada la documentación de Manualito en
  [docs.manualito.dev](https://docs.manualito.dev), con buscador, navegación
  propia y contenidos de la memoria y los anexos.
