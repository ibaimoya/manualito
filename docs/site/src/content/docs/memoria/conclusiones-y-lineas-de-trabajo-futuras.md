---
title: Conclusiones y Líneas de trabajo futuras
description: Conclusiones del proyecto y líneas de trabajo futuras.
sidebar:
  order: 7
---

El resultado del proyecto comprende tanto la aplicación desarrollada como el aprendizaje adquirido al construirla, y deja abiertas distintas posibilidades para continuar trabajando en *Manualito*.

## Conclusiones

<div id="conclusiones:balance"></div>

Al relacionar el trabajo realizado con los objetivos planteados, se pueden extraer las siguientes conclusiones:

- Se ha desarrollado una aplicación web que reúne la gestión de juegos, manuales y conversaciones con la generación de explicaciones y la consulta de dudas, dando forma al objetivo de ofrecer una herramienta de apoyo antes y durante una partida.
- La ejecución local de los modelos ha requerido adaptar las decisiones técnicas a los recursos disponibles, por lo que la investigación y las pruebas han formado parte del desarrollo. Comparar alternativas ha servido para valorar tanto sus resultados como las condiciones necesarias para incorporarlas a la aplicación.
- El proyecto ha permitido aplicar conocimientos del grado y profundizar en el procesamiento de documentos, la inteligencia artificial y el desarrollo web. Al abordar también la interfaz, la seguridad, las pruebas y el despliegue, se ha adquirido una visión más completa del trabajo necesario para publicar una aplicación.
- El uso supervisado de agentes ha servido para explorar el desarrollo agéntico en tareas concretas, desde la escritura de código repetitivo hasta la elaboración de pruebas. Su utilización ha requerido comprender y comprobar las soluciones propuestas antes de incorporarlas, manteniendo el criterio propio sobre la arquitectura y el diseño.
- La organización por iteraciones ha ayudado a revisar las prioridades y adaptar el trabajo a las necesidades que iban apareciendo. Esta experiencia refuerza la importancia de acotar el alcance y reservar tiempo para integrar, probar y pulir las funcionalidades desarrolladas.

## Líneas de trabajo futuras

<div id="conclusiones:trabajo-futuro"></div>

El tiempo disponible ha limitado el alcance del proyecto, por lo que seguir trabajando en *Manualito* permitiría retomar algunas funcionalidades pendientes y abordar nuevas ampliaciones como las siguientes:

- **Administración y moderación de manuales.** Desarrollar un panel para gestionar usuarios y revisar los manuales subidos, de modo que puedan retirarse los archivos que no correspondan a un manual o cuya calidad impida leer sus páginas o empeore notablemente la calidad de las respuestas del LLM.
- **Recomendación de juegos.** Durante el proyecto se exploró, como iniciativa paralela, un recomendador basado en *Machine Learning* (ML) para ayudar al usuario a descubrir nuevos juegos, pero faltó tiempo para pulirlo e incorporarlo a la entrega. Esta línea podría retomarse revisando las recomendaciones obtenidas y completando los ajustes y las pruebas necesarios para valorar su integración.
- **TTS.** La síntesis de voz permitiría escuchar las explicaciones y respuestas sin consultar continuamente la pantalla, aunque se descartó por las limitaciones del *hardware* disponible. Retomarla requeriría estudiar una solución que genere el audio sin perjudicar el funcionamiento del resto de la aplicación.
