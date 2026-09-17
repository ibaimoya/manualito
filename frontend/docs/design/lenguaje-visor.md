# Lenguaje visual del visor v2

Hoja de estilo de la pantalla. Muestra viva en `/lab?v=lang` (light y Brasa). Sustituye por
completo el vocabulario v1: quedan prohibidos sus píldoras clónicas, microlabels mono
ubicuos, leyenda-panel, washes de fila entera y la jerarquía plana de gris-13px.

## La metáfora: mesa, papel y objetos

El manual ES papel. Tres niveles de superficie y nada más:

1. **Mesa** (`--m-bg`, crema): el fondo donde todo reposa. Nunca lleva sombra.
2. **Papel** (`--lab-paper`: #fffdf8 en claro, #1e1710 en Brasa, propuesto como token
   `--m-paper` en el porte): la hoja donde vive el texto leído. Borde `--m-border` + sombra
   `--m-shadow-sm` (las sombras de marca YA son cálidas y direccionales: la v1 no las usaba
   bien). Radio `--m-r-md` (12px).
3. **Objetos** (trays, menús, diálogos): flotan sobre la mesa con `--m-shadow-md`/`lg`,
   radio `--m-r-lg` (20px) y `--m-r-xl` (28px) en sheets. Siempre `--m-card`.

Radios SOLO de los tokens: 8 controles, 12 papel/cards, 20 objetos, 28 sheets. Tres escalas
conviviendo sin sistema era un defecto v1 cazado por Marta.

## Tipografía con jerarquía real

- **Lectura**: Literata Variable (`@fontsource-variable/literata`, la serif de lectura larga
  de Google Books), 17px/1.68, `hyphens: auto` con `lang="es"`. Georgia de fallback. La v1
  usaba la pila serif genérica de Tailwind a 15.5px: texto de relleno, no de libro.
- **Título del manual**: Manrope 26px/800 tracking-tight. El título vuelve a mandar (en v1
  eran 17px perdidos en una esquina).
- **UI**: Inter 13.5px/500-600. Etiquetas visibles, verbo + objeto.
- **Datos**: JetBrains Mono 11.5px tabular SOLO para datos que se comparan (%, contadores,
  página N de M). El mono como textura decorativa muere.

## La confianza es un subrayador, no un panel

Las líneas dudosas se marcan como lo haría una persona sobre papel: un trazo de rotulador
QUE ABRAZA EL TEXTO, no un rectángulo de fila a todo lo ancho (el wash v1 gritaba dashboard).

- Media: rotulador ámbar (`--hl-media`, derivado de `--m-warning-bg` saturado).
- Baja: rotulador coral (`--hl-baja`, derivado de `--m-error-bg`).
- Trazo con radios asimétricos (0.4em 0.25em 0.5em 0.3em) y `box-decoration-break: clone`
  para el gesto de mano; el color nunca va solo: el % en el margen (mono, tono de banda) y
  la leyenda acompañan.
- Alta confianza: papel limpio. Sin verde por todas partes.

## Leyenda de estados, re-expresada

Sobrevive por requisito de Ibai pero deja de ser un panel de laboratorio: una sola línea
tranquila de dots + etiqueta 12px en `--m-text-2`, integrada donde se listan las páginas,
con Pendiente en neutro. La redundancia dot+texto es deliberada (el color nunca va solo).

## Iconografía y mascota

- Lucide stroke 1.75, tamaños 15/17. Los iconos MORFAN en las transiciones (chevron que
  rota, Pencil→Check): receta 3 del recetario.
- El meeple de Manualito es la mascota de los estados raros: flota (±4px, 3s alternate) en
  vacíos y pendientes, un solo tilt en error. Ahí vive el presupuesto de deleite (Family
  Accounts Mascot).

## Voz

Cercana y de mesa de juego, sin jerga técnica en pantalla (OCR solo en aria/title):

- "Confianza OCR" → **"Dudas de lectura"**
- "Error de lectura" → **"No pudimos leer esta página"** (ya estaba bien)
- "Reprocesar" → **"Leer de nuevo"**
- "Sin texto todavía" → **"Aún leyendo esta página…"** / vacíos con mascota:
  **"Aquí no hay nada todavía"**
- Botones siempre verbo + objeto: "Guardar cambios", "Sustituir la imagen".

## Interacción (resumen del recetario N0)

Press scale(0.97) 160ms; hover lift -1px + sombra (solo hover:hover); springs Motion
`{ duration: 0.5, bounce: 0.2 }` para trays y morphs; dígitos que ruedan en contadores;
regla cero de desplazamiento bajo el cursor; ausencias deliberadas en teclado y menús.

## Paleta (formato coolors, sin cambios de marca; nuevos derivados marcados)

Base: https://coolors.co/fff8f0-e07a1f-2c6e91-1f1611-f5e9d7
Nuevos derivados propuestos: `--m-paper` #fffdf8 (claro) / #1e1710 (Brasa),
`--hl-media` #f2d98c (claro) / #4a3a12 (Brasa), `--hl-baja` #f4b8ae (claro) / #52241c
(Brasa). Se validarán AA con el texto encima antes del porte.
