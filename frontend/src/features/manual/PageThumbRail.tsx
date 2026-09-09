import { useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { api } from '@/shared/api/client';
import { Tooltip } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { HelpIndicator } from '@/components/ui/help-indicator';
import type { ManualDetailPage } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { pageStatus, pageStatusLegend, STATUS_HELP_TONE } from '@/features/manual/pageStatus';

/** Índice de páginas vertical en escritorio y horizontal en móvil. */

const THUMB_LINES = [88, 64, 80, 52] as const;

function PaperThumb({ failed, imageUrl }: Readonly<{ failed: boolean; imageUrl: string | null }>) {
  const [imageFailed, setImageFailed] = useState(false);
  if (imageUrl && !imageFailed)
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        onError={() => setImageFailed(true)}
        className="hidden h-[54px] w-[38px] shrink-0 rounded-sm border border-border bg-white object-cover object-top @4xl/app:block"
      />
    );
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

function PageButton({
  manualId,
  page,
  active,
  hits,
  onSelect,
}: Readonly<{
  manualId: string;
  page: ManualDetailPage;
  active: boolean;
  hits: number;
  onSelect: () => void;
}>) {
  const { t } = useTranslation('manual');
  const st = pageStatus(page);
  const hitsLabel = hits > 0 ? t('page.matches', { count: hits }) : '';
  return (
    <div
      className={cn(
        'relative flex h-11 w-[76px] shrink-0 items-center rounded-[6px]',
        '@4xl/app:h-auto @4xl/app:w-full @4xl/app:gap-1 @4xl/app:p-2',
        active
          ? 'bg-fg/[0.055] before:absolute before:inset-x-2 before:bottom-0 before:h-0.5 before:bg-primary @4xl/app:before:inset-x-auto @4xl/app:before:inset-y-2 @4xl/app:before:start-0 @4xl/app:before:h-auto @4xl/app:before:w-0.5'
          : 'hover:bg-fg/[0.035]',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        aria-label={t('page.buttonLabel', {
          hits: hitsLabel,
          pageNumber: page.page_number,
          status: st.label,
        })}
        className="flex min-h-10 min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-[inherit] after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary/40 @4xl/app:flex-row @4xl/app:justify-start @4xl/app:gap-3"
      >
        <PaperThumb
          key={page.page_number}
          failed={st.key === 'failed'}
          imageUrl={
            page.image_available ? api.manualPageImageUrl(manualId, page.page_number) : null
          }
        />

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
            'hidden min-w-0 flex-1 items-baseline gap-1 font-body text-sm font-semibold tabular-nums @4xl/app:flex',
            active ? 'text-fg' : 'text-fg-2',
          )}
        >
          <span className="truncate">{t('page.label')}</span>
          <span className="shrink-0">{page.page_number}</span>
        </span>

        {hits > 0 ? (
          <span className="mono grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-fg-inv @4xl/app:h-[18px] @4xl/app:min-w-[18px] @4xl/app:px-1.5 @4xl/app:text-[10px]">
            {hits}
          </span>
        ) : null}
      </button>
      <HelpIndicator
        icon={st.Icon}
        label={st.tip}
        tone={STATUS_HELP_TONE[st.tone]}
        iconClassName={page.ocr_status === 'processing' ? 'animate-spin' : undefined}
        className="size-8 min-h-8 min-w-8 shrink-0"
      />
    </div>
  );
}

function Legend() {
  // Dos columnas alineadas: con 6 estados, el wrap libre quedaba descuadrado.
  // La leyenda conserva texto y forma para no depender solo del color.
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
      {pageStatusLegend().map((st) => (
        <span
          key={st.key}
          className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-inherit"
        >
          <span className="grid size-[18px] shrink-0 place-items-center" aria-hidden="true">
            <st.Icon
              size={st.key === 'failed' ? 17 : 14}
              strokeWidth={st.key === 'failed' ? 1.8 : 2}
              className={cn(
                'block',
                (st.key === 'failed' || st.key === 'processing') && '-translate-y-px',
              )}
            />
          </span>
          <span className="truncate">{st.short}</span>
        </span>
      ))}
    </div>
  );
}

export function PageThumbRail({
  manualId,
  pages,
  activePage,
  hitsByPage,
  onSelect,
}: Readonly<{
  manualId: string;
  pages: readonly ManualDetailPage[];
  activePage: number;
  hitsByPage: ReadonlyMap<number, number>;
  onSelect: (pageNumber: number) => void;
}>) {
  const { t } = useTranslation('manual');
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const revealSelection = () => {
      const row = scroller.querySelector('[aria-current]')?.parentElement;
      if (!row) return;
      const bounds = scroller.getBoundingClientRect();
      const item = row.getBoundingClientRect();
      // Desplaza solo el índice, sin mover el documento ni la zona de lectura.
      scroller.scrollTo({
        left:
          scroller.scrollLeft +
          Math.min(0, item.left - bounds.left) +
          Math.max(0, item.right - bounds.left - scroller.clientWidth),
        top:
          scroller.scrollTop +
          Math.min(0, item.top - bounds.top) +
          Math.max(0, item.bottom - bounds.top - scroller.clientHeight),
        behavior: 'instant',
      });
    };
    revealSelection();
    const observer = new ResizeObserver(revealSelection);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [activePage]);

  // Un solo <nav> (landmark único); escritorio y móvil se alternan por media query.
  return (
    <nav
      aria-label={t('page.navLabel')}
      className="min-w-0 @4xl/app:flex @4xl/app:min-h-0 @4xl/app:flex-1 @4xl/app:flex-col"
    >
      {/* Cabecera y leyenda de escritorio. */}
      <div className="hidden @4xl/app:block">
        <div className="flex items-center justify-between px-1 pb-2.5">
          <h2 className="text-sm font-semibold text-fg">{t('page.heading')}</h2>
          <span className="mono text-xs tabular-nums text-fg-3">{pages.length}</span>
        </div>
        <div className="mb-2 px-1">
          <Tooltip content={<Legend />} touch>
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-2 text-xs text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Info size={14} aria-hidden="true" />
              {t('page.legend')}
            </button>
          </Tooltip>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-1 overflow-x-auto pb-1 @4xl/app:min-h-0 @4xl/app:flex-1 @4xl/app:flex-col @4xl/app:overflow-x-visible @4xl/app:overflow-y-auto @4xl/app:pb-2 @4xl/app:pr-1"
      >
        {pages.map((page) => (
          <PageButton
            key={page.page_number}
            manualId={manualId}
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
