# Recetario juguetón — cómo lo hacen los que saben

Destilado de Family (benji.org/family-values + catálogo 60fps.design con 64 clips), Arc,
Emil Kowalski (recetas de animate/RECIPES, Vaul, Sonner) y Rauno Freiberg
(rauno.me/craft/interaction-design). Cada receta lleva valores copiables y dónde aplica en el
visor. Fuente de curvas y presupuestos: la colección de Emil instalada en el repo.

## Canon de curvas, duraciones y springs

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entradas y salidas UI */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* movimiento en pantalla */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* trays y sheets (Vaul/iOS) */
```

Springs (Motion): UI viva `{ type: 'spring', duration: 0.5, bounce: 0.2 }`; juguetón en
momentos raros `bounce: 0.3`; nunca más. Presupuestos: press 100-160ms, tooltip 125-200ms,
menú 150-250ms, modal/tray 200-500ms, todo lo demás <300ms. Jamás ease-in en UI. Motion
siempre con transform string completo (`transform: 'translateX(...)'`), no los shorthands
x/y/scale (no aceleran por hardware).

Los tres pilares de Family: **trays de altura variable** (un tray = un contenido o una acción,
cada uno con altura distinta, el contexto anterior visible detrás), **continuidad** (nada se
duplica ni teletransporta: los elementos viajan, "volamos en vez de teletransportarnos") y
**curva deleite-frecuencia** (cuanto menos frecuente la acción, más deleite permitido).

## Recetas aplicadas al visor

1. **Tray dinámico** (Family Dynamic Sheet Expand/Contract). Hojas móviles y diálogos como
   trays que emergen del borde inferior con `--ease-drawer` 400-500ms y CAMBIAN de altura
   animando `transform`, no `height`, cuando su contenido cambia de paso. Aplica: hoja de
   páginas, confirmaciones, diálogo de eliminar en móvil.
2. **Botón que morfa en sheet** (Family Button Morph to Sheet). El control pulsado se
   convierte en la superficie que abre, con `layoutId` compartido de Motion. Aplica:
   "Eliminar manual" del menú → diálogo; "Ver original" → cubierta de imagen.
3. **Text morph con letras compartidas** (Continue→Confirm). Cuando un botón cambia de
   etiqueta se anima el cambio, no se swapea. Aplica: Editar→Guardar, y el contador
   "8 dudas"→"Duda 1 de 8".
4. **Dígitos que ruedan** (Family Number Input Commas Shift). Contadores con tabular-nums y
   roll vertical por dígito (translateY ±100%, 200ms `--ease-out`, un solo dígito cambia a la
   vez). Aplica: 1/7 de búsqueda, N de M de dudas, % de zoom, página N de M.
5. **Spinner que migra** (Spinner Move to Bottom Navigation). Al confirmar un reproceso, el
   spinner del botón viaja (layoutId) hasta donde vivirá el progreso. Aplica: Releer página →
   dot del rail; Releer manual → banner.
6. **Toggle de confianza como transición coordinada** (la que rompió la v1). El espacio de
   contador y columnas está SIEMPRE reservado o el cambio se anima con FLIP (Motion layout):
   números de línea y % entran con fade+translateX 8px stagger 30ms, washes fade 200ms, la
   regla lateral crece con scaleY desde el centro. El botón NO se mueve bajo el cursor jamás.
7. **Cambio de página con destello direccional** (Family Fluid Tab Switch). Contenido sale
   8-12px hacia atrás y entra desde el lado del avance, 160-180ms `--ease-out`. Con teclado
   (alta frecuencia, regla Rauno): nada, cambio instantáneo.
8. **Panel plegable como carta** (Family Backup Card Scale). El panel del original colapsa
   HACIA su tirador (transform-origin en el botón), 250ms `--ease-in-out`; el contenido que no
   asienta se enmascara con blur(2px)+opacity 200ms (receta del crossfade de Emil).
9. **Press físico universal**: `scale(0.97)` 160ms `--ease-out` en todo pressable, `:active`
   real (sin gate de hover).
10. **Hover con carácter** (siempre bajo `@media (hover:hover) and (pointer:fine)`):
    translateY(-1px) + sombra cálida corta, 150ms ease. Nunca en filas de texto que se leen.
11. **Búsqueda viva**: el campo respira al enfocar (ring que crece, spring duration 0.4
    bounce 0.15); la coincidencia activa hace UN pulse al aterrizar (scale 1→1.06→1, 250ms);
    el salto entre coincidencias en sí no anima el scroll más allá del smooth nativo.
12. **Mascota en estados raros** (Family Accounts Mascot, Floating Lock Empty State). El
    meeple de Manualito flota (translateY ±4px, 3s ease-in-out alternate) en vacíos y
    pendientes; en error hace UN tilt de cabeza, no loop. Solo estados raros: ahí vive el
    presupuesto de deleite.
13. **Celebración única** (Family Backup Confetti). Al completarse la relectura entera de un
    manual: micro-confetti o pulso cálido una sola vez. Nunca en acciones frecuentes.
14. **Llegada de texto OCR**: skeleton→contenido con crossfade+blur(2px) 200ms, líneas con
    stagger 40ms solo la primera vez que la página aparece.
15. **Drag para despedir la hoja** (Sonner/Vaul): pointer capture, damping al pasar el límite
    (resistencia creciente, nunca muro), dismiss por distancia O velocidad
    `|Δ|/Δt > 0.11 px/ms`, asentamiento con spring bounce 0.2 que hereda la velocidad.
16. **Blink de confirmación** (context menu de macOS vía Rauno): al elegir una opción del
    menú, la fila parpadea una vez en accent y el menú se desvanece (fade out corto, SIN
    animación de entrada: los menús aparecen al instante).
17. **Ausencias deliberadas** (Rauno/Emil): atajos de teclado, flechas ←→, tooltips a partir
    del segundo (data-instant), y cualquier dato que se esté leyendo: sin animación. La
    ausencia también es una decisión de diseño y se documenta.
18. **Asimetría deliberada donde se decide**: mantener-para-confirmar en destructivas si
    procede (relleno clip-path 2s linear al presionar, retorno 200ms `--ease-out`).

## Herramienta por receta

- **Motion (motion.dev)**: layoutId morphs (2, 5), FLIP del toggle (6), springs y gestos
  (11, 15), AnimatePresence para salidas simétricas de trays y diálogos.
- **CSS puro**: press (9), hover (10), destello direccional (7), washes y regla (6 parcial),
  mascota (12), staggers (14), blink (16).
- **WAAPI**: dígitos que ruedan (4) si CSS se queda corto.

Reduced-motion en TODO: variante suave (solo opacity/color), nunca cero comprensión.
