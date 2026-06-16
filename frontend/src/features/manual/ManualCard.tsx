import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
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
  const name = manual.title ?? manual.game_name;
  const indexing = manual.status === 'indexing';
  return (
    <Link
      to={indexing ? '/processing/$manualId' : '/game/$gameId'}
      params={indexing ? { manualId: manual.id } : { gameId: manual.game_id }}
      search={indexing ? { name } : undefined}
      className="@container block"
    >
      <Card className={cn('p-3 transition-shadow hover:shadow-sm', className)}>
        <div className="flex items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
            style={{ background: gameColor(name), color: '#FFF8F0' }}
            aria-hidden="true"
          >
            <span className="font-display text-base font-bold uppercase">{name.slice(0, 2)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-fg">{name}</div>
            {meta ? <div className="truncate text-xs text-fg-3">{meta}</div> : null}
          </div>
          <Badge
            tone={indexing ? 'primary' : 'neutral'}
            icon={indexing ? <Spinner size={10} /> : undefined}
            className="hidden @sm:inline-flex"
          >
            {indexing ? 'Procesando…' : 'Listo'}
          </Badge>
          <ChevronRight size={18} className="text-fg-3" aria-hidden="true" />
        </div>
      </Card>
    </Link>
  );
}
