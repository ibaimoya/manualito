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

## Rondas 2 y 3 — Convergencia: híbrido A+C completo (2026-08-23)

**Ronda 2** (`8d9a466`): reescrito V-A con la síntesis congelada. Filas estables con números
solo en modo confianza, navegación de dudas junto al toggle, búsqueda con anterior/siguiente y
estado de 0 resultados, marca de búsqueda con anillo (ya no choca con lavados), acciones tras
menú ⋯ con Eliminar separado y en rojo, panel Original plegable con placeholder intencional y
estado sin escaneo, lavados subidos a /75 y /85, leyenda a 12px, tooltips en iconos.

**Ronda 3** (`2169965`): opciones avanzadas al completo. Modo edición (textarea serif de la
misma medida, Guardar primario, Cancelar con confirmación de descarte si hay cambios, búsqueda
y Confianza bloqueadas, navegación de página deshabilitada), diálogo modal de eliminar (scrim,
Escape, foco inicial en Cancelar), zoom del panel Original (−/%/+ por anchura, con scroll al
desbordar), menú que cierra al clic fuera, «Sin dudas» en vez de «0 dudas» con chevrons,
divider huérfano del estado failed eliminado. Nuevo `scripts/lab-interactions.mjs` (Playwright)
para capturar estados interactivos: edición sucia, descarte, menú, diálogo ×2 temas, zoom, busy.

**Autocrítica del lead (antes del jurado):** faltaba todo lo de la ronda 3 (por eso se hizo);
el «0 dudas» era ruido; el divider huérfano en failed; el zoom por `scale` CSS no desbordaba
con scroll (corregido a anchura).

**Veredictos del jurado (sobre las capturas de rondas 2+3):**

- Paco 6/10. El buscador y la edición se entienden a la primera; el diálogo de borrar "de
  sobra claro". Estorban: iconos sin nombre (⋯, zoom), la jerga (Confianza, dudas, Duplicada,
  %) que "parece un boletín de notas", y el busy poco obvio (le daría clics pensando que está
  colgada). Pide esconder la telemetría de la vista normal (ya es así: conf va apagada por
  defecto; la captura la llevaba activada).
- Marta 7/10. "Más cerca de producto pulido que de prototipo"; salva el contorno naranja de
  página activa, la pareja sans/serif y el sistema de confianza en claro. Caza: tirador de
  resize nativo del textarea, tres escalas de radio conviviendo, diálogo de eliminar "de
  librería sin retocar" (scrim gris, botón destructivo salmón sin fuerza en Brasa), lavados de
  Brasa casi invisibles, azul Editada ≈ azul Pendiente, dots del rail redundantes con el badge.
  Reportó la fila del 72% sin lavado: verificado con recorte ampliado que SÍ lo lleva (falso
  positivo por reescalado), lo que confirma que el lavado error en claro es demasiado tímido.
- Rubén 7/10. Se quedaría en la app. Rompedores: dos pares de flechas gemelas (coincidencias y
  dudas) apiladas que confunden, la barra de búsqueda apelotonada a 375px (tocaría la X
  queriendo la flecha), el ⋯ inalcanzable con el pulgar, el gesto atrás del móvil saltándose la
  confirmación de descarte, dobles taps en Guardar/Eliminar.
- Sol 7,3/10 ITERAR (arquitectura A+C intacta, aún no pasar al micropulido). Por superficie:
  lectura+confianza "la parte más lograda"; móvil "no publicable todavía" (lectura empieza a
  ~300px, rail sin pista de scroll, original inaccesible, targets de 24-32px); Brasa con bordes
  a 1,4:1-2,5:1 (necesitan 3:1 no textual) y colores que repiten función; foco sin atrapar en
  el modal ni devolución al cerrar; failed ofrece "sube una versión más nítida" pero solo hay
  Releer; zoom recorta sin affordance de paneo ni Ajustar. Tells restantes: misma píldora para
  todo, leyenda "de panel de laboratorio", exceso de microlabels mono, sombras genéricas,
  iconos de biblioteca sin adaptar. Sus 5 arreglos: recomponer móvil (barra 44px + hoja de
  páginas + Ver original), semántica de Brasa, foco/estados transitorios, toolbar con
  «Coincidencia 1 de 7»/«Duda 1 de 8» separadas y targets 44px, recuperación (Sustituir imagen
  primaria) y zoom completo.

