import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type ManualRecord } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';

type Props = Readonly<{
  manual: ManualRecord;
  /** Texto compacto (relativo en Home, fecha completa en History). */
  meta?: string;
  /** Badge a la derecha. */
  badge?: string;
  className?: string;
}>;

/**
 * Card de manual reutilizable.  Click → navega a su Result.
 * Centraliza el look usado en Home (recientes) e History.
 *
 * Usa **container queries** (`@container`) para adaptar su contenido al
 * ancho del contenedor padre, no del viewport.  Patrón canónico para
 * componentes reutilizables (ver decisión #28 — Principio 3).
 *
 * Reglas:
 *  - Siempre visible: avatar + nombre.
 *  - `@xs` (≥ 240 px): muestra meta (fragmentos · fecha).
 *  - `@sm` (≥ 320 px): muestra Badge "Manual".
 *  - Siempre: chevron al final.
 */
export function ManualCard({ manual, meta, badge = 'Manual', className }: Props) {
  return (
    <Link to="/result/$manualId" params={{ manualId: manual.manual_id }} className="@container block">
      <Card className={cn('p-3 transition-shadow hover:shadow-sm', className)}>
        <div className="flex items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-fg-inv"
            aria-hidden="true"
          >
            <span className="font-display text-base font-bold uppercase">
              {manual.name.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-fg">{manual.name}</div>
            <div className="mono hidden text-xs text-fg-3 @xs:block">
              {manual.chunks_indexed} fragmentos
              {meta ? ` · ${meta}` : ''}
            </div>
          </div>
          <Badge size="sm" tone="neutral" className="hidden @sm:inline-flex">
            {badge}
          </Badge>
          <ChevronRight size={18} className="text-fg-3" aria-hidden="true" />
        </div>
      </Card>
    </Link>
  );
}
