# Brief de rediseño del visor — F1

Diagnóstico y movimientos concretos. Fuentes: capturas deterministas del lab (v0 = línea base),
rediseño de Linear (partes I y II), Rauno Freiberg (Invisible Details), recetas de Emil Kowalski,
catálogo de tells de impeccable.style + design-taste (§9), maple.dev (dark cálido con naranja),
interior.dev (comportamientos argumentados), beautifului.dev (loading con tiempo), rareui.com y
morphicons (vendorables).

## Por qué el visor actual "parece de juguete" (auditoría sobre capturas)

1. **Modo confianza = el tell nº 1.** Cada línea es una banda-píldora con fondo tintado, borde
   grueso curvo a la izquierda ("side-tab accent border", el tell más reconocible de UI generada)
   y chip de % a la derecha. Pesado, repetitivo, infantil.
2. **Desierto lateral.** En 1920px: rail 300px + canalón muerto + columna centrada; ~40% del
   viewport útil. La página además termina a media pantalla sin intención compositiva.
3. **rounded-2xl ubicuo** (20px) en tarjetas, cajas y banners: blobs por todas partes; tarjetas
   anidadas (caja de texto dentro de columna con más cajas dentro).
4. **Bordes gordos uniformes** (2px en rail) y jerarquía plana: todo pesa lo mismo.
5. **Estado failed:** caja gigante vacía con icon-tile + título + botón centrados y perdidos
   (otro tell: icon tile sobre heading + empty-state sobredimensionado).
6. **Rail decorativo:** folio falso con líneas de pega y -rotate en hover (mono, pero juguete);
   la leyenda apretada en 2 columnas arriba.
7. **Controles a 44px también en desktop** (densidad de móvil en pantalla grande).
8. **Móvil:** las bandas de confianza devoran el ancho; la leyenda parte en línea huérfana.

Defensa de identidad: crema + serif es MARCA de Manualito (no el "tasteful default" IA de
crema+serif+salvia). Se defiende con craft: naranja #e07a1f como acento único, serif SOLO en el
contenido del manual, y estados/detalle reales.

## Movimientos concretos (15)

1. **Layout 3 zonas en ≥1280px** (hipótesis V-A): rail compacto ~240px · columna de lectura con
   medida fija · panel de imagen original ocupando el resto. El "Ver imagen" deja de ser diálogo.
   En <1280 el panel colapsa (peek o botón); móvil conserva el flujo actual.
2. **Medida de lectura 65-70ch**: caja de texto a `max-w-[42rem]` (hoy 48rem ≈ 85-90ch).
   Serif 15.5/1.72 se mantiene: es contenido, no UI.
3. **Domar el modo confianza conservando lo que gusta** (color por banda + leyenda), revisado tras
   el veredicto de Sol (la regla fina sola mata el escaneo periférico): tratamiento ASIMÉTRICO por
   severidad. Alta = texto limpio con regla hairline discreta y % en `text-3` (el texto bueno no
   grita). Media y Baja = las que importan al escaneo: lavado de fondo suave de su banda + regla
   de 3px + % con peso. Como son minoría, el documento respira y los problemas saltan a la vista;
   nada de píldora por fila. El % a 12px mínimo, contraste AA por banda verificado en light y
   Brasa, y la severidad NUNCA solo por color (grosor de regla + presencia de lavado + peso).
   Leyenda intacta arriba (es didáctica y a Ibai le gusta).
4. **Sistema de radios de 2 niveles**: superficies 12px, controles 8px. `rounded-2xl` reservado a
   diálogos/hoja móvil. La caja de lectura pierde la card: papel directo sobre fondo con hairline.
5. **Hairline everywhere**: bordes 1px (`--m-border`), 2px solo para foco/activo. Jerarquía por
   espacio y peso tipográfico, no por borde.
6. **Toolbar única del documento**: una fila pegada a la lectura con búsqueda + confianza +
   editar + estado de página; controles h-9 en desktop (la guarda táctil global ya garantiza
   44px en coarse). Muere la doble fila suelta de controles.
