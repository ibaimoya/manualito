import { AlertTriangle, Check, X } from 'lucide-react';
import type { ManualDetailPage } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';

/**
 * Rail de miniaturas de página del detalle de manual: documento esquemático
 * con líneas decorativas, estado del OCR y contador de coincidencias de la
 * búsqueda. Vertical en desktop, tira horizontal en móvil.
 */

const THUMB_LINES = [85, 65, 92, 55, 78] as const;

function StatusDot({ page }: Readonly<{ page: ManualDetailPage }>) {
  if (page.ocr_status === 'failed') {
    return (
      <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-error-bg text-error">
        <X size={12} strokeWidth={2.6} aria-hidden="true" />
      </span>
    );
  }
  if (page.text_quality === 'low_confidence') {
    return (
      <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-warning-bg text-warning">
        <AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-success-bg text-success">
      <Check size={12} strokeWidth={2.6} aria-hidden="true" />
    </span>
  );
}

function pageStateLabel(page: ManualDetailPage): string {
  if (page.ocr_status === 'failed') return 'falló la lectura';
  if (page.text_quality === 'low_confidence') return 'baja confianza';
  return 'leída correctamente';
}

function PageThumb({
  page,
  active,
  hits,
  onSelect,
}: Readonly<{
  page: ManualDetailPage;
  active: boolean;
  hits: number;
  onSelect: () => void;
}>) {
  const warns = page.text_quality === 'low_confidence' && page.ocr_status !== 'failed';
  const idleBorder = cn(
    'border hover:border-border-strong',
    warns ? 'border-warning' : 'border-border',
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      aria-label={`Página ${page.page_number} — ${pageStateLabel(page)}${
        hits > 0 ? `, ${hits} coincidencias` : ''
      }`}
      className={cn(
        'relative flex w-full shrink-0 flex-col gap-1 overflow-hidden rounded-xl p-3 pt-7 text-left',
        'min-h-24 min-w-20 bg-gradient-to-b from-surface to-surface-2 transition-shadow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active ? 'border-2 border-primary shadow-[0_0_0_4px_rgba(224,122,31,0.18)]' : idleBorder,
      )}
    >
      {THUMB_LINES.map((width) => (
        <span
          key={width}
          aria-hidden="true"
          className="h-[3px] rounded-full bg-fg/40"
          style={{ width: `${width}%` }}
        />
      ))}
      <span className="mono absolute left-1.5 top-1.5 rounded border border-border bg-card px-1.5 py-px text-[10px] font-bold text-fg-2">
        P.{page.page_number}
      </span>
      <StatusDot page={page} />
      {hits > 0 ? (
        <span className="mono absolute bottom-1.5 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-fg-inv">
          {hits}
        </span>
      ) : null}
    </button>
  );
}

export function PageThumbRail({
  pages,
  activePage,
  hitsByPage,
  onSelect,
}: Readonly<{
  pages: readonly ManualDetailPage[];
  activePage: number;
  hitsByPage: ReadonlyMap<number, number>;
  onSelect: (pageNumber: number) => void;
}>) {
  const hasLowConfidence = pages.some((page) => page.text_quality === 'low_confidence');
  return (
    <nav aria-label="Páginas del manual" className="flex min-w-0 flex-col gap-2">
      <span className="mono px-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-3">
        Páginas · {pages.length}
      </span>
      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0">
        {pages.map((page) => (
          <PageThumb
            key={page.page_number}
            page={page}
            active={page.page_number === activePage}
            hits={hitsByPage.get(page.page_number) ?? 0}
            onSelect={() => onSelect(page.page_number)}
          />
        ))}
      </div>
      {hasLowConfidence ? (
        <p className="hidden items-center gap-1.5 px-0.5 text-[11px] leading-snug text-fg-3 md:flex">
          <AlertTriangle size={12} className="shrink-0 text-warning" aria-hidden="true" />
          Baja confianza del OCR
        </p>
      ) : null}
    </nav>
  );
}
