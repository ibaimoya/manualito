// Paleta cálida estable por nombre: la biblioteca y las recomendaciones se ven
// variadas (como el diseño) sin depender de metadatos del juego.
const GAME_COLORS = [
  'var(--m-primary-500)',
  'var(--m-accent-500)',
  'var(--m-primary-700)',
  'var(--m-warning)',
  'var(--m-success)',
  'var(--m-error)',
];

/** Color de fondo determinista (CSS var) derivado del nombre del juego. */
export function gameColor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return GAME_COLORS[hash % GAME_COLORS.length]!;
}
