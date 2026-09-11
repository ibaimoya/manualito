import {
  ImageIcon,
  StackIcon,
  PencilSimpleIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import type { ManualDetailPage, OcrLine } from '@/shared/api/client';
import { confidenceLegend, confidenceTone, pageStatus } from '@/features/manual/pageStatus';
import { labManual, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';

/* V-C "Mesa de trabajo": filmstrip horizontal arriba, texto + inspector lateral de metadatos.
   Densidad de herramienta: la confianza va inline siempre que el modo esté activo. */

const STATUS_DOT: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  accent: 'bg-accent',
  error: 'bg-error',
};

const CONFIDENCE_TEXT: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

function FilmstripCard({
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
  const st = pageStatus(page);
  const preview = page.ocr_lines
    .map((line) => line.text)
    .join(' ')
    .trim();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      aria-label={`Página ${page.page_number} · ${st.label}`}
      className={cn(
        'flex w-36 shrink-0 flex-col rounded-md border text-left transition-[border-color] duration-150 ease-[var(--ease-mn)]',
        active ? 'border-primary' : 'border-border hover:border-border-strong',
      )}
    >
      <span className="flex h-16 flex-col gap-0.5 overflow-hidden bg-bg px-2 py-1.5">
        {preview ? (
          <span className="font-serif text-[8px] leading-[1.5] text-fg-2 [overflow-wrap:anywhere]">
            {preview.slice(0, 180)}
          </span>
        ) : (
          <span className="m-auto text-[10px] text-fg-3">{st.short}</span>
        )}
      </span>
      <span
        className={cn(
          'flex items-center gap-1.5 border-t px-2 py-1',
          active ? 'border-primary/40' : 'border-border',
        )}
      >
        <span className={cn('size-1.5 rounded-full', STATUS_DOT[st.tone])} aria-hidden="true" />
        <span className="text-[11px] font-semibold tabular-nums text-fg">{page.page_number}</span>
        <span className="mono ml-auto truncate text-[10px] text-fg-3">{st.short}</span>
        {hits > 0 ? (
          <span className="mono rounded bg-primary-100 px-1 text-[10px] font-bold tabular-nums text-primary-700">
            {hits}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function WorkbenchLines({
  lines,
  needle,
  showConfidence,
}: Readonly<{ lines: readonly OcrLine[]; needle: string; showConfidence: boolean }>) {
  return (
    <ol className="flex flex-col">
      {lines.map((line, index) => {
        const tone = line.confidence == null ? null : confidenceTone(line.confidence);
        const pct = line.confidence == null ? null : Math.round(line.confidence * 100);
        return (
          <li
            key={index}
            className={cn(
              'grid grid-cols-[28px_minmax(0,1fr)_44px] gap-x-2 border-b border-border/60 py-1.5',
              showConfidence && tone?.tone === 'warning' && 'bg-warning-bg/50',
              showConfidence && tone?.tone === 'error' && 'bg-error-bg/60',
            )}
          >
            <span className="mono pt-[3px] text-right text-[10.5px] tabular-nums text-fg-3">
              {index + 1}
            </span>
            <p className="font-serif text-[14.5px] leading-[1.6] text-fg [overflow-wrap:anywhere]">
              {highlight(line.text, needle)}
            </p>
            {showConfidence ? (
              <span
                className={cn(
                  'mono pt-[2px] text-right text-[12px] tabular-nums',
                  tone ? CONFIDENCE_TEXT[tone.tone] : 'text-fg-3',
                  tone?.tone === 'error' && 'font-semibold',
                )}
              >
                {pct == null ? 's/d' : `${pct}%`}
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function highlight(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle, from);
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-[2px] bg-primary-100 px-0.5 font-semibold text-primary-700">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return parts;
}

function InspectorRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[12px] text-fg-3">{label}</dt>
      <dd className="text-right text-[12.5px] font-medium text-fg">{children}</dd>
    </div>
  );
}

export function VariantC({
  escenario,
  initialPage,
  showConfidence: initialConfidence,
  seededQuery,
}: Readonly<{
  escenario: LabEscenario;
  initialPage: number;
  showConfidence: boolean;
  seededQuery: string;
}>) {
  const manual = labManual(escenario);
  const pages = manual.pages;
  const [activePage, setActivePage] = useState(initialPage);
  const [showConfidence, setShowConfidence] = useState(initialConfidence);
  const search = usePageSearch(pages);
  const [seeded, setSeeded] = useState(false);
  if (!seeded && seededQuery) {
    setSeeded(true);
    search.search(seededQuery);
  }
  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const st = pageStatus(page);
  const withConfidence = page.ocr_lines.filter((line) => line.confidence != null);
  const bands = confidenceLegend().map((item) => ({
    ...item,
    count: withConfidence.filter((line) => confidenceTone(line.confidence ?? 0).tone === item.tone)
      .length,
  }));

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      {/* Barra de mesa: título + búsqueda + toggles */}
      <header className="flex h-11 items-center gap-3 border-b border-border px-4">
        <h1 className="min-w-0 truncate font-display text-[14.5px] font-bold text-fg">
          {manual.title ?? manual.game_name}
        </h1>
        <div className="ml-auto flex h-7 w-64 items-center gap-1.5 rounded-md border border-border pl-2 pr-1 focus-within:border-border-strong">
          <MagnifyingGlassIcon size={13} className="shrink-0 text-fg-3" aria-hidden="true" />
          <input
            type="search"
            value={search.query}
            onChange={(event) => search.search(event.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar en el texto del manual"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-3"
          />
          {search.query ? (
            <span className="mono text-[11px] tabular-nums text-fg-2" aria-live="polite">
              {search.activePosition}/{search.totalHits}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Colorear líneas según su confianza OCR"
          aria-pressed={showConfidence}
          onClick={() => setShowConfidence((value) => !value)}
          className={cn(
            'grid size-7 place-items-center rounded-md text-fg-2 hover:bg-surface hover:text-fg',
            showConfidence && 'text-primary-700',
          )}
        >
          <StackIcon aria-hidden="true" size={15} />
        </button>
      </header>

      {/* Filmstrip */}
      <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface px-4 py-2.5">
        {pages.map((item) => (
          <FilmstripCard
            key={item.page_number}
            page={item}
            active={item.page_number === page.page_number}
            hits={search.hitsByPage.get(item.page_number) ?? 0}
            onSelect={() => setActivePage(item.page_number)}
          />
        ))}
      </div>

      {/* Mesa: texto + inspector */}
      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_260px]">
        <section
          aria-label={`Texto de la página ${page.page_number}`}
          className="min-w-0 md:min-h-0 md:overflow-y-auto"
        >
          <div className="mx-auto max-w-[44rem] px-5 py-4">
            {page.ocr_lines.length === 0 ? (
              <p className="pt-2 text-[13.5px] text-fg-2">
                {st.key === 'failed'
                  ? 'No pudimos leer esta página. Relee desde el inspector.'
                  : 'Leyendo esta página, el texto aparecerá aquí.'}
              </p>
            ) : (
              <WorkbenchLines
                lines={page.ocr_lines}
                needle={search.needle}
                showConfidence={showConfidence}
              />
            )}
          </div>
        </section>

        <aside
          aria-label="Inspector de la página"
          className="border-t border-border bg-surface md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0"
        >
          <div className="px-4 py-3">
            <dl className="border-b border-border pb-2">
              <InspectorRow label="Página">
                <span className="mono tabular-nums">
                  {page.page_number} / {pages.length}
                </span>
              </InspectorRow>
              <InspectorRow label="Estado">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    st.tone === 'success' && 'text-success',
                    st.tone === 'warning' && 'text-warning',
                    st.tone === 'accent' && 'text-accent',
                    st.tone === 'error' && 'text-error',
                  )}
                >
                  <st.Icon size={13} aria-hidden="true" />
                  {st.label}
                </span>
              </InspectorRow>
              <InspectorRow label="Fuente">
                {page.text_source === 'user_edit' ? 'Edición manual' : 'OCR'}
              </InspectorRow>
              <InspectorRow label="Confianza media">
                <span className="mono tabular-nums">
                  {page.ocr_confidence_mean == null
                    ? 's/d'
                    : `${Math.round(page.ocr_confidence_mean * 100)}%`}
                </span>
              </InspectorRow>
            </dl>

            <div className="border-b border-border py-2.5">
              <p className="pb-1.5 text-[11.5px] font-semibold text-fg-2">Confianza OCR</p>
              {bands.map((band) => (
                <div key={band.label} className="flex items-center gap-2 py-1">
                  <span
                    className={cn('size-1.5 rounded-full', STATUS_DOT[band.tone])}
                    aria-hidden="true"
                  />
                  <span className="text-[12px] text-fg-2">{band.label}</span>
                  <span className="mono ml-1 text-[11px] text-fg-3">{band.range}</span>
                  <span className="mono ml-auto text-[12px] font-medium tabular-nums text-fg">
                    {band.count}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1 py-2.5">
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] font-medium text-fg hover:bg-surface-2"
              >
                <ImageIcon size={14} aria-hidden="true" />
                Ver imagen original
              </button>
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] font-medium text-fg hover:bg-surface-2"
              >
                <PencilSimpleIcon size={14} aria-hidden="true" />
                Editar texto
              </button>
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] font-medium text-fg hover:bg-surface-2"
              >
                <ArrowClockwiseIcon size={14} aria-hidden="true" />
                Releer esta página
              </button>
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] font-medium text-error hover:bg-error-bg"
              >
                <TrashIcon size={14} aria-hidden="true" />
                Eliminar manual
              </button>
            </div>

            {search.query ? (
              <button
                type="button"
                onClick={() => search.search('')}
                className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] text-fg-3 hover:text-fg"
              >
                <XIcon size={13} aria-hidden="true" />
                Limpiar búsqueda
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
