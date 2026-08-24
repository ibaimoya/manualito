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
