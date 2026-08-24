import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  LoaderCircle,
  Pencil,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ManualDetailPage, OcrLine } from '@/shared/api/client';
import { confidenceTone, pageStatus, pageStatusLegend } from '@/features/manual/pageStatus';
import { labManual, LAB_BUSY_PROGRESS, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';

/* V-A "Documento partido": rail informativo 240px + lectura a medida 65ch + panel de imagen.
   Prototipo de laboratorio: componentes nuevos sobre tokens, sin reusar las piezas actuales. */

const ICON = { sm: 14, md: 16 } as const;
const STROKE = 1.75;

/** Primeras palabras reales de la página para el rail (sin folio decorativo). */
function pagePreview(lines: readonly OcrLine[]): string {
  const text = lines
    .map((line) => line.text)
    .join(' ')
    .replaceAll('\n', ' ')
    .trim();
  return text.length > 0 ? text : 'Sin texto todavía';
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  accent: 'bg-accent',
  error: 'bg-error',
};

function RailRow({
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
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full min-w-40 shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-[border-color,background-color] duration-150 ease-[var(--ease-mn)] md:min-w-0',
        active
          ? 'border-primary bg-bg'
          : 'border-transparent hover:border-border-strong hover:bg-bg',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[st.tone])}
          aria-hidden="true"
        />
        <span
          className={cn(
            'text-[13px] font-semibold',
            active ? 'text-primary-700' : 'text-fg',
          )}
        >
          Página {page.page_number}
        </span>
        <span className="mono ml-auto text-[11px] text-fg-3">{st.short}</span>
        {hits > 0 ? (
          <span className="mono rounded bg-primary-100 px-1 text-[11px] font-bold tabular-nums text-primary-700">
            {hits}
          </span>
        ) : null}
      </span>
      <span className="truncate text-[12px] leading-snug text-fg-3">
        {pagePreview(page.ocr_lines)}
      </span>
    </button>
  );
}

function RailLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-1 pt-2">
      {pageStatusLegend().map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] text-fg-3">
          <span
            className={cn('size-1.5 rounded-full', STATUS_DOT[item.tone])}
            aria-hidden="true"
          />
          {item.short}
        </span>
      ))}
    </div>
  );
}

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: Readonly<{
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-[border-color,background-color,color] duration-150 ease-[var(--ease-mn)]',
        pressed
          ? 'border-primary text-primary-700'
          : 'border-border bg-transparent text-fg-2 hover:border-border-strong hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-45',
      )}
    >
      {children}
    </button>
  );
}