**Síntesis del lead (plan de Ronda 4):**

1. ACEPTADO (Sol 1, Rubén 1-2): recomponer móvil. Barra de página compacta 44px con hoja de
   páginas, búsqueda con aire (contador/flechas con targets dignos), acceso «Ver original».
2. ACEPTADO (Sol 4, Rubén 1): toolbar con grupos separados y contadores con posición
   («Coincidencia N de M», «Duda N de M»); el botón Editar en modo activo pasa a decir «Salir».
3. ACEPTADO (Marta 1, Sol 2): contraste de lavados en ambos temas (el error claro también),
   bordes funcionales a 3:1 en Brasa, botón destructivo con fuerza en Brasa.
4. ACEPTADO (Marta 3): diálogo de eliminar en paleta propia (scrim cálido, card crema/Brasa).
5. ACEPTADO (Marta 2): resize-none en el textarea + escala de radios unificada.
6. ACEPTADO (Sol 3): foco al abrir confirmación de descarte en «Seguir editando»; en el lab se
   documenta que el porte F5 usará el Dialog de Radix (trap + inert + devolución de serie).
7. ACEPTADO (Sol 5): failed con «Sustituir imagen» primaria y «Reintentar lectura» secundaria;
   zoom con «Ajustar» y affordance de scroll.
8. ACEPTADO (Marta): dot de Pendiente a neutro para separarlo de Editada.
9. APARCADO: hoja de detalles bajo demanda; sombras direccionales cálidas y sustitución de
   iconos (F4, junto al motion); anuncio aria-live del busy (F5 con datos reales).
10. RECHAZADO (Sol/Marta pedían retirar la leyenda o los dots): la leyenda de estados es
    requisito de Ibai (retocable, no eliminable). Se mantiene con los dots como escaneo
    periférico; la redundancia dot+texto es deliberada (color nunca solo).

## Ronda 4 — Cierre de convergencia y gate de F3 (2026-08-23)

**Cambios** (`591bf23`), aplicando la síntesis completa de la ronda anterior:

- Móvil recompuesto: el rail horizontal muere; en su lugar una barra compacta de 44px
  («Página 2 de 6» + dot de estado) que abre una hoja inferior con leyenda y listado completo,
  y un acceso «Ver original» que abre el escaneo a pantalla completa con cierre de 44px.
- Búsqueda móvil: los controles internos del campo pasan a una fila propia con
  «Coincidencia N de M» y objetivos táctiles de 44px (flechas y borrar).
- Confianza: lavados a plena fuerza en ambos temas + regla lateral de 3px por severidad
  (movimiento 3 del brief, que las rondas 2-3 habían dejado caer). Brasa por fin escanea.
- «Duda N de M» cuando hay duda activa (aria-live), «N dudas» en reposo.
- Editar en modo activo pasa a decir «Salir»; el descarte enfoca «Seguir editando».
- Página fallida: «Sustituir la imagen» primaria + «Reintentar la lectura» secundaria
  (el texto ya no promete una acción que no existe).
