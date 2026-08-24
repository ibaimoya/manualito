# Bitácora del rediseño del visor

Acta por ronda de la campaña de prototipos (ver `frontend/PLAN.md` para reglas y estado).
Cada ronda: cambios · veredictos del jurado (Paco, Marta, Rubén + Sol) · síntesis con
aceptado/rechazado/aparcado motivado · próximos pasos · capturas asociadas.

---

## F0 — Andamiaje del laboratorio (2026-08-23)

Laboratorio `/lab` operativo con el manual sintético "Cumbres" (6 estados de página, 3 bandas de
confianza, hits de búsqueda, escenario busy), switcher flotante y capturas Playwright deterministas
(12: base/busy/search × desktop/móvil × light/dark).

**Primer diagnóstico a la vista de `v0-base-desktop-light.png` (la línea base actual en 1920px):**

- El desierto lateral es real: rail 300px + canalón vacío + caja centrada; media pantalla sin uso.
- El modo confianza infla cada línea a una banda-píldora con fondo tintado, borde curvo izquierdo y
  chip a la derecha: pesado, repetitivo, y grita "juguete". Es LA superficie a domar sin perder lo
  que a Ibai le gusta (color por banda + leyenda).
- El rail usa tarjetas gordas de borde 2px con folio decorativo; la leyenda de estados queda
  apretada en 2 columnas arriba.
- La página acaba a media pantalla y el resto es vacío sin intención.

Material listo para la auditoría formal de F1.

## F1 — Brief + revisión de Sol (2026-08-23)

Brief escrito (`visor-brief.md`): auditoría con 8 causas del "de juguete" (la estrella: el modo
confianza usa el tell nº 1 de UI generada, side-tab border + fondo tintado por fila), 15
movimientos concretos, checklist anti-tells destilada de impeccable.style (61 tells) + catálogo
propio, defensa de identidad crema/serif como marca frente al "tasteful default" IA.

**Veredicto de Sol: aprobar con cambios.** Síntesis del lead:
- ACEPTADO con forma propia (la condición gorda): la regla de 2px sola mataba el escaneo
  periférico. Solución adoptada: severidad asimétrica; Alta limpia, Media/Baja con lavado suave +
  regla 3px + % con peso. Como los problemas son minoría, escaneo vivo sin volver a las píldoras.
- ACEPTADOS: panel de imagen ocultable, validación de medida renderizada (long OCR, 375, 200%),
  matriz de estados completa (offline, imagen ausente, 0 resultados, reproceso fallido, edición
  sin guardar, foco/teclado), % ≥12px + AA por banda + severidad nunca solo color, menús
  interrumpibles con restauración de foco, guardia anti-dogma-hairline.
- Minería: maple.dev (Brasa), interior.dev (medio segundo post-clic), beautifului (loading
  honesto), rareui/morphicons (vendorables), arlan-vault (confianza de color), swamii, amicro,
  alvarosh, lucasmartinic, interior, andremooij, nachi capturados en refs/ (recent.design timeout).
