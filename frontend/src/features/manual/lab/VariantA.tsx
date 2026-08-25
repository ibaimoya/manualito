import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Layers,
  LoaderCircle,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { ManualDetailPage, OcrLine } from '@/shared/api/client';
import { confidenceTone, pageStatus, pageStatusLegend } from '@/features/manual/pageStatus';
import { labManual, LAB_BUSY_PROGRESS, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';

/* Dirección congelada (acta ronda 1): híbrido A+C. Tres zonas con panel plegable, filas
   estables de confianza con números solo en ese modo, navegación entre dudas a lo FineReader,
   búsqueda con anterior/siguiente y estado de cero resultados, destructivas protegidas. */

const ICON = { sm: 14, md: 16 } as const;
const STROKE = 1.75;

function pagePreview(lines: readonly OcrLine[]): string {
  const text = lines
    .map((line) => line.text)
    .join(' ')
    .replaceAll('\n', ' ')
    .trim();
  return text.length > 0 ? text : 'Sin texto todavía';
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
        <span className={cn('text-[13px] font-semibold', active ? 'text-primary-700' : 'text-fg')}>
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
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-3 pb-2 pt-2">
      {pageStatusLegend().map((item) => (
        <span
          key={item.key}
          title={item.label}
          className="inline-flex items-center gap-1.5 text-[12px] text-fg-3"
        >
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[item.tone])} aria-hidden="true" />
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
      title={label}
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

function MiniNavButton({
  label,
  disabled,
  onClick,
  children,
}: Readonly<{ label: string; disabled: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded text-fg-3 hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

type MatchCounter = { value: number };

function highlightNeedle(
  text: string,
  needle: string,
  counter: MatchCounter,
  activeIndex: number | null,
): ReactNode {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle, from);
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    const isActive = counter.value === activeIndex;
    parts.push(
      <mark
        key={`${at}-${counter.value}`}
        className={cn(
          'rounded-[2px] px-0.5 font-semibold',
          isActive
            ? 'bg-primary text-fg-inv'
            : 'bg-primary-100 text-primary-700 ring-1 ring-primary-300/70',
        )}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    counter.value += 1;
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return parts;
}

function ReadingLines({
  lines,
  needle,
  activeMatch,
  showConfidence,
  activeDuda,
  registerRow,
}: Readonly<{
  lines: readonly OcrLine[];
  needle: string;
  activeMatch: number | null;
  showConfidence: boolean;
  activeDuda: number | null;
  registerRow: (index: number, node: HTMLDivElement | null) => void;
}>) {
  const counter: MatchCounter = { value: 0 };
  return (
    <div className="flex flex-col">
      {lines.map((line, index) => {
        const tone = line.confidence == null ? null : confidenceTone(line.confidence);
        const pct = line.confidence == null ? null : Math.round(line.confidence * 100);
        const problem =
          showConfidence && (tone?.tone === 'warning' || tone?.tone === 'error');
        return (
          <div
            key={index}
            ref={(node) => registerRow(index, node)}
            className={cn(
              'grid',
              showConfidence
                ? '-mx-2 grid-cols-[26px_minmax(0,1fr)_44px] gap-x-2.5 px-2'
                : 'grid-cols-1',
              showConfidence && tone?.tone === 'warning' && 'bg-warning-bg/75',
              showConfidence && tone?.tone === 'error' && 'bg-error-bg/85',
              activeDuda === index && 'outline outline-2 -outline-offset-1 outline-primary/50',
            )}
          >
            {showConfidence ? (
              <span className="mono pt-[6px] text-right text-[11px] tabular-nums text-fg-3">
                {index + 1}
              </span>
            ) : null}
            <p className="pb-3.5 font-serif text-[15.5px] leading-[1.72] text-fg [overflow-wrap:anywhere]">
              {highlightNeedle(line.text, needle, counter, activeMatch)}
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
                {problem ? `${pct}%` : pct == null ? 's/d' : `${pct}%`}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
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

function OriginalPanel({
  page,
  open,
  onToggle,
}: Readonly<{ page: ManualDetailPage; open: boolean; onToggle: () => void }>) {
  if (!open) {
    return (
      <aside className="hidden border-l border-border bg-surface md:flex md:flex-col md:items-center md:py-3">
        <button
          type="button"
          aria-label="Mostrar la imagen original"
          title="Mostrar la imagen original"
          onClick={onToggle}
          className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface-2 hover:text-fg"
        >
          <PanelRightOpen size={ICON.md} strokeWidth={STROKE} />
        </button>
        <p
          className="mt-3 text-[11px] font-semibold tracking-wide text-fg-3"
          style={{ writingMode: 'vertical-rl' }}
        >
          Original
        </p>
      </aside>
    );
  }
  return (
    <aside
      aria-label="Imagen original de la página"
      className="hidden border-l border-border bg-surface md:flex md:min-h-0 md:flex-col md:overflow-y-auto"
    >
      <div className="flex items-center gap-2 px-4 pb-1 pt-2.5">
        <p className="text-[12.5px] font-semibold text-fg-2">Original</p>
        <p className="mono text-[11px] tabular-nums text-fg-3">página {page.page_number}</p>
        <button
          type="button"
          aria-label="Ocultar la imagen original"
          title="Ocultar la imagen original"
          onClick={onToggle}
          className="ml-auto grid size-7 place-items-center rounded text-fg-3 hover:text-fg"
        >
          <PanelRightClose size={ICON.sm} strokeWidth={STROKE} />
        </button>
      </div>
      <div className="flex-1 px-4 pb-4 pt-2">
        {page.image_available ? (
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
            <div className="absolute inset-x-6 top-6 space-y-2.5" aria-hidden="true">
              {[92, 78, 85, 60, 88, 74, 40].map((width, row) => (
                <div
                  key={row}
                  className="h-2 rounded-sm bg-surface-2"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
            <p className="mono absolute inset-x-0 bottom-3 text-center text-[11px] text-fg-3">
              el escaneo real aparece aquí
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 pt-2">
            <AlertTriangle
              size={16}
              strokeWidth={STROKE}
              className="mt-0.5 shrink-0 text-fg-3"
              aria-hidden="true"
            />
            <p className="text-[13px] leading-relaxed text-fg-2">
              Esta página no tiene escaneo guardado.
            </p>
          </div>
        )}
      </div>
    </aside>
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeDuda, setActiveDuda] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
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
  const dudas = page.ocr_lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      if (line.confidence == null) return false;
      const tone = confidenceTone(line.confidence).tone;
      return tone === 'warning' || tone === 'error';
    })
    .map(({ index }) => index);
  const activeMatch =
    search.active !== null && search.active.pageNumber === page.page_number
      ? search.active.indexInPage
      : null;
  const noResults = search.query.trim().length > 0 && search.totalHits === 0;

  function goToPage(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > pages.length) return;
    setActivePage(pageNumber);
    setActiveDuda(null);
  }

  function registerRow(index: number, node: HTMLDivElement | null): void {
    if (node) rowRefs.current.set(index, node);
    else rowRefs.current.delete(index);
  }

  function jumpToMatch(delta: 1 | -1): void {
    const match = search.step(delta);
    if (match) goToPage(match.pageNumber);
  }

  function jumpToDuda(delta: 1 | -1): void {
    if (dudas.length === 0) return;
    const at = activeDuda === null ? -1 : dudas.indexOf(activeDuda);
    const next = dudas[(at + delta + dudas.length) % dudas.length]!;
    setActiveDuda(next);
    rowRefs.current.get(next)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }

  function toggleConfidence(): void {
    setShowConfidence((value) => !value);
    setActiveDuda(null);
  }

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border px-5 py-2.5">
        <h1 className="min-w-0 truncate font-display text-[17px] font-bold tracking-tight text-fg">
          {manual.title ?? manual.game_name}
        </h1>
        <span className="mono shrink-0 text-[11.5px] text-fg-3">
          PDF · {manual.page_count} páginas
        </span>
        <div className="relative ml-auto shrink-0">
          <ToolbarButton
            label="Acciones del manual"
            pressed={actionsOpen}
            onClick={() => setActionsOpen((value) => !value)}
          >
            <MoreHorizontal size={ICON.md} strokeWidth={STROKE} aria-hidden="true" />
          </ToolbarButton>
          {actionsOpen ? (
            <div className="absolute right-0 top-10 z-20 w-52 rounded-lg border border-border bg-card py-1 shadow-md">
              <button
                type="button"
                disabled={busy}
                className="flex h-9 w-full items-center gap-2.5 px-3 text-[13px] font-medium text-fg hover:bg-surface disabled:opacity-45"
              >
                <RotateCw size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                Releer todo el manual
              </button>
              <div className="mx-3 my-1 border-t border-border" />
              <button
                type="button"
                className="flex h-9 w-full items-center gap-2.5 px-3 text-[13px] font-medium text-error hover:bg-error-bg"
              >
                <Trash2 size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                Eliminar manual…
              </button>
            </div>
          ) : null}
        </div>
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

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col md:grid',
          panelOpen
            ? 'md:grid-cols-[240px_minmax(0,1.2fr)_minmax(0,1fr)]'
            : 'md:grid-cols-[240px_minmax(0,1fr)_44px]',
        )}
      >
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
              onSelect={() => goToPage(item.page_number)}
            />
          ))}
        </nav>

        <section
          aria-label={`Texto de la página ${page.page_number}`}
          className="min-w-0 md:min-h-0 md:overflow-y-auto"
        >
          <div className="mx-auto max-w-[42rem] px-5 py-4 md:px-8">
            <div className="flex flex-wrap items-center gap-2 pb-4">
              <div
                className={cn(
                  'flex h-8 min-w-52 flex-1 items-center gap-2 rounded-lg border pl-2.5 pr-1 transition-colors duration-150',
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
                  <span className="flex shrink-0 items-center gap-0.5">
                    <span
                      className="mono px-1 text-[12px] tabular-nums text-fg-2"
                      aria-live="polite"
                    >
                      {search.activePosition}/{search.totalHits}
                    </span>
                    <MiniNavButton
                      label="Coincidencia anterior"
                      disabled={search.totalHits === 0}
                      onClick={() => jumpToMatch(-1)}
                    >
                      <ChevronUp size={ICON.sm} strokeWidth={STROKE} />
                    </MiniNavButton>
                    <MiniNavButton
                      label="Coincidencia siguiente"
                      disabled={search.totalHits === 0}
                      onClick={() => jumpToMatch(1)}
                    >
                      <ChevronDown size={ICON.sm} strokeWidth={STROKE} />
                    </MiniNavButton>
                    <MiniNavButton
                      label="Borrar búsqueda"
                      disabled={false}
                      onClick={() => search.search('')}
                    >
                      <X size={ICON.sm} strokeWidth={STROKE} />
                    </MiniNavButton>
                  </span>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <span className="flex items-center">
                  <ToolbarButton
                    label="Colorear líneas según su confianza OCR"
                    pressed={showConfidence}
                    disabled={!hasConfidence}
                    onClick={toggleConfidence}
                  >
                    <Layers size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                    Confianza
                  </ToolbarButton>
                  {showConfidence && hasConfidence ? (
                    <span className="ml-1.5 flex items-center gap-0.5">
                      <span className="mono text-[12px] tabular-nums text-fg-2">
                        {dudas.length} dudas
                      </span>
                      <MiniNavButton
                        label="Duda anterior"
                        disabled={dudas.length === 0}
                        onClick={() => jumpToDuda(-1)}
                      >
                        <ChevronUp size={ICON.sm} strokeWidth={STROKE} />
                      </MiniNavButton>
                      <MiniNavButton
                        label="Duda siguiente"
                        disabled={dudas.length === 0}
                        onClick={() => jumpToDuda(1)}
                      >
                        <ChevronDown size={ICON.sm} strokeWidth={STROKE} />
                      </MiniNavButton>
                    </span>
                  ) : null}
                </span>
                <ToolbarButton label="Editar el texto de esta página" disabled={busy}>
                  <Pencil size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                  Editar
                </ToolbarButton>
              </span>
            </div>

            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={page.page_number <= 1}
                onClick={() => goToPage(page.page_number - 1)}
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
                onClick={() => goToPage(page.page_number + 1)}
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

            {noResults ? (
              <p className="border-b border-border py-3 text-[13px] text-fg-2">
                Sin coincidencias de «{search.query.trim()}» en este manual.
              </p>
            ) : null}

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
                    activeMatch={activeMatch}
                    showConfidence={showConfidence && hasConfidence}
                    activeDuda={showConfidence ? activeDuda : null}
                    registerRow={registerRow}
                  />
                </>
              ) : null}
            </div>
          </div>
        </section>

        <OriginalPanel page={page} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
      </div>
    </div>
  );
}
