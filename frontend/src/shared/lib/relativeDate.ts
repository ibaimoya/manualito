// A nivel de módulo: construir Intl.DateTimeFormat por llamada cuesta caro.
const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** Fecha corta "26 may" — el formato compartido por manuales y conversaciones. */
export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

/** "ahora mismo", "hace 5 min", "hace 3 h", "hace 2 d"; a partir de 30 días, fecha corta. */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return SHORT_DATE.format(date);
}
