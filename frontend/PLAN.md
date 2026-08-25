# Campaña de rediseño del visor de manual — estado vivo

> Fichero autosuficiente. Reanudación en frío: leer este fichero entero, después la última ronda de
> `docs/design/visor-bitacora.md`, relanzar el dev server (`preview_start` con name `frontend`,
> puerto 5174, abrir `http://localhost:5174/lab`) y continuar en la primera hoja sin marcar. No parar por sensación de
> acabado: manda el gate de salida.

## Misión

Rediseñar el visor de manual (`src/routes/_app.manual.$manualId.tsx` + `src/features/manual/*`)
hasta un nivel "Emil Kowalski fusionado con Steve Jobs prime", con Linear como referencia de craft
(su detalle, no su estética: Manualito sigue siendo crema + serif + cálido). Es el EJEMPLO para el
futuro rediseño del resto de la app. El aporte principal son las microanimaciones con buenas
prácticas. Sin tope de horas: se itera hasta pasar el gate entero.

## Reglas de la campaña (órdenes de Ibai, verbatim-críticas)

- Yo (Claude) diseño e implemento la UI en primera persona. Codex NO implementa UI.
- Codex Sol (tope de esfuerzo, sesión persistente, PROHIBIDO escribir código): juez experto no
  vinculante + nombres de commits. Commits frecuentes, no verbosos, CERO coautoría (verificar
  `git log --format=%b` antes de cerrar). Sufijos: `(#89)` GitHub, `(#64)` GitLab (el hook
  manualito-sync replica solo, casa ramas por tipo+slug, neverPush activo).
- SIN push salvo orden explícita de Ibai con la palabra push (de un solo uso).
- Jurado "cuñao": 3 subagentes Sonnet con personas FIJAS toda la campaña:
  - **Paco** (55, juega en familia, busca una regla concreta con prisa, letra grande).
  - **Marta** (diseñadora amateur, detecta "cutrez" y "juguete" a ojo).
  - **Rubén** (móvil-only, impaciente, pulgar, y ROMPEDOR: spam de taps, gestos a medias).
  Preguntas fijas: qué parece caro/barato, qué no entiendes, qué tocarías primero, qué sobra,
  nota 1-10 y por qué. Sus opiniones se consideran, yo sintetizo y decido citando el brief.
- QA con mentalidad de humano rompedor: spam de clics, doble submit, cambiar de página a mitad de
  animación, basura y emojis en el buscador, resize a mitad de gesto, interrumpir el zoom, atrás
  del navegador, taps fantasma. En cada ronda y a fondo en F6.
- Conservar (gustos de Ibai): modo confianza por colores + leyenda de estados (retocables con
  precedencia+i18n+tests en el mismo commit); la UX del zoom actual (`imageZoom.ts`) con UI nueva.
- Contratos intocables: `usePageSearch`, `imageZoom`, semántica de `pageStatus`, backend, mobile
  parity (cada ronda captura 375px; sin overflow ni taps <44px).
