# Campaña v2 del visor — rediseño desde cero, tacto Family/Arc

> Fichero autosuficiente y fuente de verdad. Reanudación en frío: leer este fichero ENTERO,
> después la última ronda de `docs/design/visor-bitacora.md`, relanzar el dev server
> (`preview_start` name `frontend`, abrir `http://127.0.0.1:5174/lab`) y continuar en la primera
> hoja sin marcar. DEADLINE DURO: 2026-08-24 16:00 (a las 15:30 parar y cerrar entrega).

## Qué pasó con la v1 (contexto imprescindible)

Ibai rechazó ENTERO el resultado de la campaña v1 (rondas 1-4, commits `3977bc9`…`c96fee8`):
"no me gusta nada", "se nota que es IA", "ni un 1 por ciento de lo que querría", "has
reutilizado muchas cosas que eran cutres cuando la idea era darle un lavado de cara". Ejemplo
suyo: el toggle Confianza desplazaba el botón bajo el cursor, sin animación. Los jurados y Sol
habían dado 7+ y CONGELAR: el proceso validaba con capturas estáticas y nadie sintió un click.
El código v1 del lab queda como referencia de QUÉ NO y para canibalizar fixtures/lab-shots.

## Decisiones de Ibai (2026-08-23 22:45, vinculantes)

1. **Desde cero TODO**: también la estructura. El esqueleto A+C muere. Nueva divergencia.
2. **Tacto de referencia: Family/Arc (juguetón)**: motion con personalidad y deleite, springs,
   morphs, físico e interrumpible. La estética sigue siendo marca Manualito (crema/naranja),
   el TACTO es Family/Arc.
3. **Campaña nocturna autónoma sin parar hasta 2026-08-24 16:00**. Ibai duerme. "Mira a ver
   como lo hacen los que saben." El gate humano queda diferido a su revisión de las 16:00.

## Reglas duras (violarlas = ronda inválida)

- **Regla cero**: ningún control se desplaza bajo el cursor al interactuar. Todo espacio
  variable se reserva (min-width, tabular-nums, contadores con hueco fijo) o se anima.
- **Motion-first**: cada control se especifica ANTES de codificar: qué se mueve, curva/spring,
  duración, qué NO se mueve, cómo se interrumpe. La spec vive en la bitácora por ronda.
- **Nada se valida estático**: cada interacción se verifica con filmstrip (frames a
  0/60/120/180/240/320ms), vídeo .webm y layout-shift medido = 0. Jurados y Sol reciben
  filmstrips, nunca fotos sueltas.
