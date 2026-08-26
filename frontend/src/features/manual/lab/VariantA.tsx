import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Layers,
  List,
  LoaderCircle,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

function statusDotClass(st: { key: string; tone: string }): string {
  if (st.key === 'processing') return 'bg-fg-3';
  return STATUS_DOT[st.tone] ?? 'bg-fg-3';
}

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
          className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(st))}
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
          <span
            className={cn('size-1.5 rounded-full', statusDotClass(item))}
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
      className="grid size-6 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
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
                ? 'relative -mx-2 grid-cols-[26px_minmax(0,1fr)_44px] gap-x-2.5 px-2'
                : 'grid-cols-1',
              problem &&
                'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
              showConfidence && tone?.tone === 'warning' && 'bg-warning-bg before:bg-warning',
              showConfidence && tone?.tone === 'error' && 'bg-error-bg before:bg-error',
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
  actions,
}: Readonly<{ icon: ReactNode; title: string; body: string; actions?: ReactNode }>) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <span className="mt-0.5 text-fg-3">{icon}</span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-fg">{title}</p>
        <p className="mt-0.5 max-w-[52ch] text-[13px] leading-relaxed text-fg-2">{body}</p>
        {actions ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

function ZoomControls({
  zoom,
  onStep,
  onReset,
}: Readonly<{ zoom: number; onStep: (delta: number) => void; onReset: () => void }>) {
  return (
    <span className="flex items-center gap-0.5">
      <MiniNavButton label="Alejar la imagen" disabled={zoom <= ZOOM_MIN} onClick={() => onStep(-0.25)}>
        <Minus size={ICON.sm} strokeWidth={STROKE} />
      </MiniNavButton>
      <button
        type="button"
        title="Ajustar al ancho del panel"
        disabled={zoom === 1}
        onClick={onReset}
        className="mono h-6 rounded-md px-1 text-[11px] tabular-nums text-fg-2 hover:bg-surface-2 hover:text-fg disabled:cursor-default disabled:hover:bg-transparent"
      >
        {Math.round(zoom * 100)}%
      </button>
      <MiniNavButton label="Acercar la imagen" disabled={zoom >= ZOOM_MAX} onClick={() => onStep(0.25)}>
        <Plus size={ICON.sm} strokeWidth={STROKE} />
      </MiniNavButton>
    </span>
  );
}

function PaperPreview({
  page,
  zoom,
  maxWidth,
}: Readonly<{ page: ManualDetailPage; zoom: number; maxWidth: number }>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-bg shadow-sm',
        zoom <= 1 && 'mx-auto',
      )}
      style={{
        aspectRatio:
          page.image_width && page.image_height
            ? `${page.image_width} / ${page.image_height}`
            : '3 / 4',
        width: `${zoom * 100}%`,
        maxWidth: zoom <= 1 ? `${maxWidth}px` : undefined,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-bg to-surface" />
      <div className="absolute inset-x-6 top-6 space-y-2.5" aria-hidden="true">
        {[92, 78, 85, 60, 88, 74, 40].map((width, row) => (
          <div key={row} className="h-2 rounded-sm bg-surface-2" style={{ width: `${width}%` }} />
        ))}
      </div>
      <p className="mono absolute inset-x-0 bottom-3 text-center text-[11px] text-fg-3">
        el escaneo real aparece aquí
      </p>
    </div>
  );
}

function MissingScan() {
  return (
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
  );
}

