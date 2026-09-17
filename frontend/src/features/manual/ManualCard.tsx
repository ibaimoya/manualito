import { Link } from '@tanstack/react-router';
import { CaretRightIcon, CircleNotchIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { HelpIndicator } from '@/components/ui/help-indicator';
import { type ManualSummary } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { gameColor } from '@/shared/lib/gameColor';

type Props = Readonly<{
  manual: ManualSummary;
  /** Texto compacto (relativo en Home, fecha completa en History). */
  meta?: string;
  className?: string;
}>;

/**
 * Card de manual reutilizable. Si está indexando, lleva a su pantalla de
 * procesamiento; si ya está activo, al hub de su juego. Centraliza el look de
 * Home (recientes) e History y se adapta al contenedor con "@container".
 */
export function ManualCard({ manual, meta, className }: Props) {
  const { t } = useTranslation('manual');
  const name = manual.title ?? manual.game_name;
  const indexing = manual.status === 'indexing';
  return (
    <Link
      to={indexing ? '/processing/$manualId' : '/game/$gameId'}
      params={indexing ? { manualId: manual.id } : { gameId: manual.game_id }}
      search={indexing ? { name } : undefined}
      className="game-preview @container block"
    >
      <Card className={cn('p-3 transition-none hover:border-border-strong', className)}>
        <div className="flex items-center gap-3">
          <div
            className="game-preview-token grid h-12 w-12 shrink-0 place-items-center rounded-xl"
            style={{ background: gameColor(name), color: '#FFF8F0' }}
            aria-hidden="true"
          >
            <span className="font-display text-base font-bold uppercase">{name.slice(0, 2)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-fg">{name}</div>
            {meta ? <div className="truncate text-xs text-fg-3">{meta}</div> : null}
          </div>
          {indexing && (
            <HelpIndicator
              icon={CircleNotchIcon}
              label={t('card.processing')}
              tone="info"
              passive
              iconClassName="animate-spin"
              className="hidden @sm:inline-flex"
            >
              {t('card.processing')}
            </HelpIndicator>
          )}
          <CaretRightIcon
            data-icon-motion="forward"
            size={18}
            className="text-fg-3"
            aria-hidden="true"
          />
        </div>
      </Card>
    </Link>
  );
}
