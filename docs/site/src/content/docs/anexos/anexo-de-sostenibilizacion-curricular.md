---
title: Sostenibilización curricular
description: La sostenibilidad se ha convertido en un criterio de gran importancia tanto en la formación universitaria como en el mundo profesional.
sidebar:
  order: 6
---

## Introducción

La sostenibilidad se ha convertido en un criterio de gran importancia tanto en la
formación universitaria como en el mundo profesional. Más allá del conocimiento
técnico, se espera que quien desarrolla un proyecto sepa valorar su impacto
social, económico y ambiental y tomar decisiones coherentes con un desarrollo
sostenible.

Con ese objetivo, la CRUE elaboró un conjunto de directrices para fomentar la sostenibilidad [[31](https://www.crue.org/wp-content/uploads/2020/02/Directrices_Sosteniblidad_Crue2012.pdf)],
en las que se recogen las competencias que un alumno debería adquirir. En este anexo se presenta una
reflexión personal sobre cómo se han trabajado y aplicado dichas competencias durante el desarrollo
de *Manualito*.

La reflexión se organiza en torno a las cuatro competencias en sostenibilidad que plantea
dicho marco:

- La **contextualización crítica**, que sitúa el proyecto en su
  contexto social, económico y ambiental.
- El **uso sostenible de los recursos** y la prevención de impactos
  negativos sobre el medio.
- La **participación en procesos comunitarios** orientada a favorecer la
  sostenibilidad.
- La **aplicación de principios éticos** coherentes con la
  sostenibilidad.

## Contextualización crítica

El objetivo de *Manualito* es facilitar el aprendizaje de las reglas de los juegos
de mesa, una tarea que normalmente resulta tediosa. Para lograrlo, hace uso de ciertos
modelos de IA, y trabajar con ellos me llevó a considerar su coste más allá de lo técnico,
ya que el uso de este tipo de modelos, sobre todo llevados a gran escala y alta concurrencia,
deriva en un consumo energético considerable que conviene tener en cuenta como
desarrollador.

## Uso sostenible de los recursos

Una gran parte de las decisiones que he tomado contribuyen a reducir el consumo
de recursos, en la medida en que un producto *software* puede hacerlo.

En este caso, el apartado que más recursos gasta es el modelo LLM, debido a
que requiere procesar cantidades masivas de datos simultáneamente. Por ello,
para el desarrollo y puesta en marcha de *Manualito* he optado por
utilizar modelos locales en lugar de los modelos frontera que están en la nube. Esto
reduce considerablemente la cantidad de computación necesaria para peticiones simples
como las que maneja *Manualito* y, en consecuencia, se emplean muchos menos recursos.

## Participación en procesos comunitarios

*Manualito* se apoya casi por completo en componentes OSS, como el motor
de OCR, el modelo LLM o la base de datos vectorial, entre otros.

Para seguir alineado con esta idea, el código del proyecto se ha publicado de forma
abierta [[32](https://github.com/ibaimoya/manualito)], de modo que pueda consultarse o reutilizarse.

## Aplicación de principios éticos

El desarrollo planteó dos consideraciones éticas. La primera son los derechos de
autor. *Manualito* procesa manuales que en general son obras protegidas, lo que obliga
a delimitar la frontera entre una herramienta de consulta personal y un uso que
vulnere la propiedad intelectual ajena. De hecho, es una de las razones principales por las
que no contemplo su comercialización en el estado actual.

Otra de ellas es la seguridad de los usuarios. Al manejar la aplicación cuentas y datos personales,
aun tratándose de un proyecto académico, existe una responsabilidad mínima de protegerlos, por lo que, en la medida de lo posible, he hecho especial hincapié en la gestión de sesiones
y la defensa frente a ataques habituales, y he optado por no desplegar la aplicación con
datos reales sin reforzar previamente ese apartado.
