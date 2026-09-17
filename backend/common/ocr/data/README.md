# Léxico español adaptado al OCR

`lexico_es.txt` contiene 49.629 entradas en minúscula, una por línea y sin
duplicados. Se utiliza para validar la unión de palabras partidas por un guion
al final de una línea OCR, junto con el vocabulario de la propia página.
El archivo se carga una vez y se conserva como un conjunto en memoria.

La base procede de `content/2018/es/es_50k.txt` de
[FrequencyWords](https://github.com/hermitdave/FrequencyWords), de Hermit Dave,
distribuido bajo licencia MIT y construido sobre OpenSubtitles 2018 de OPUS.
Se almacena únicamente la palabra, sin su frecuencia. Las entradas de esta
base mantienen su orden relativo por frecuencia.

El vocabulario de dominio incluye componentes, mecánicas, conceptos de juego
y formas verbales de instrucciones, como `apilamiento`, `escaramuzador`,
`reabastecimiento`, `antihorario`, `bonificadores` y `desempatar`. La ampliación
más reciente incorpora 1.036 palabras documentadas en reglamentos en español.
Este bloque se añade al final en orden alfabético y no tiene frecuencias
calculadas. El léxico no pretende ser un diccionario completo del español.

Fuentes de vocabulario de juegos:

- [Guerra del Anillo, Devir](https://devirinvestments.s3.eu-west-1.amazonaws.com/media/8436017220797-Rules-ES-1.pdf).
- [Cthulhu: Death May Die, Asmodee](https://cdn.svc.asmodee.net/production-asmodeees/uploads/2023/06/Reglas_Cthulhu_Death_May_Die.pdf).
- [Magic: The Gathering, guía de inicio en español, Wizards of the Coast](https://media.wizards.com/2014/docs/SP_M15_QckStrtBklt_LR_Crop.pdf).
- [Reglamentos en español publicados por GMT Games](https://www.gmtgames.com/t-GMTLivingRulesSP.aspx), incluidos SpaceCorp, Blackbeard, Winds of Plunder, Conquest of Paradise, Commands & Colors: Ancients, War Galley, Galaxy, Here I Stand, Pursuit of Glory y Serpents of the Seas.
- [Ancient Civilizations of the Middle East, GMT Games](https://gmtwebsiteassets.s3.us-west-2.amazonaws.com/ACME/ACME_Rulebook_Spanish.pdf).
- [Great Battles of the American Civil War, GMT Games](https://gmtwebsiteassets.s3.us-west-2.amazonaws.com/IntoTheWoods/GBACW-Series-RuleBook-ESP.pdf).
- [Carcassonne, variante en solitario, Devir](https://devir.mx/wp-content/uploads/2020/05/Carcassonne-Variante-Solitario.pdf), [El gran libro de la locura, Devir](https://devirinvestments.s3.eu-west-1.amazonaws.com/media/8436017223569-Rules-ES-1.pdf) y [SIX, FoxMind](https://foxmind.com/wp-content/uploads/2019/10/six_rules.pdf).

Las fuentes sirven para documentar palabras individuales. No se distribuye
el texto de los reglamentos ni se consultan servicios externos al ejecutar el OCR.
