---
title: Resumen
description: Resumen y descriptores de la memoria del proyecto.
sidebar:
  order: 0
---

Aprender un juego de mesa puede requerir una lectura extensa de su manual, a su vez, resolver una duda durante la partida obliga a localizar la regla correspondiente. Para facilitar ambas tareas, se ha desarrollado *Manualito*, una aplicación web que permite obtener de forma ágil una explicación general del juego y plantear preguntas a un asistente de inteligencia artificial.

La aplicación extrae el texto de manuales en archivos **PDF** o imágenes, utilizando reconocimiento óptico de caracteres cuando es necesario, y permite revisarlo junto a las páginas originales. A partir de ese contenido, combina la búsqueda por palabras y por significado para seleccionar la información que reciben los modelos de lenguaje ejecutados localmente. Este enfoque de generación aumentada por recuperación busca reducir el riesgo de que el asistente invente reglas, mientras que las referencias a las páginas consultadas permiten comprobar sus respuestas.

Durante el desarrollo se compararon alternativas de reconocimiento de texto, recuperación y modelos de lenguaje para ajustar el sistema a los recursos disponibles. El resultado reúne estas funciones con la gestión de juegos, manuales y conversaciones, de modo que el usuario puede conservar la información y retomarla en futuras partidas.

## Descriptores

Juegos de mesa, aplicación web, reconocimiento óptico de caracteres, modelos de lenguaje, generación aumentada por recuperación, inteligencia artificial, procesamiento del lenguaje natural, recuperación de información, búsqueda híbrida, consulta de reglas.
