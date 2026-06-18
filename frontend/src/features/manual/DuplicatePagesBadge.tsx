import { Copy } from 'lucide-react';

/**
 * Aviso ámbar de páginas duplicadas en una tarjeta de manual (biblioteca y hub
 * del juego). Una página subida dos veces no se reprocesa ni cuenta para la
 * explicación; es información, no un error, de ahí el tono ámbar. Decorativo en
 * color: el "title" lo explica al pasar el ratón (cursor de ayuda).
 */
export function DuplicatePagesBadge({
  count,
  openHint = false,
}: Readonly<{ count: number; openHint?: boolean }>) {
  const label = count === 1 ? '1 página duplicada' : `${count} páginas duplicadas`;
  const detail =
    count === 1
      ? 'Una página es idéntica a otra que ya habías subido: no se vuelve a leer ni cuenta para la explicación.'
      : `${count} páginas son idénticas a otras que ya habías subido: no se vuelven a leer ni cuentan para la explicación.`;
  return (
    <span
      title={openHint ? `${detail} Ábrelo para revisarlo.` : detail}
      className="inline-flex cursor-help items-center gap-1.5 self-start rounded-[9px] border border-warning/40 bg-warning-bg px-2.5 py-[5px] text-[11.5px] font-bold leading-tight text-warning"
    >
      <Copy size={13} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  );
}
