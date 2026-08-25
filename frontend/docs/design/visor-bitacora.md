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

## Ronda 1 — Divergencia: v0 + V-A + V-B + V-C (2026-08-23)

Construidas las tres variantes (commits `3977bc9`, `0922e66`) y capturada la matriz completa
(48 PNGs: 4 variantes × base/busy|search/failed × desktop/móvil × light/Brasa).

**Autocrítica del lead (escrita ANTES de leer al jurado):**

- V-A: (1) papelera y recarga icon-only pegadas arriba a un mis-click, y son acciones de MANUAL
  que parecen de página; (2) el panel Original ocupa siempre aunque no aporte (failed sin imagen)
  y aún no colapsa; (3) la leyenda de dots del rail a 11px apenas respira y compite con las filas;
  (4) el % del heading serif desalinea ópticamente.
- V-B: (1) badges de hits en los dots a 9px, ilegibles y bajo mínimo funcional; (2) la página
  está indicada TRES veces (dots, meta, pager flotante); (3) el % inline al final del párrafo
  contradice la tesis de lectura pura; (4) el peek entra sin transición y tapa texto en anchos
  medios.
- V-C: (1) el preview del filmstrip a 8px es texto-como-decoración, borderline tell; (2) los
  números de línea son ruido para lectura casual, solo valen para inspección; (3) "Eliminar
  manual" a un click sin fricción en el inspector; (4) la búsqueda perdió los botones de
  siguiente/anterior coincidencia.
- Transversal: V-B y V-C no implementan aún el banner de reprocesado (escenario busy) y su estado
  failed es una frase suelta; la matriz de estados de Sol sigue pendiente en todas.

**Veredictos del jurado:**

- Paco (usuario con prisa): v0 4 · V-A 8 · V-B 6 · V-C 5. Ranking A>B>C>0. "En dos segundos sé
  dónde buscar mi regla" (A). Iconos mudos en B; consola de técnico en C; en v0 ni encontró la
  búsqueda.
- Marta (detectora de cutrez): v0 5 · V-A 8 · V-B 6 · V-C 6,5. Ranking A>C>B>0. Cazó sola el
  borde-paréntesis de v0 como rareza de plantilla; el panel Original vacío de A "comunica error";
  lavados de Brasa con poco contraste; Eliminar sin fricción en C; números de línea "VS Code".
- Rubén (pulgar y rompedor): v0 4 · V-A 7 · V-B 6 · V-C 7. Ranking A>C>B>0. El resaltado de
  búsqueda SE PELEA con los lavados de confianza; Confianza y lápiz pegados = mis-tap; metería
  emojis y basura en el buscador (no existe estado de 0 resultados); desincronía filmstrip/página
  bajo swipes salvajes en C.
- Sol (experto, capturas adjuntas): V-A 7,8 KEEP (mejor esqueleto; panel vacío parece inacabado,
  exceso de píldoras/radios/microlabels mono, dark pesado) · V-B 5,8 KILL como principal
  (excelente futuro "modo lectura") · V-C 7,2 MERGE (mejor sistema de confianza: columnas
  estables nº+texto+%, lavado solo Media/Baja; matar filmstrip-como-nav, inspector bajo demanda,
  destructivas protegidas). Precedentes: miniaturas de Acrobat como navegación, FineReader para
  resaltar dudas y NAVEGAR entre ellas con texto↔imagen sincronizados.

**Síntesis del lead (dirección CONGELADA para F3):** híbrido A+C.

1. ACEPTADO: estructura de 3 zonas de A con panel Original PLEGABLE y con estado explícito.
2. ACEPTADO con matiz: sistema de filas de C (nº línea + texto + % en columnas estables, lavado
   solo Media/Baja) pero los números de línea SOLO con el modo confianza activo (Paco y Marta los
   odian para lectura casual; Sol los quería siempre: gana la lectura casual limpia).
3. ACEPTADO (robado a FineReader vía Sol): navegación "anterior/siguiente duda" junto al toggle
   de Confianza, simétrica a la de coincidencias de búsqueda.
4. ACEPTADO (Rubén): resolver el choque resaltado-de-búsqueda vs lavados; estado de 0 resultados.
5. ACEPTADO (Paco/Rubén): etiquetas visibles o tooltips en iconos; espaciar Confianza/lápiz.
6. ACEPTADO (Marta/Sol): destructivas separadas y con confirmación; menú de manual explícito.
7. ACEPTADO (Marta): contraste de lavados en Brasa.
8. APARCADO: "Modo lectura" (B) tras congelar el visor principal; hits-badge en dots; inspector
   Detalles bajo demanda (entra en F3 si cabe, si no F4).
9. RECHAZADO: filmstrip de C como navegación (ilegible, no escala); dashboardización del
   inspector permanente.