function ReadingLines({
  lines,
  needle,
  showConfidence,
}: Readonly<{ lines: readonly OcrLine[]; needle: string; showConfidence: boolean }>) {
  return (
    <div className="flex flex-col">
      {lines.map((line, index) => {
        const tone = line.confidence == null ? null : confidenceTone(line.confidence);
        const pct = line.confidence == null ? null : Math.round(line.confidence * 100);
        const last = index === lines.length - 1;
        const problem = tone?.tone === 'warning' || tone?.tone === 'error';
        return (
          <div
            key={index}
            className={cn(
              'grid',
              showConfidence ? '-mx-2 grid-cols-[3px_minmax(0,1fr)_44px] gap-x-3 px-2' : 'grid-cols-1',
              /* Severidad asimétrica: el texto bueno queda limpio, el dudoso se lava suave. */
              showConfidence && tone?.tone === 'warning' && 'bg-warning-bg/60',
              showConfidence && tone?.tone === 'error' && 'bg-error-bg/70',
            )}
          >
            {showConfidence ? (
              <span
                aria-hidden="true"
                className={cn(
                  problem ? 'w-[3px]' : 'w-px',
                  tone?.tone === 'success' && 'bg-success/40',
                  tone?.tone === 'warning' && 'bg-warning',
                  tone?.tone === 'error' && 'bg-error',
                  tone === null && 'bg-border',
                )}
              />
            ) : null}
            <p
              className={cn(
                'font-serif text-[15.5px] leading-[1.72] text-fg [overflow-wrap:anywhere]',
                !last && 'pb-3.5',
              )}
            >
              {highlightNeedle(line.text, needle)}
            </p>
            {showConfidence ? (
              <span
                className={cn(
                  'mono pt-[4px] text-right text-[12px] tabular-nums',
                  tone?.tone === 'error' && 'font-semibold text-error',
                  tone?.tone === 'warning' && 'font-medium text-warning',
                  (tone?.tone === 'success' || tone === null) && 'text-fg-3',
                )}
                aria-label={pct == null ? 'Sin dato de confianza' : `Confianza ${pct} por ciento`}
              >
                {pct == null ? 's/d' : `${pct}%`}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function highlightNeedle(text: string, needle: string): ReactNode {
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

function CompactState({
  icon,
  title,
  body,
  action,
}: Readonly<{ icon: ReactNode; title: string; body: string; action?: string }>) {
  return (
    <div className="flex items-start gap-3 border-t border-border pt-5">
      <span className="mt-0.5 text-fg-3">{icon}</span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-fg">{title}</p>
        <p className="mt-0.5 max-w-[52ch] text-[13px] leading-relaxed text-fg-2">{body}</p>
        {action ? (
          <button
            type="button"
            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-[13px] font-medium text-fg hover:bg-surface"
          >
            <RotateCw size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
            {action}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PagePlaceholderImage({ page }: Readonly<{ page: ManualDetailPage }>) {
  return (
    <div
      className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-lg border border-border bg-bg shadow-sm"
      style={{
        aspectRatio:
          page.image_width && page.image_height
            ? `${page.image_width} / ${page.image_height}`
            : '3 / 4',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-bg to-surface" />
      <p className="mono absolute inset-x-0 bottom-3 text-center text-[11px] text-fg-3">
        escaneo · página {page.page_number}
      </p>
    </div>
  );
}

export function VariantA({
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
  const busy = manual.status === 'indexing';
  const hasConfidence = page.ocr_lines.some((line) => line.confidence != null);

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      {/* Cabecera del documento: título + meta + acciones, hairline abajo */}
      <header className="flex items-baseline gap-3 border-b border-border px-5 py-3">
        <h1 className="font-display text-[17px] font-bold tracking-tight text-fg">
          {manual.title ?? manual.game_name}
        </h1>
        <span className="mono text-[11.5px] text-fg-3">
          PDF · {manual.page_count} páginas
        </span>
        <span className="ml-auto flex items-center gap-1">
          <ToolbarButton label="Reprocesar todo el manual" disabled={busy}>
            <RotateCw size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Eliminar manual">
            <Trash2 size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
          </ToolbarButton>
        </span>
      </header>

      {busy ? (
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-2">
          <LoaderCircle
            size={ICON.sm}
            strokeWidth={STROKE}
            className="animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium text-fg">Releyendo el manual</p>
          <span className="mono ml-auto text-[11.5px] tabular-nums text-fg-2">
            {LAB_BUSY_PROGRESS.completed_pages} / {LAB_BUSY_PROGRESS.page_count} páginas
          </span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[240px_minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* ─ Rail informativo ─ */}
        <nav
          aria-label="Páginas del manual"
          className="flex gap-1 overflow-x-auto border-b border-border p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r"
        >
          <div className="hidden md:block">
            <RailLegend />
          </div>
          {pages.map((item) => (
            <RailRow
              key={item.page_number}
              page={item}
              active={item.page_number === page.page_number}
              hits={search.hitsByPage.get(item.page_number) ?? 0}
              onSelect={() => setActivePage(item.page_number)}
            />
          ))}
        </nav>

        {/* ─ Columna de lectura ─ */}
        <section
          aria-label={`Texto de la página ${page.page_number}`}
          className="min-w-0 md:min-h-0 md:overflow-y-auto"
        >
          <div className="mx-auto max-w-[42rem] px-5 py-4 md:px-8">
            {/* Toolbar única del documento */}
            <div className="flex items-center gap-2 pb-4">
              <div
                className={cn(
                  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border pl-2.5 pr-1 transition-colors duration-150',
                  search.query
                    ? 'border-primary'
                    : 'border-border focus-within:border-border-strong',
                )}
              >
                <Search
                  size={ICON.sm}
                  strokeWidth={STROKE}
                  className="shrink-0 text-fg-3"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search.query}
                  onChange={(event) => search.search(event.target.value)}
                  placeholder="Buscar en el manual…"
                  aria-label="Buscar en el texto del manual"
                  enterKeyHint="search"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
                />
                {search.query ? (
                  <span className="flex shrink-0 items-center">
                    <span className="mono px-1 text-[11px] tabular-nums text-fg-2" aria-live="polite">
                      {search.activePosition}/{search.totalHits}
                    </span>
                    <button
                      type="button"
                      aria-label="Borrar búsqueda"
                      onClick={() => search.search('')}
                      className="grid size-6 place-items-center rounded text-fg-3 hover:text-fg"
                    >
                      <X size={ICON.sm} strokeWidth={STROKE} />
                    </button>
                  </span>
                ) : null}
              </div>
              <ToolbarButton
                label="Colorear líneas según su confianza OCR"
                pressed={showConfidence}
                disabled={!hasConfidence}
                onClick={() => setShowConfidence((value) => !value)}
              >
                <Layers size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                Confianza
              </ToolbarButton>
              <ToolbarButton label="Editar el texto de esta página" disabled={busy}>
                <Pencil size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
              </ToolbarButton>
            </div>

            {/* Línea de contexto de página: nav + estado, sin card */}
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={page.page_number <= 1}
                onClick={() => setActivePage(page.page_number - 1)}
                className="grid size-7 place-items-center rounded-md border border-border text-fg-2 hover:border-border-strong hover:text-fg disabled:opacity-40"
              >
                <ChevronLeft size={ICON.md} strokeWidth={STROKE} />
              </button>
              <span className="mono text-[12px] font-semibold tabular-nums text-fg">
                {page.page_number} <span className="font-normal text-fg-3">/ {pages.length}</span>
              </span>
              <button
                type="button"
                aria-label="Página siguiente"
                disabled={page.page_number >= pages.length}
                onClick={() => setActivePage(page.page_number + 1)}
                className="grid size-7 place-items-center rounded-md border border-border text-fg-2 hover:border-border-strong hover:text-fg disabled:opacity-40"
              >
                <ChevronRight size={ICON.md} strokeWidth={STROKE} />
              </button>
              <span
                className={cn(
                  'ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium',
                  st.tone === 'success' && 'text-success',
                  st.tone === 'warning' && 'text-warning',
                  st.tone === 'accent' && 'text-accent',
                  st.tone === 'error' && 'text-error',
                )}
              >
                <st.Icon
                  size={ICON.sm}
                  strokeWidth={STROKE}
                  className={st.key === 'processing' ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                {st.label}
              </span>
            </div>

            {/* Contenido de la página */}
            <div className="pt-5">
              {st.key === 'failed' ? (
                <CompactState
                  icon={<AlertTriangle size={18} strokeWidth={STROKE} aria-hidden="true" />}
                  title="No pudimos leer esta página"
                  body="La foto salió demasiado oscura o movida. Reintenta la lectura o sube una versión más nítida."
                  action="Releer esta página"
                />
              ) : null}
              {st.key === 'processing' ? (
                <CompactState
                  icon={
                    <LoaderCircle
                      size={18}
                      strokeWidth={STROKE}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  }
                  title="Leyendo esta página"
                  body="El texto aparecerá aquí en cuanto termine el reconocimiento."
                />
              ) : null}
              {st.key !== 'failed' && st.key !== 'processing' ? (
                <>
                  {st.key === 'edited' ? (
                    <p className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent">
                      <Check size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                      Editada a mano
                    </p>
                  ) : null}
                  {st.key === 'duplicate' ? (
                    <p className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-warning">
                      <Copy size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                      Duplicada de otra página ya subida
                    </p>
                  ) : null}
                  <ReadingLines
                    lines={page.ocr_lines}
                    needle={search.needle}
                    showConfidence={showConfidence && hasConfidence}
                  />
                </>
              ) : null}
            </div>
          </div>
        </section>

        {/* ─ Panel de imagen original ─ */}
        <aside
          aria-label="Imagen original de la página"
          className="hidden border-l border-border bg-surface md:flex md:min-h-0 md:flex-col md:overflow-y-auto"
        >
          <div className="flex items-baseline gap-2 px-4 pb-1 pt-3">
            <p className="text-[12.5px] font-semibold text-fg-2">Original</p>
            <p className="mono text-[11px] tabular-nums text-fg-3">página {page.page_number}</p>
          </div>
          <div className="flex-1 px-4 pb-4 pt-2">
            <PagePlaceholderImage page={page} />
          </div>
        </aside>
      </div>
    </div>
  );
}