- Colores ajustables CON entregable: paleta formato coolors.co en brief y acta final; marca
  reconocible (naranja #e07a1f, crema #fff8f0); AA/AAA medido; dark Brasa y accent-blue re-verificados.
- Checklist anti "manías de IA" en cada autocrítica (design-taste-frontend §9): cero em-dashes,
  cero `;` en prosa, sin eyebrows por sección, sin numeración 01/02 decorativa, sin dots
  decorativos, sin cadenas de middle-dots, sin pills sobre imágenes, sin version labels, sin
  scroll cues, sin glow morado, sin 3 cards iguales, sin serif-por-defecto en UI nueva.
- i18n es+en simultáneo (locales-parity rompe si no). A11y: axe 0, teclado completo, aria.
- Herramientas: navegador BUILT-IN (Browser pane) para iterar en vivo; Playwright
  (`scripts/lab-shots.mjs`) para capturas deterministas; /unlazy activo; skills de diseño cargadas.
- Ibai lanza /goal desde su UI (pedido). Si la ventana de uso se agota: ScheduleWakeup al reset
  con la instrucción literal del encabezado de este fichero.

## Decisiones de diseño ya tomadas (no reabrir sin causa)

- Medida de lectura 60-75ch (hoy max-w-3xl=768px ≈ 85-90ch, demasiado; y solo ~40% del viewport
  en 1920px). El espacio sobrante se gasta en panel útil, no en ensanchar la columna.
- V-A "Documento partido" es la favorita presunta (texto + imagen original lado a lado, absorbe el
  diálogo de zoom). La divergencia existe para FALSIFICARLA, no para reabrir el ancho.
- Motion: vocabulario CSS existente primero (`--m-easing` cubic-bezier(.2,.8,.2,1), `--m-dur`
  120/200/320ms, keyframes mn-*/proc-*, WAAPI puntual). Dependencia `motion` SOLO si un gesto
  exige física interrumpible inexpresable en CSS (justificar en bitácora). morphicons (MIT, 6.5KB,
  springs, compatible lucide): trial en F4, adopción solo si sobrevive a reduced-motion y a Sol.
- Nada animado en alta frecuencia (regla Rauno/Emil): navegación de páginas y atajos ← → sin
  animación de entrada; menús contextuales entran sin animación, solo fade de salida.
- Recetas de motion: entradas ease-out fuerte 150-250ms desde scale≥0.95+opacity, salidas más
  rápidas que entradas, transform-origin en el trigger (Radix var), transitions (no keyframes) en
  todo lo interrumpible, stagger 30-80ms solo en entradas ocasionales, solo transform/opacity.

## Mecanismo: laboratorio /lab (DEV-gated)

- `src/routes/lab.tsx` fuera de `_app` (sin auth ni sidebar); `beforeLoad` redirige a `/` si
  `!import.meta.env.DEV`. Hereda providers/tokens/tema reales.
- Variantes en `src/features/manual/lab/`: `fixtures.ts` (ManualDetailResponse fabricado con los 6
  estados de página, 3 bandas de confianza, hits de búsqueda y escenario busy), `LabSwitcher.tsx`
  (flotante: variante/escenario/tema/accent/viewport hint), `VariantA|B|C.tsx`.
- URL determinista: `/lab?v=a|b|c&esc=base|busy|failed|edited|dup|search&th=light|dark&acc=warm|blue&conf=0|1&pg=N`.
- Capturas: `scripts/lab-shots.mjs` → `.lab-shots/` (gitignored). Motion se evalúa EN VIVO.
- El lab se commitea (historia honesta). Poda en F5: un commit lo borra; `docs/design/*` se queda.

## Fases y hojas (marcar al cerrar; gate por fase)

### F0 Andamiaje
- [x] Ramas locales `feat/89-rediseno-visor` (manualito) y `feat/64-rediseno-visor` (ubu-manualito) desde development
- [x] launch.json: entrada `frontend` ya existente (vite directo, puerto 5174) reutilizada
- [x] Colección de skills de Emil instalada en `.agents/skills` (prototype, review-animations, pick-ui-library)
- [x] Ruta `/lab` + `fixtures.ts` + `LabSwitcher` renderizando con tokens reales (light y dark verificados; Brasa #15100b)
- [x] `scripts/lab-shots.mjs` produce PNGs deterministas (12/12, matriz 1920/375 × light/dark × base/busy/search)
- [x] `.lab-shots/` en .gitignore del frontend
- [x] Commit F0 `dbc4dc1` (GitHub) → gemelo sync `14b14c4` (#64), coautoría 0 en ambos
- GATE F0: /lab con fixtures en dark+light en el navegador built-in y PNGs generados. CUMPLIDO salvo commit.

#### Notas de entorno F0 (imprescindibles para reanudar)
- Usar SIEMPRE `http://127.0.0.1:5174` (no localhost: el navegador built-in tiene HSTS cacheado del
  caddy https://localhost y rompe los fetch de la página).
- `config/frontend.env` cambiado LOCALMENTE a `VITE_API_TARGET=https://localhost` (el stack actual
  expone caddy en 80/443; el proxy de vite lleva secure:false). NO COMMITEAR ese fichero.
- Node local 24.14 < engine ^24.15 de la rama: `pnpm install --config.engineStrict=false`; para
  lint/typecheck ir DIRECTO a binarios (`./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint`).
  Pedirle a Ibai actualizar Node cuando quiera.
- Playwright chromium instalado (`npx playwright install chromium`).
- La sesión persistente de Sol (juez+commits) se abre con scratchpad/sol-visor-prompt.txt; anotar su
  session id en el log de estado tras el primer run.

### F1 Minería + diagnóstico
- [ ] Auditoría "por qué parece de juguete" con capturas ampliadas del visor actual (hipótesis:
      rounded-2xl ubicuo, bordes gruesos uniformes, controles 44px también en desktop, pills
      centradas, badges pesados, jerarquía plana)
- [ ] Minería: interfaces.dev, rareui.com (componentes vendorizables), beautifului.dev (loading
      con tiempo transcurrido → banner de reprocesado), recent.design, pageflows, portfolios de
      la lista de Ibai (arlan.me/vault, nachi.design, maple.dev, amicro.vercel.app, alvarosh.dev,
      lucasmartinic.com, andremooij.com, ample.studio, manixh.dev, swamii.me, byalkor/trondao...)
- [ ] Barrido web "AI UI tells" + catálogo §9 design-taste → checklist anti-tells destilada
- [ ] `docs/design/visor-brief.md`: 10-15 movimientos concretos + anti-patrones + paleta coolors
      (si se ajusta) + checklist anti-tells
- [ ] Revisión única de Sol al brief
- GATE F1: brief escrito y revisado.

### F2 Divergencia (3 variantes, calidad-prototipo)
- [x] V-A Documento partido `3977bc9` (rail informativo, toolbar única, severidad asimétrica
      pactada con Sol, panel Original)
- [x] V-B Lectura focal + V-C Mesa de trabajo `0922e66`
- [x] Matriz de capturas completa (48 PNGs)
- [ ] Ronda de jurado 1 (3 cuñaos + Sol con imágenes vía codex -i) con acta → dirección
- GATE F2: acta con dirección y motivos.

Nota F1: commit brief `83a0229`. Sol sobre el brief: aprobar con cambios (condiciones en el brief).
Nota jurado: Sol visual = exec FRESCO con `-i` (las imágenes solo se adjuntan al prompt inicial);
la sesión persistente 01a02fae queda para nombres de commit y decisiones.

### F3 Convergencia (rondas 45-60min sobre la ganadora)
- [ ] Opciones avanzadas rediseñadas: toggle Confianza, buscador, Editar, menú Acciones, diálogos
      (guardar/reprocesar/eliminar), banner de reproceso, viewer de imagen (UX de zoom conservada)
- [ ] Ronda N: construir → autocrítica (3 defectos propios ANTES del jurado) → capturas → jurado
      → síntesis aceptado/rechazado/aparcado → cambios → commit → acta
- GATE F3: veredicto "dirección congelada" en acta.

### F4 Micro-pulido (el corazón)
- [ ] Tabla control×estado al 100% (hover/focus-visible/active/disabled/loading/empty/error)
- [ ] Microanimaciones con recetas Emil aplicadas y con propósito escrito una a una
- [ ] Trial morphicons (chevron Confianza, Pencil→Check, zoom); decisión motivada
- [ ] Decisión `motion` sí/no con justificación en bitácora
- [ ] Leyenda/estados retocados si procede (precedencia+i18n+tests mismo commit)
- [ ] Reduced-motion, dark Brasa y accent-blue completos
- [ ] Paleta final coolors.co si hubo ajuste
- GATE F4: checklist de micro-estados al 100% sobre capturas ampliadas + ronda corta de Sol.

### F5 Reescritura real
- [ ] Portar del lab a la ruta + features EXTRAYENDO los inline (PageNav, StatusChip,
      ConfidenceToggle, SearchField, ManualActionsMenu, ManualImageDialog/Viewer,
      ReprocessBanner, ManualDialogs) a ficheros de feature
- [ ] i18n es+en; tests actualizados (18 its + axe; setup fuerza rama móvil, mantener md:)
- [ ] Borrar lab + script en un commit de poda
- GATE F5: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes; diff sin lab.

### F6 QA + gate Linear (todo o nada)
- [ ] QA humano-rompedor completo (lista de la sección Reglas)
- [ ] Píxel al 200% sin desalineados; alineación óptica de iconos
- [ ] Motion ≤300ms con propósito; solo transform/opacity; reduced-motion verificado
- [ ] axe 0 + walkthrough de teclado registrado
- [ ] Sin jank en scroll/zoom (browser pane en vivo)
- [ ] Matriz light/Brasa/accent-blue × 375/768/1920 limpia
- [ ] Anti-tells en cero
- [ ] `vite preview` OK
- [ ] Veredicto final Sol ("publicable") + cuñaos (nadie dice "juguete")
- [ ] Acta de cierre + paleta coolors a Ibai
- GATE F6: todos los puntos anteriores.

## Log de estado

- 2026-08-23: campaña aprobada. Ramas creadas. F0 en curso.
- 2026-08-23 19:35: F0 CERRADO (gate cumplido). Lab operativo en http://127.0.0.1:5174/lab.
  Sesión Sol persistente: 01a02fae-7eb8-71c0-bff3-576a23277780 (resume con codex.exe ... resume <id>).
  Sync GitLab: requiere la rama gemela CHECKED-OUT en ubu-manualito; lag-by-one, se vacía con
  pasada manual de sync.ps1. Ibai mergeó la #21 (#9) en ambos remotos tras cortar estas ramas.
  F1 en curso: auditoría + minería + brief.
