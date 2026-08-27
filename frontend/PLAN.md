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
- [ ] Minar Family (family.co, posts de Benji Taylor, análisis de Emil sobre Family), Arc
      (motion de Browser Company), Vaul y Sonner (código real de Emil), Rauno (craft),
      colección animations ya instalada en .agents/skills
- [ ] Destilar `docs/design/recetario-jugueton.md`: ≥15 recetas CONCRETAS con valores
      (springs stiffness/damping/bounce, morphs, staggers, gestos, hovers con carácter),
      cada una con "dónde aplica en el visor"
- GATE N0: recetario escrito con valores copiables, no vaguedades.

### N1 Lenguaje visual v2 (~2h)
- [ ] `docs/design/lenguaje-visor.md` + página de muestra en /lab (ruta ?v=lang): tipografía
      con jerarquía real, superficies/profundidad, radios, sombras cálidas direccionales,
      iconografía con carácter, expresión de confianza y estados nueva, microcopy con voz
- [ ] Paleta coolors.co si se ajusta algún color
- GATE N1: muestra renderizada, auditada anti-IA, filmstrip de sus hovers.

### N2 Divergencia estructural nueva (~4h)
- [ ] 3 composiciones NUEVAS (V-D, V-E, V-F) que NO partan del A+C muerto; cada una diseñada
      motion-first (spec de interacción por control antes del código) y construida con
      `motion` desde el primer commit
- [ ] Filmstrips + vídeos de las 3 en sus interacciones clave (toggle confianza, búsqueda,
      cambio de página, panel/imagen)
- GATE N2: 3 variantes vivas con evidencia dinámica y CLS=0.

### N3 Convergencia por tacto (~3h)
- [ ] Jurado (Paco/Marta/Rubén) + Sol sobre FILMSTRIPS y vídeos, con pregunta añadida "¿qué
      interacción se siente muerta?"
- [ ] Síntesis y elección de una; ronda de fusión
- GATE N3: elegida con motivos de TACTO, no de foto.

### N4 Profundidad superficie a superficie (~4h)
- [ ] Orden: lectura+confianza → búsqueda → página/rail → imagen original → móvil → estados
      (busy/failed/edición/diálogos). Una superficie no se cierra sin su filmstrip + CLS=0
      + spec cumplida; solo entonces la siguiente
- GATE N4: todas las superficies con evidencia dinámica.

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
