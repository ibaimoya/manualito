import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HelpIndicator } from '@/components/ui/help-indicator';

/**
 * Cantidad de páginas duplicadas. El detalle explica la reutilización sin
 * confundirla con un error de lectura.
 */
export function DuplicatePagesBadge({
  count,
  openHint = false,
  passive = false,
}: Readonly<{ count: number; openHint?: boolean; passive?: boolean }>) {
  const { t } = useTranslation('library');
  const detail = t('duplicatePages.detail', { count });
  return (
    <HelpIndicator
      icon={Copy}
      tone="warning"
      label={openHint ? `${detail} ${t('duplicatePages.hintSuffix')}` : detail}
      passive={passive}
      className="self-start text-xs tabular-nums"
    >
      {count}
    </HelpIndicator>
  );
}
