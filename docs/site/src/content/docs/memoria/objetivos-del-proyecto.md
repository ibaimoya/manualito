---
title: Objetivos del proyecto
description: Objetivos generales, técnicos y personales que han guiado el desarrollo de Manualito.
sidebar:
  order: 2
---

## Objetivos generales

*Manualito* nace de una situación habitual entre quienes juegan a juegos de mesa: un manual extenso, una duda concreta a mitad de partida y ninguna forma rápida de resolverla sin releer páginas enteras. El proyecto busca que esa duda se resuelva consultando el manual real del juego, no un resumen genérico ni una respuesta que un modelo de lenguaje reconstruya de memoria y pueda acabar inventando.

Para que el manual en papel se convierta en la fuente de esas respuestas, la aplicación permite digitalizarlo desde el móvil, con fotografías o con un PDF, y lo indexa antes de responder ninguna pregunta con su contenido. Como el manual se suele fotografiar en la mesa de juego, la aplicación es una **aplicación web progresiva** (PWA, del inglés *Progressive Web App*) pensada primero para el móvil. Sobre esa base, el proyecto persigue los siguientes objetivos generales:

- Permitir que el usuario aprenda las reglas de un juego consultando su manual real, en vez de un resumen ajeno o una explicación que no pueda verificarse.
- Responder las dudas puntuales que surgen durante una partida con respuestas fieles al texto del manual, citando las páginas concretas en las que se apoyan.
- Digitalizar el manual desde el móvil, con fotografías o con un PDF, sin depender de un ordenador ni de una copia digital previa del reglamento.
- Reutilizar los manuales que comparte la comunidad, de modo que el primer manual subido de un juego sirva también a quienes lleguen después.
- Funcionar con modelos de lenguaje locales, sin depender de servicios externos, y respetar la privacidad de los manuales y los datos que cada usuario sube.

El anexo B recoge el catálogo completo de requisitos funcionales y no funcionales del proyecto, junto con los 25 casos de uso que se derivan de ellos.

## Objetivos técnicos

Estos objetivos generales se han traducido en decisiones técnicas concretas, tomadas para que el sistema resultante fuera mantenible y no solo funcionara en una demostración.

La aplicación se despliega como un conjunto de servicios independientes orquestados con Docker Compose. Una pasarela construida con FastAPI concentra la autenticación y la validación, y desde ahí orquesta el resto de servicios. El reconocimiento de texto, la recuperación semántica y la generación de respuestas corren cada uno en su propio contenedor, junto a PostgreSQL, Redis, ChromaDB y Ollama, que se ejecutan como servicios propios. Separar el sistema así permite sustituir o escalar una pieza sin arrastrar a las demás, y aislar dependencias que no tienen sentido fuera de su servicio, como las bibliotecas de visión que solo necesita el motor de reconocimiento de texto. El frontend es una aplicación React que se sirve como PWA.

El servicio de **reconocimiento óptico de caracteres** (OCR, del inglés *Optical Character Recognition*) sigue un patrón de fábrica que permite intercambiar el motor sin tocar el resto del sistema: Tesseract corre por defecto, y PaddleOCR queda disponible como alternativa opcional. El texto que extrae llega al servicio de **generación aumentada por recuperación** (RAG, del inglés *Retrieval-Augmented Generation*), que lo normaliza, lo divide en fragmentos y lo indexa en ChromaDB con un modelo de embeddings multilingüe. Así, la recuperación funciona igual en español y en inglés, sin mantener dos índices distintos. Las respuestas las redacta un **gran modelo de lenguaje** (LLM, del inglés *Large Language Model*) que corre en local a través de Ollama, lo que evita enviar el contenido de los manuales a un servicio externo.

PostgreSQL es la fuente de verdad de la aplicación: conserva cuentas, juegos, manuales, páginas, conversaciones y valoraciones, con las migraciones gestionadas por Alembic. El procesamiento de un manual (reconocimiento, indexación y generación) se ejecuta en segundo plano con Celery, de modo que no bloquea la interfaz. Las tareas se reparten en colas según su tipo y Flower sirve como panel para vigilar su estado.

La sesión de cada usuario se protege con cookies HttpOnly y con un token contra la **falsificación de peticiones entre sitios** (CSRF, del inglés *Cross-Site Request Forgery*) en cada operación que modifica datos. Las operaciones sensibles, como el inicio de sesión o la recuperación de contraseña, quedan además limitadas en frecuencia para dificultar los ataques por fuerza bruta.

La calidad del código se comprueba en cada cambio: tests automáticos con cobertura, lint y un análisis de SonarQube Cloud se ejecutan en la **integración continua** (CI, del inglés *Continuous Integration*) antes de aceptar un cambio en la rama principal. El despliegue, por su parte, es reproducible y está publicado. Caddy sirve el frontend y encamina las peticiones a la pasarela bajo un único origen con la conexión cifrada, y un túnel de Cloudflare opcional permite publicar la aplicación en internet sin abrir puertos en la máquina que la aloja.

Antes de fijar cada pieza del *pipeline* de **inteligencia artificial** (IA), el proyecto se ha propuesto compararlas de forma reproducible: motores OCR, modelos de *embeddings*, estrategias de fragmentación de texto, mecanismos de recuperación y modelos de lenguaje. Los *benchmarks* quedan documentados en cuadernos propios, con el método, las tablas y las gráficas que respaldan cada decisión.

## Objetivos personales

*Manualito* ha exigido integrar de extremo a extremo tres piezas que hasta entonces solo se conocían por separado: el reconocimiento de texto, la recuperación de información y un modelo de lenguaje local, conectadas en un mismo *pipeline* y no como ejercicios aislados. Ese ensamblaje ha sido uno de los objetivos personales del proyecto.

Otro objetivo ha sido no fijar ninguna pieza del *pipeline* sin medirla antes: elegir un motor OCR, un modelo de *embeddings* o un modelo de lenguaje a partir de una comparación reproducible, en lugar de una intuición o de la opción más popular. Esa misma disciplina se ha aplicado al proceso de trabajo. El flujo se basa en ramas, revisiones de código, integración continua y versiones etiquetadas, en vez de subir cambios sueltos directamente a la rama principal.

Por último, desplegar y mantener la aplicación en un entorno propio, con contenedores, un dominio y certificados reales, ha supuesto aprender a operar un sistema en producción y no solo a construirlo.
