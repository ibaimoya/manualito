---
title: Introducción
description: Contexto, propósito y materiales del proyecto Manualito.
sidebar:
  order: 1
---

En ocasiones, ya sea en familia, con amigos o en solitario, tenemos ganas de probar un juego de mesa nuevo. Sin embargo, nos echamos atrás al ver la cantidad de reglas e instrucciones que hay que leer y entender antes de empezar a jugar.

Además, haber leído el manual no significa que hayamos comprendido todas las reglas. Durante una partida pueden aparecer dudas sobre una acción, una excepción o una situación que no habíamos previsto. Para resolverlas, hay que volver al reglamento y buscar la explicación que corresponde a ese caso en concreto.

Para ayudar en estas situaciones, se ha desarrollado *Manualito*, una aplicación web que permite obtener de forma ágil una explicación general de un juego de mesa y plantear dudas sobre sus reglas a un asistente de inteligencia artificial que se encarga de consultar los manuales para resolverlas.

En su estudio sobre el uso de herramientas digitales en juegos de mesa, Rogerson y sus colaboradores destacan la importancia de integrarlas en la experiencia de juego sin que se conviertan en una distracción [[1](https://cdn.svc.asmodee.net/gil/uploads/2022/01/Rogerson-al-More-Than-a-Gimmick-2021.pdf)]. En esta línea, *Manualito* se plantea como una herramienta de apoyo a la que acudir cuando surge una duda sobre las reglas durante la partida.

Para utilizar la aplicación, el usuario puede añadir los manuales en archivos PDF o imágenes y asociarlos al juego correspondiente. A partir de ellos se extrae el texto, utilizando reconocimiento óptico de caracteres, denominado OCR, cuando es necesario. El texto obtenido se puede revisar junto a las páginas originales y corregir si contiene errores. Los manuales y las conversaciones se guardan para poder volver a consultarlos en otra partida.

Las respuestas se generan con un modelo de lenguaje al que se proporciona información de los manuales. Para encontrar los pasajes relacionados con una pregunta se utiliza generación aumentada por recuperación, conocida como RAG por *Retrieval-Augmented Generation* [[2](https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html)]. La búsqueda se limita a los manuales del juego a los que el usuario tiene acceso. Los fragmentos encontrados se envían al modelo como contexto y la respuesta se muestra junto a referencias a las páginas recuperadas, para que el usuario pueda consultar su contenido.

Toda esta estructura busca reducir el riesgo de alucinaciones, es decir, de que el asistente invente reglas o detalles al responder [[3](https://arxiv.org/abs/2509.04664)]. Para ello, el modelo recibe información de los manuales relacionada con la pregunta del usuario. La posibilidad de corregir el texto extraído y consultar las páginas originales permite, además, detectar errores y comprobar las explicaciones en su contexto.

Aunque *Manualito* se centra en explicar juegos de mesa, el mismo enfoque podría adaptarse a otros ámbitos en los que sea necesario consultar manuales o seguir procedimientos. Un ejemplo sería la consulta de protocolos de actuación ante un incidente de ciberseguridad, donde puede ser necesario combinar instrucciones de análisis, recuperación de sistemas y protección de datos. Los juegos de mesa sirven así como caso de estudio, mientras que su aplicación en otros contextos requeriría adaptar el sistema y evaluar sus respuestas.

## Materiales del proyecto

<div id="intro:materiales"></div>

La aplicación, el código fuente, la documentación y los materiales de evaluación del proyecto se encuentran en los siguientes recursos:

- **Sitio web del proyecto.** Presenta *Manualito* y sirve como punto de entrada en <https://manualito.dev/>.
- **Aplicación web.** La versión desplegada puede consultarse en <https://app.manualito.dev/>.
- **Repositorio de GitHub.** Incluye la aplicación y los archivos necesarios para preparar y ejecutar el entorno en <https://github.com/ibaimoya/manualito> [[4](https://github.com/ibaimoya/manualito)].
- **Repositorio de GitLab.** Conserva la copia de desarrollo del proyecto. Puede consultarse en [gitlab.com/HP-SCDS/Observatorio/2025-2026/manualito/ubu-manualito](https://gitlab.com/HP-SCDS/Observatorio/2025-2026/manualito/ubu-manualito) [[5](https://gitlab.com/HP-SCDS/Observatorio/2025-2026/manualito/ubu-manualito)].
- **Documentación web.** Reúne las guías de uso y la documentación técnica del proyecto. Puede consultarse en <https://docs.manualito.dev/> [[6](https://docs.manualito.dev/)].
- **Benchmarks.** Los *notebooks* y resultados de las pruebas se pueden consultar en el directorio [`docs/benchmarks`](https://github.com/ibaimoya/manualito/tree/master/docs/benchmarks) del repositorio de GitHub [[7](https://github.com/ibaimoya/manualito/tree/53987baab44997afda1fdf073b79e53adddafa77/docs/benchmarks)].