7. **Rail informativo, no decorativo**: fila = nº + dot de estado + primeras palabras REALES de la
   página en 1 línea truncada + contador de hits en mono. Fuera el folio falso y el -rotate; hover
   = hairline a border-strong + traslación 0 (nada de rotaciones).
8. **Menú Acciones podado**: Reprocesar todo + Eliminar (separador hairline, sin `<hr>` con
   márgenes gordos). "Ver imagen" promocionado al layout.
9. **Estados vacíos/failed compactos**: icono 18px inline + frase + botón secundario en columna
   de lectura normal, sin caja gigante; alto natural del contenido.
10. **Banner de reprocesado estilo "loading honesto"** (beautifului): paso actual + páginas
    completadas + tiempo transcurrido en mono; progreso fino de 2px, sin caja rounded-2xl.
11. **Motion con las recetas de Emil y la regla de frecuencia de Rauno**: cambiar de página SIN
    animación de entrada (alta frecuencia); popovers/menús origin-aware 140-180ms ease-out fuerte
    y solo fade-out; búsqueda: contador con tabular-nums sin saltos; hover solo en
    `(hover:hover)`; todo tras reduced-motion. Cero bounce, cero animación de layout props.
12. **Iconografía disciplinada**: lucide stroke 1.75 en todo el visor, tamaños 14/16/18
    tokenizados, alineación óptica verificada al 200%. Trial morphicons en F4 (chevron confianza,
    Pencil↔Check) solo si sobrevive a reduced-motion y al juez.
13. **Activos sin pastel**: estados activos con borde primary + texto primary-700 sobre papel
    (fuera los rellenos primary-50 que infantilizan); primary-50 queda para superficies grandes
    tipo banner, una sola vez por vista.
14. **Tipografía de UI**: Inter para todo el chrome, jerarquía por peso (600/500/400) y 2 tamaños
    de UI (13/14px desktop); display Manrope solo en el título del manual.
15. **Dark Brasa a la maple.dev**: naranja como único acento vivo sobre marrones, mono para
    metadatos; verificación AA por banda de confianza en dark (el error/baja actual roza).

## Condiciones de Sol aceptadas (revisión del brief, veredicto: aprobar con cambios)

- El panel de imagen debe poder OCULTARSE y su breakpoint depende del espacio real; la columna de
  lectura nunca se sacrifica.
- Validar la medida renderizada con OCR largo real, 375px, zoom 200% y tamaño de texto del SO.
- Matriz de estados obligatoria antes de congelar dirección: offline/caché PWA, imagen original
  ausente, búsqueda sin resultados, reprocesado fallido o cancelado, edición sin guardar, foco y
  teclado completos, recuperación de errores. Compactar no es quitar contexto ni acciones.
- Menús/popovers interrumpibles y con restauración de foco; el contador de búsqueda y el tiempo
  transcurrido no generan anuncios ni movimiento continuo durante la lectura.
- Vigilar que el hairline-everywhere no aplane la jerarquía (jerarquía por espacio y peso).

## Checklist anti-tells (pasar en CADA ronda)

- [ ] Sin side-tab accent borders (borde grueso lateral en tarjeta/fila)
- [ ] Sin fondos tintados por fila repetidos ni chips por línea
- [ ] Sin tarjetas anidadas ni radios >12px fuera de diálogos
- [ ] Sin icon-tile encima de título en estados
- [ ] Sin eyebrows/kickers, numeración decorativa 01/02, ni dots pulsantes
- [ ] Sin gradientes decorativos, glow, glassmorphism porque sí
- [ ] Sin marquees, bounce/elastic, ni animación de width/height/top/left
- [ ] Sin em-dashes ni `;` en copy; sin buzzwords; es+en a la vez
- [ ] Sin hero-metric layout ni 3-cards idénticas
- [ ] Espaciado con escala (no un solo valor); línea <80ch; line-height ≥1.4 en multilínea
- [ ] Texto funcional ≥12px; contraste AA medido en light y Brasa
- [ ] Nada animado en interacciones de alta frecuencia (cambio de página, atajos)

## Paleta

Sin cambios en F1 (la marca se defiende con craft). Si F4 ajusta algo, se entrega en formato
coolors.co en el acta y aquí.