function OriginalPanel({
  page,
  open,
  onToggle,
}: Readonly<{ page: ManualDetailPage; open: boolean; onToggle: () => void }>) {
  const [zoom, setZoom] = useState(1);
  function stepZoom(delta: number): void {
    setZoom((value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((value + delta) * 4) / 4)));
  }
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
        {page.image_available ? (
          <span className="ml-auto">
            <ZoomControls zoom={zoom} onStep={stepZoom} onReset={() => setZoom(1)} />
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Ocultar la imagen original"
          title="Ocultar la imagen original"
          onClick={onToggle}
          className={cn(
            'grid size-7 place-items-center rounded text-fg-3 hover:text-fg',
            !page.image_available && 'ml-auto',
          )}
        >
          <PanelRightClose size={ICON.sm} strokeWidth={STROKE} />
        </button>
      </div>
      <div
        className={cn('flex-1 overflow-auto px-4 pb-4 pt-2', zoom > 1 && 'cursor-grab')}
        title={zoom > 1 ? 'Desplázate para recorrer la imagen ampliada' : undefined}
      >
        {page.image_available ? (
          <PaperPreview page={page} zoom={zoom} maxWidth={520} />
        ) : (
          <MissingScan />
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pagesSheet, setPagesSheet] = useState(false);
  const [originalSheet, setOriginalSheet] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!deleteOpen) return;
    cancelDeleteRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDeleteOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deleteOpen]);

  const transientOpen = pagesSheet || originalSheet || actionsOpen;
  useEffect(() => {
    if (!transientOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setPagesSheet(false);
      setOriginalSheet(false);
      setActionsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [transientOpen]);
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

  const pageText = page.ocr_lines.map((line) => line.text).join('\n');
  const dirty = editing && draft !== pageText;

  function goToPage(pageNumber: number): void {
    if (editing) return;
    if (pageNumber < 1 || pageNumber > pages.length) return;
    setActivePage(pageNumber);
    setActiveDuda(null);
  }

  function startEditing(): void {
    setDraft(pageText);
    setConfirmDiscard(false);
    setEditing(true);
  }

  function stopEditing(): void {
    setEditing(false);
    setConfirmDiscard(false);
  }

  function requestCancelEdit(): void {
    if (dirty) {
      setConfirmDiscard(true);
      requestAnimationFrame(() => keepEditingRef.current?.focus());
    } else {
      stopEditing();
    }
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
            <>
              <button
                type="button"
                aria-label="Cerrar el menú"
                tabIndex={-1}
                onClick={() => setActionsOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 top-10 z-20 w-52 rounded-lg border border-border bg-card py-1 shadow-md">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setActionsOpen(false)}
                  className="flex h-9 w-full items-center gap-2.5 px-3 text-[13px] font-medium text-fg hover:bg-surface disabled:opacity-45"
                >
                  <RotateCw size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                  Releer todo el manual
                </button>
                <div className="mx-3 my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    setDeleteOpen(true);
                  }}
                  className="flex h-9 w-full items-center gap-2.5 px-3 text-[13px] font-medium text-error hover:bg-error-bg"
                >
                  <Trash2 size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                  Eliminar manual…
                </button>
              </div>
            </>
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
          className="hidden md:flex md:flex-col md:gap-1 md:overflow-y-auto md:border-r md:border-border md:p-2"
        >
          <RailLegend />
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

        <div className="flex h-11 items-center gap-1 border-b border-border px-2 md:hidden">
          <button
            type="button"
            disabled={editing}
            onClick={() => setPagesSheet(true)}
            className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-left disabled:opacity-45"
          >
            <List size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-fg-2" aria-hidden="true" />
            <span className="truncate text-[13px] font-semibold text-fg">
              Página {page.page_number} de {pages.length}
            </span>
            <span
              className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(st))}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => setOriginalSheet(true)}
            className="ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg-2"
          >
            <ImageIcon size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
            Ver original
          </button>
        </div>

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
                    : 'border-border-strong focus-within:border-primary/60',
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
                  disabled={editing}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3 disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:appearance-none"
                />
                {search.query ? (
                  <span className="hidden shrink-0 items-center gap-0.5 md:flex">
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
                    disabled={!hasConfidence || editing}
                    onClick={toggleConfidence}
                  >
                    <Layers size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                    Confianza
                  </ToolbarButton>
                  {showConfidence && hasConfidence && !editing ? (
                    <span className="ml-1.5 flex items-center gap-0.5">
                      {dudas.length === 0 ? (
                        <span className="text-[12px] text-fg-3">Sin dudas</span>
                      ) : (
                        <>
                          <span className="mono text-[12px] tabular-nums text-fg-2" aria-live="polite">
                            {activeDuda !== null && dudas.includes(activeDuda)
                              ? `Duda ${dudas.indexOf(activeDuda) + 1} de ${dudas.length}`
                              : `${dudas.length} dudas`}
                          </span>
                          <MiniNavButton
                            label="Duda anterior"
                            disabled={false}
                            onClick={() => jumpToDuda(-1)}
                          >
                            <ChevronUp size={ICON.sm} strokeWidth={STROKE} />
                          </MiniNavButton>
                          <MiniNavButton
                            label="Duda siguiente"
                            disabled={false}
                            onClick={() => jumpToDuda(1)}
                          >
                            <ChevronDown size={ICON.sm} strokeWidth={STROKE} />
                          </MiniNavButton>
                        </>
                      )}
                    </span>
                  ) : null}
                </span>
                <ToolbarButton
                  label={editing ? 'Salir de la edición' : 'Editar el texto de esta página'}
                  pressed={editing}
                  disabled={busy || st.key === 'failed' || st.key === 'processing'}
                  onClick={() => (editing ? requestCancelEdit() : startEditing())}
                >
                  <Pencil size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                  {editing ? 'Salir' : 'Editar'}
                </ToolbarButton>
              </span>
            </div>

            {search.query && !editing ? (
              <div className="-mt-2 flex items-center pb-2 md:hidden">
                <span className="text-[13px] text-fg-2" aria-live="polite">
                  {search.totalHits === 0
                    ? 'Sin coincidencias'
                    : `Coincidencia ${search.activePosition} de ${search.totalHits}`}
                </span>
                <button
                  type="button"
                  aria-label="Coincidencia anterior"
                  disabled={search.totalHits === 0}
                  onClick={() => jumpToMatch(-1)}
                  className="ml-auto grid size-11 place-items-center rounded-lg text-fg-2 disabled:opacity-40"
                >
                  <ChevronUp size={ICON.md} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Coincidencia siguiente"
                  disabled={search.totalHits === 0}
                  onClick={() => jumpToMatch(1)}
                  className="grid size-11 place-items-center rounded-lg text-fg-2 disabled:opacity-40"
                >
                  <ChevronDown size={ICON.md} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => search.search('')}
                  className="grid size-11 place-items-center rounded-lg text-fg-2"
                >
                  <X size={ICON.md} strokeWidth={STROKE} />
                </button>
              </div>
            ) : null}

            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                type="button"
                aria-label="Página anterior"
                title={editing ? 'Termina la edición para cambiar de página' : undefined}
                disabled={page.page_number <= 1 || editing}
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
                title={editing ? 'Termina la edición para cambiar de página' : undefined}
                disabled={page.page_number >= pages.length || editing}
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
                  body="La foto salió demasiado oscura o movida. Sube una versión más nítida o vuelve a intentar la lectura."
                  actions={
                    <>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[13px] font-semibold text-fg-inv hover:opacity-90"
                      >
                        <Upload size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                        Sustituir la imagen
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-[13px] font-medium text-fg hover:bg-surface"
                      >
                        <RotateCw size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                        Reintentar la lectura
                      </button>
                    </>
                  }
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
              {st.key !== 'failed' && st.key !== 'processing' && editing ? (
                <div>
                  <textarea
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setConfirmDiscard(false);
                    }}
                    aria-label={`Editar el texto de la página ${page.page_number}`}
                    rows={Math.max(8, draft.split('\n').length + 1)}
                    className="w-full resize-none rounded-lg border border-border-strong bg-bg px-3.5 py-3 font-serif text-[15.5px] leading-[1.72] text-fg outline-none focus:border-primary"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    {confirmDiscard ? (
                      <>
                        <p className="text-[13px] font-medium text-fg">¿Descartar los cambios?</p>
                        <button
                          type="button"
                          onClick={stopEditing}
                          className="inline-flex h-8 items-center rounded-lg bg-error px-3 text-[13px] font-semibold text-fg-inv hover:opacity-90"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          ref={keepEditingRef}
                          onClick={() => setConfirmDiscard(false)}
                          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg hover:bg-surface"
                        >
                          Seguir editando
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!dirty}
                          onClick={stopEditing}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-fg-inv hover:opacity-90 disabled:opacity-45"
                        >
                          <Check size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                          Guardar cambios
                        </button>
                        <button
                          type="button"
                          onClick={requestCancelEdit}
                          className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg hover:bg-surface"
                        >
                          Cancelar
                        </button>
                        {dirty ? (
                          <span className="text-[12px] text-fg-3">Cambios sin guardar</span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
              {st.key !== 'failed' && st.key !== 'processing' && !editing ? (
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

      {pagesSheet ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar el listado de páginas"
            tabIndex={-1}
            onClick={() => setPagesSheet(false)}
            className="absolute inset-0 cursor-default bg-black/35"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[72dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-bg p-3 pb-5">
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border-strong" aria-hidden="true" />
            <RailLegend />
            <div className="flex flex-col gap-1">
              {pages.map((item) => (
                <RailRow
                  key={item.page_number}
                  page={item}
                  active={item.page_number === page.page_number}
                  hits={search.hitsByPage.get(item.page_number) ?? 0}
                  onSelect={() => {
                    goToPage(item.page_number);
                    setPagesSheet(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {originalSheet ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-bg md:hidden">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <p className="text-[13px] font-semibold text-fg">Original</p>
            <p className="mono text-[11px] tabular-nums text-fg-3">página {page.page_number}</p>
            <button
              type="button"
              aria-label="Cerrar la imagen original"
              onClick={() => setOriginalSheet(false)}
              className="ml-auto grid size-11 place-items-center rounded-lg text-fg-2"
            >
              <X size={ICON.md} strokeWidth={STROKE} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {page.image_available ? (
              <PaperPreview page={page} zoom={1} maxWidth={520} />
            ) : (
              <MissingScan />
            )}
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lab-delete-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[#221507]/45 p-4"
        >
          <button
            type="button"
            aria-label="Cerrar sin eliminar"
            tabIndex={-1}
            onClick={() => setDeleteOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-bg p-5 shadow-lg">
            <p id="lab-delete-title" className="text-[15px] font-semibold text-fg">
              ¿Eliminar este manual?
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
              Se borrarán sus {manual.page_count} páginas y todo el texto leído. Esta acción no se
              puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-2.5">
              <button
                type="button"
                ref={cancelDeleteRef}
                onClick={() => setDeleteOpen(false)}
                className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-error px-3 text-[13px] font-semibold text-fg-inv hover:opacity-90"
              >
                <Trash2 size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" />
                Eliminar manual
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
