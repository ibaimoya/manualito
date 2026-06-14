// Paleta cálida estable por nombre; "deep" es el extremo oscuro del gradiente.
const GAME_TONES = [
  { color: 'var(--m-primary-500)', deep: 'var(--m-primary-700)' },
  { color: 'var(--m-accent-500)', deep: '#1E4A60' },
  { color: 'var(--m-primary-700)', deep: '#5C2A12' },
  { color: 'var(--m-warning)', deep: '#7A5807' },
  { color: 'var(--m-success)', deep: '#275927' },
  { color: 'var(--m-error)', deep: '#7A2018' },
] as const;

export interface GameTone {
  color: string;
  deep: string;
}

function nameHash(name: string): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

/** Tono determinista del juego: el MISMO nombre da el mismo par en toda la app. */
export function gameTone(name: string): GameTone {
  return GAME_TONES[nameHash(name) % GAME_TONES.length]!;
}

/** Color de fondo determinista (CSS var) derivado del nombre del juego. */
export function gameColor(name: string): string {
  return gameTone(name).color;
}