- Diálogo de eliminar en paleta propia: scrim cálido (#221507/45) y card sobre crema/Brasa.
- Textarea sin tirador nativo (resize-none) y MiniNav a rounded-md (escala de radios: md
  controles menores, lg controles, xl superficies elevadas).
- Dot de Pendiente a neutro (se separa del azul Editada). Escape cierra hojas y menú.
- Zoom con «Ajustar al ancho» y cursor de arrastre al desbordar.

**Verificación de Marta sobre el 72%:** recorte ampliado demuestra que el lavado SÍ estaba;
falso positivo por reescalado. Con el lavado pleno ya es indiscutible.

**Gate de F3 (pase corto de Sol sobre 6 capturas nuevas): «CONGELAR.»** Dirección congelada
con los pendientes asignados: trap de foco completo → F5 (Radix Dialog), sombras
direccionales e iconos con carácter → F4, aria-live del busy → F5, leyenda se queda
(requisito de Ibai). F3 CERRADA. Siguiente: F4, micropulido de microanimaciones.

## Ronda 5 — Rechazo de Ibai y reinicio v2 (2026-08-23 22:45)

Ibai probó el laboratorio con las manos y rechazó el resultado entero: "hay tantas cutreces
que no sé ni por dónde empezar, la ux es bastante mala", "clicas en confianza y no puedes
volver a clicar porque se ha movido el botón, además sin ningún tipo de animación", "no hay
microanimaciones, ni siquiera animaciones, no es ni un 1 por ciento de lo que querría",
"se nota que es IA", "has reutilizado muchas cosas que eran cutres cuando la idea era darle
un lavado de cara".

**Diagnóstico del lead (asumido):** el proceso validó con capturas estáticas (jurados, Sol y
yo), nadie sintió un click; hice extensión de estados en vez de profundidad de sensación; el
lavado de cara no ocurrió porque reutilicé el vocabulario visual viejo; el motion fue capa
final en vez de diseño; el gate lo dio un proxy en fotos. El CONGELAR de Sol queda anulado.

**Decisiones de Ibai:** desde cero TODO (estructura incluida), tacto de referencia Family/Arc
(juguetón), campaña nocturna autónoma sin parar hasta 2026-08-24 16:00, "mira a ver como lo
hacen los que saben".

**Arranca la campaña v2** (plan nuevo en `frontend/PLAN.md`): regla cero de no-desplazamiento
bajo el cursor, motion-first con spec por control, evidencia dinámica obligatoria (filmstrips,
vídeo, CLS=0 por interacción), lenguaje visual nuevo prohibiendo el vocabulario v1, dependencia
`motion` autorizada por el mandato de springs, y el único gate vinculante es Ibai a las 16:00.

## N0 — Recetario y evidencia dinámica (2026-08-23 23:20)

`docs/design/recetario-jugueton.md`: 18 recetas con valores minadas de Family (ensayo
family-values + catálogo de 64 clips de 60fps.design), Emil (RECIPES de la colección
instalada, Vaul, Sonner) y Rauno. Los tres pilares Family: trays de altura variable,
continuidad (nada se teletransporta) y curva deleite-frecuencia.

**Dependencia `motion` 13.1.1 instalada** (motion.dev). Justificación: el mandato Family/Arc
exige layoutId morphs (botón→sheet, spinner que migra), FLIP del toggle de confianza y
springs interrumpibles con herencia de velocidad, inexpresables en CSS. Coste ~5-18 KB gzip
según imports (tree-shakeable), solo en el bundle del visor.

`scripts/lab-film.mjs`: por interacción graba vídeo .webm, filmstrip a 0/60/120/180/240/320/480ms
y layout shift SIN filtrar hadRecentInput (el CLS clásico excluye los shifts tras input, que es
justo lo que hay que cazar aquí). Prueba de fuego: el toggle Confianza de la v1 da CLS 0.0049 y
exit 2. La herramienta detecta el defecto exacto que Ibai sintió con las manos. GATE N0 cumplido.

## N1 — Lenguaje visual v2 (2026-08-24 00:05)

`docs/design/lenguaje-visor.md` + muestra viva en `/lab?v=lang` (light y Brasa capturados).
Decisiones: metáfora mesa/papel/objetos con las sombras cálidas de marca (que la v1 no
aprovechaba), Literata Variable para la lectura (17px/1.68, nueva dep
`@fontsource-variable/literata`), título a 26px Manrope 800, mono SOLO en datos, la confianza
pasa de wash de fila a TRAZO DE ROTULADOR que abraza el texto (radios asimétricos,
box-decoration-break), leyenda en una línea tranquila con voz humana («Bien leída», «Con
dudas», «Aún leyendo»), mascota meeple flotante para estados raros, microcopy sin jerga
(«Leer de nuevo», nunca «Reprocesar»). Derivados de color propuestos: --m-paper, --hl-media,
--hl-baja (coolors en la hoja).

Evidencia dinámica: hover del botón primario verificado (translate 0 -1px + --m-shadow-sm,
transición translate/box-shadow/scale 150ms) con vídeo y filmstrip en
`.lab-shots/film/lang-hover-guardar/`. Auditoría anti-IA de la muestra: limpia. GATE N1
cumplido.