- **Lenguaje visual nuevo**: prohibido reutilizar el vocabulario v1 (píldoras clónicas,
  microlabels mono ubicuos, leyenda-panel, chips grises). Se conserva SOLO: marca (crema
  #fff8f0, naranja #e07a1f, serif del contenido), confianza por colores + leyenda de estados
  (reinventadas visualmente, no eliminadas), contratos (`usePageSearch`, `imageZoom`,
  `pageStatus`, backend intocable).
- **Anti-IA con dientes**: además del checklist v1 (sin em-dashes, sin eyebrows, sin 01/02,
  sin dots decorativos, sin pills sobre imágenes, sin glow), buscar activamente asimetría,
  saltos tipográficos reales, detalles con personalidad (el meeple de Manualito existe),
  y matar toda uniformidad de gris-13px.
- Commits frecuentes nombrados por Sol (sesión persistente `01a02fae-7eb8-71c0-bff3-576a23277780`),
  CERO coautoría, SIN push jamás sin orden explícita con la palabra.
- Dependencia `motion` (motion/react): AUTORIZADA por el mandato Family/Arc (springs
  interrumpibles inexpresables en CSS). Justificar versión y peso en bitácora al instalarla.

## Fases nocturnas (marcar al cerrar; no parar entre fases)

### N0 Recetario de los que saben (~1,5h)
- [x] Minado: benji.org/family-values, catálogo 60fps.design (64 clips), RECIPES de Emil,
      rauno.me/craft/interaction-design
- [x] `docs/design/recetario-jugueton.md`: 18 recetas con valores y destino en el visor
- [x] `motion` 13.1.1 instalada (justificada en bitácora)
- [x] `scripts/lab-film.mjs`: vídeo + filmstrip + layout shift por interacción (cuenta
      hadRecentInput a propósito); el toggle v1 da CLS 0.0049 → detecta el defecto de Ibai
- GATE N0: CUMPLIDO.

### N1 Lenguaje visual v2 (~2h)
- [x] `docs/design/lenguaje-visor.md` + muestra viva `/lab?v=lang` (LangSheet + lang-sheet.css)
- [x] Literata Variable instalada; confianza = rotulador; leyenda humana; mascota meeple
- [x] Derivados de color propuestos con coolors en la hoja (--m-paper, --hl-media, --hl-baja)
- [x] Hover verificado dinámicamente (filmstrip + computed styles); anti-IA limpio
- GATE N1: CUMPLIDO.

### N2 Divergencia estructural nueva (~4h)
- [x] V-D «El atril» `251089e`, V-E «El taller», V-F «La libreta» construidas con Motion
      tras spec motion-first en bitácora
- [x] Filmstrips + vídeos de las interacciones clave en .lab-shots/film/ (dock morph, dibujo
      del rotulador, mazo, destape, pestañas, acordeón)
- [x] Regla cero endurecida: margen espejo del rotulador, pestañas por transform, maxCls
      explícito para acordeones
- GATE N2: CUMPLIDO.

### N3 Convergencia por tacto (~3h)
- [x] Jurado sobre filmstrips: Paco E8/D6/F5, Marta F7/D6/E5,5, Rubén D7/F6/E4,
      Sol F8,1/E7,9/D7,6 «elegir F y robarle a las otras dos»
- [x] Síntesis: FUSIÓN con F de chasis + índice con nombres y cotejo de E + bolsillo móvil
      de D + rotulador slice continuo + % crudo fuera de la vista + pestañas ancladas al borde
- GATE N3: CUMPLIDO.

### N4 Profundidad superficie a superficie (~4h)
- [x] Fusión construida y profundizada: rotulador slice con cascada única, cotejo lado a
      lado con maqueta real del escaneo, Guardar real con overrides, bolsillo móvil 44px,
      pestañas con nombre ancladas, índice heurístico, Escape/foco verificados, Brasa y
      accent-blue limpios, escenarios completos
- [x] Films: fusion-dudas/cotejo/tab/dock + teclado por script
- GATE N4: CUMPLIDO (jurado final en curso).

### N5 Entrega 16:00 (empezar 15:00, cerrar 15:30-16:00)
- [ ] Vídeos .webm de cada interacción en `.lab-shots/videos/` (para que Ibai los vea)
- [ ] Acta final honesta en bitácora + PLAN actualizado
- [ ] Mensaje a Ibai: URL, qué tocar en 3 minutos, qué quedó fuera y por qué
- GATE N5: Ibai puede juzgar con las manos en 3 minutos.

## Herramientas de evidencia dinámica (construir en N0)

- `scripts/lab-film.mjs`: dado un escenario y una interacción (click en selector), graba vídeo
  .webm (Playwright recordVideo), extrae frames a 0/60/120/180/240/320ms tras el click, y mide
  layout shift (PerformanceObserver buffered) → falla si CLS > 0. Salida en
  `.lab-shots/film/<nombre>/`.
- Revisión de motion: leer los frames como filmstrip (Read de PNGs en orden).

## Entorno (heredado v1, sigue vigente)

- SIEMPRE `http://127.0.0.1:5174` (HSTS cacheado rompe localhost en el navegador built-in).
- `config/frontend.env` local con `VITE_API_TARGET=https://localhost`: NO COMMITEAR.
- Node 24.14 < engines: `pnpm install --config.engineStrict=false`; binarios directos
  (`./node_modules/.bin/tsc -b --noEmit`, `./node_modules/.bin/eslint`).
- pre-commit exige exactamente un \n final: normalizar con python antes de cada commit docs.
- Espejo GitLab: hook manualito-sync (lag-by-one; pase manual con
  `C:\Users\Ibai\.manualito-sync\sync.ps1`), sufijos (#89)→(#64) automáticos.
- Ramas: `feat/89-rediseno-visor` (GitHub) / `feat/64-rediseno-visor` (GitLab).
