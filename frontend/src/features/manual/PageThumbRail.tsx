import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ManualDetailPage } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import {
  pageStatus,
  pageStatusLegend,
  STATUS_FG_CLASS,
  STATUS_TONE_CLASS,
} from '@/features/manual/pageStatus';

/** Rail de páginas: lista vertical en escritorio, tira de chips en móvil. */

const THUMB_LINES = [88, 64, 80, 52] as const;

function PaperThumb({ failed }: Readonly<{ failed: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative hidden h-[50px] w-[38px] shrink-0 flex-col justify-center gap-1 overflow-hidden rounded-md border border-border p-2 @4xl/app:flex',
        failed
          ? 'bg-[repeating-linear-gradient(135deg,var(--m-surface)_0_6px,var(--m-surface-2)_6px_12px)]'
          : 'bg-gradient-to-b from-surface to-surface-2',
      )}
    >
      {failed ? (
        <AlertTriangle size={16} strokeWidth={2} className="mx-auto text-error/85" />
      ) : (
        THUMB_LINES.map((width) => (
          <span
            key={width}
            className="h-[2.5px] rounded-full bg-fg/15"
            style={{ width: `${width}%` }}
          />
        ))
      )}
    </span>
  );
}

/** Borde/fondo del botón de página por estado; la activa prima, luego la duplicada
 *  (discontinuo), si no el normal. El grosor `border-2` es constante en el callsite. */
function pageButtonSurface(active: boolean, isDup: boolean): string {
  if (active) return 'border-primary bg-primary-50';
  if (isDup) {
    return 'border-dashed border-border-strong bg-card hover:bg-surface-2';
  }
  return 'border-border bg-card hover:border-border-strong hover:bg-surface-2';
}

function PageButton({
  page,
  active,
  hits,
  onSelect,
}: Readonly<{ page: ManualDetailPage; active: boolean; hits: number; onSelect: () => void }>) {
  const { t } = useTranslation('manual');
  const st = pageStatus(page);
  const isDup = st.key === 'duplicate';
  const hitsLabel = hits > 0 ? t('page.matches', { count: hits }) : '';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      aria-label={t('page.buttonLabel', {
        hits: hitsLabel,
        pageNumber: page.page_number,
        status: st.label,
      })}
      className={cn(
        // border-2 constante: el grosor no cambia entre estados, así la tarjeta
        // no crece al activarse. La activa se distingue por color y fondo.
        'relative flex shrink-0 border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        // móvil: chip vertical · escritorio: fila completa
        'h-[58px] w-[46px] flex-col items-center justify-center gap-1 rounded-xl',
        '@4xl/app:h-auto @4xl/app:w-full @4xl/app:flex-row @4xl/app:items-center @4xl/app:justify-start @4xl/app:gap-3 @4xl/app:rounded-2xl @4xl/app:p-2',
        pageButtonSurface(active, isDup),
      )}
    >
      <PaperThumb failed={st.key === 'failed'} />

      {/* número compacto (móvil) */}
      <span
        className={cn(
          'mono text-xs font-bold tabular-nums @4xl/app:hidden',
          active ? 'text-primary-700' : 'text-fg-2',
        )}
      >
        {page.page_number}
      </span>
      {/* etiqueta (escritorio) */}
      <span
        className={cn(
          'hidden min-w-0 flex-1 truncate font-body text-sm font-semibold tabular-nums @4xl/app:block',
          active ? 'text-fg' : 'text-fg-2',
        )}
      >
        {t('page.number', { pageNumber: page.page_number })}
      </span>

      {hits > 0 ? (
        <span className="mono hidden h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-fg-inv @4xl/app:grid">
          {hits}
        </span>
      ) : null}

      {/* estado: icono suelto (móvil) / punto redondo (escritorio); el de
          "Procesando" gira para que se note que el trabajo sigue en curso. */}
      <st.Icon
        size={12}
        strokeWidth={2.3}
        className={cn(
          '@4xl/app:hidden',
          STATUS_FG_CLASS[st.tone],
          st.key === 'processing' && 'animate-spin',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'hidden size-6 shrink-0 place-items-center rounded-full @4xl/app:grid',
          STATUS_TONE_CLASS[st.tone],
        )}
      >
        <st.Icon
          size={13}
          strokeWidth={2.4}
          className={cn(st.key === 'processing' && 'animate-spin')}
          aria-hidden="true"
        />
      </span>

      {hits > 0 ? (
        <span className="mono absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-fg-inv @4xl/app:hidden">
          {hits}
        </span>
      ) : null}
    </button>
  );
}

function Legend() {
  // Dos columnas alineadas: con 6 estados, el wrap libre quedaba descuadrado.
  // Cada celda lleva su icono en un punto de color del mismo tono que el chip.
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
      {pageStatusLegend().map((st) => (
        <span
          key={st.key}
          className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-fg-2"
        >
          <span
            className={cn(
              'grid size-[18px] shrink-0 place-items-center rounded-md',
              STATUS_TONE_CLASS[st.tone],
            )}
            aria-hidden="true"
          >
            <st.Icon size={11} strokeWidth={2.4} />
          </span>
          <span className="truncate">{st.short}</span>
        </span>
      ))}
    </div>
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
  const { t } = useTranslation('manual');
  // Un solo <nav> (landmark único); escritorio y móvil se alternan por media query.
  return (
    <nav
      aria-label={t('page.navLabel')}
      className="min-w-0 @4xl/app:flex @4xl/app:min-h-0 @4xl/app:flex-1 @4xl/app:flex-col"
    >
      {/* cabecera + leyenda — solo escritorio */}
      <div className="hidden @4xl/app:block">
        <div className="flex items-center justify-between px-1 pb-2.5">
          <h2 className="font-display text-lg font-bold tracking-tight text-fg">
            {t('page.heading')}
          </h2>
          <span className="mono rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg-3">
            {pages.length}
          </span>
        </div>
        <div className="px-1 pb-3">
          <Legend />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 @4xl/app:min-h-0 @4xl/app:flex-1 @4xl/app:flex-col @4xl/app:overflow-x-visible @4xl/app:overflow-y-auto @4xl/app:pb-2 @4xl/app:pr-1">
        {pages.map((page) => (
          <PageButton
            key={page.page_number}
            page={page}
            active={page.page_number === activePage}
            hits={hitsByPage.get(page.page_number) ?? 0}
            onSelect={() => onSelect(page.page_number)}
          />
        ))}
      </div>
    </nav>
  );
}
