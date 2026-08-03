import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('library');
  const label = t('duplicatePages.label', { count });
  const detail = t('duplicatePages.detail', { count });
  return (
    <span
      title={openHint ? `${detail} ${t('duplicatePages.hintSuffix')}` : detail}
      className="inline-flex cursor-help items-center gap-1.5 self-start rounded-[9px] border border-warning/40 bg-warning-bg px-2.5 py-[5px] text-[11.5px] font-bold leading-tight text-warning"
    >
      <Copy size={13} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  );
}
