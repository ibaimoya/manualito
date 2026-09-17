import i18n from '@/app/i18n';

/* Formateadores cacheados por locale, el idioma puede cambiar en caliente */

const BCP47: Record<string, string> = { en: 'en-US', es: 'es-ES' };

function activeLocale(): string {
  return BCP47[i18n.language] ?? 'es-ES';
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(kind: 'long' | 'short'): Intl.DateTimeFormat {
  const locale = activeLocale();
  const key = `${locale}-${kind}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter =
      kind === 'short'
        ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
        : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(): Intl.RelativeTimeFormat {
  const locale = activeLocale();
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
    relativeFormatters.set(locale, formatter);
  }
  return formatter;
}

/** Fecha corta "26 may" — el formato compartido por manuales y conversaciones. */
export function formatShortDate(iso: string): string {
  return dateFormatter('short').format(new Date(iso));
}

/** Fecha larga "12 de junio de 2026" — para metadatos donde cabe el detalle. */
export function formatLongDate(iso: string): string {
  return dateFormatter('long').format(new Date(iso));
}

/** "ahora mismo", "hace 5 min", "hace 3 h", "hace 2 d"; a partir de 30 días, fecha corta. */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return i18n.t('status.justNow');
  if (minutes < 60) return relativeFormatter().format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relativeFormatter().format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return relativeFormatter().format(-days, 'day');
  return dateFormatter('short').format(date);
}
