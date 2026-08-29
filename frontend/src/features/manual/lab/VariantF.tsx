import {
  Check,
  ChevronDown,
  ChevronUp,
  Highlighter,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { confidenceTone, pageStatus } from '@/features/manual/pageStatus';
import { labManual, LAB_BUSY_PROGRESS, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';
import '@fontsource-variable/literata';
import '@/features/manual/lab/lang-sheet.css';

/* La libreta, fusión N3: chasis de scroll continuo + índice con nombres (del taller) +
   bolsillo móvil que morfa (del atril) + rotulador continuo con el detalle en el title
   (el % crudo muere en la vista) + pestañas ancladas al borde de la página, sin animación
   (chrome de alta frecuencia). Spec en bitácora N3. */

const STROKE = 1.75;
const SPRING = { type: 'spring', duration: 0.5, bounce: 0.2 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type DockMode = 'closed' | 'buscar' | 'dudas' | 'hojas' | 'mas';

const STATUS_WORD: Record<string, string> = {
  ok: 'Bien leída',
  low: 'Con dudas',
  edited: 'Editada',
  duplicate: 'Duplicada',
  processing: 'Aún leyendo',
  failed: 'No se pudo leer',
};

const TAB_COLOR: Record<string, string> = {
  success: 'var(--m-success)',
  warning: 'var(--m-warning)',
  accent: 'var(--m-accent-500)',
  error: 'var(--m-error)',
};

function tabColor(st: { key: string; tone: string }): string {
  if (st.key === 'processing') return 'var(--m-text-3)';
  return TAB_COLOR[st.tone] ?? 'var(--m-text-3)';
}

function pageTitle(item: { ocr_lines: readonly { text: string }[] }): string {
  const first = item.ocr_lines[0]?.text.trim() ?? '';
  if (first.length === 0) return 'Sin texto todavía';
  const heading = /^[^a-zá-úü]{3,40}/.exec(first)?.[0]?.trim();
  return heading && heading.length >= 3 ? heading : first;
}

function Meeple({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M32 6c-6 0-10 4.6-10 10 0 2.8 1.1 5.2 3 7-6.6 1.9-12 6.3-15 12-1.9 3.7.8 8 5 8h7c1.1 0 2 .9 2 2 0 4.6-1.9 8.8-5 11.8-2.4 2.4-.7 6.2 2.7 6.2h20.6c3.4 0 5.1-3.8 2.7-6.2-3.1-3-5-7.2-5-11.8 0-1.1.9-2 2-2h7c4.2 0 6.9-4.3 5-8-3-5.7-8.4-10.1-15-12 1.9-1.8 3-4.2 3-7 0-5.4-4-10-10-10z"
      />
    </svg>
  );
}

function DockTool({
  label,
  active,
  disabled,
  onClick,
  children,
}: Readonly<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2',
        active ? 'bg-primary-100 text-primary-700' : 'text-fg-2',
        disabled && 'opacity-40',
      )}
    >
      {children}
      <span className="text-[10.5px] font-medium leading-none">{label}</span>
    </button>
  );
}

function highlightSearch(text: string, needle: string, activeLine: boolean): ReactNode {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={`${at}-m`}
        className={cn(
          'rounded-[0.3em] px-0.5',
          activeLine
            ? 'bg-primary font-semibold text-fg-inv'
            : 'bg-primary-100 text-primary-700 ring-1 ring-primary-300/60',
        )}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return parts;
}

export function VariantF({
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
  const reduce = useReducedMotion();
  const manual = labManual(escenario);
  const [overrides, setOverrides] = useState<ReadonlyMap<number, string>>(new Map());
  const pages = useMemo(
    () =>
      manual.pages.map((item) => {
        const text = overrides.get(item.page_number);
        if (text == null) return item;
        return {
          ...item,
          ocr_lines: text
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => ({ text: line, confidence: null })),
        };
      }),
    [manual.pages, overrides],
  );
  const search = usePageSearch(pages);
  const [marks, setMarks] = useState(initialConfidence);
  const [drawCascade, setDrawCascade] = useState(initialConfidence);
  const everMarkedRef = useRef(initialConfidence);
  const [openScans, setOpenScans] = useState<ReadonlySet<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dock, setDock] = useState<DockMode>('closed');
  const [masOpen, setMasOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeDuda, setActiveDuda] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const blockRefs = useRef(new Map<number, HTMLElement>());
  const lineRefs = useRef(new Map<string, HTMLElement>());
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  const dockSearchRef = useRef<HTMLInputElement | null>(null);
  if (!seeded && seededQuery) {
    setSeeded(true);
    search.search(seededQuery);
  }

  const busy = manual.status === 'indexing';
  const hasConfidence = pages.some((item) =>
    item.ocr_lines.some((line) => line.confidence != null),
  );
  const dudasGlobal = pages.flatMap((item) =>
    item.ocr_lines
      .map((line, index) => ({ line, index, pageNumber: item.page_number }))
      .filter(({ line }) => {
        if (line.confidence == null) return false;
        const tone = confidenceTone(line.confidence).tone;
        return tone === 'warning' || tone === 'error';
      })
      .map(({ index, pageNumber }) => `${pageNumber}:${index}`),
  );
  const editingSource =
    editingPage === null
      ? ''
      : (pages.find((item) => item.page_number === editingPage)?.ocr_lines ?? [])
          .map((line) => line.text)
          .join('\n');
  const dirty = editingPage !== null && draft !== editingSource;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setCurrentPage(Number((entry.target as HTMLElement).dataset.pageNumber ?? '1'));
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    for (const node of blockRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (editingPage !== null) {
        if (dirty && !confirmDiscard) setConfirmDiscard(true);
        else if (!dirty) stopEditing();
        return;
      }
      setDeleteOpen(false);
      setMasOpen(false);
      setDock('closed');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (deleteOpen) cancelDeleteRef.current?.focus();
  }, [deleteOpen]);

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  useEffect(() => {
    if (dock === 'buscar') dockSearchRef.current?.focus();
  }, [dock]);

  function toggleMarks(): void {
    setMarks((value) => {
      const next = !value;
      if (next) {
        setDrawCascade(!everMarkedRef.current);
        everMarkedRef.current = true;
      }
      return next;
    });
    setActiveDuda(null);
  }

  function scrollToPage(pageNumber: number): void {
    blockRefs.current.get(pageNumber)?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function jumpToMatch(delta: 1 | -1): void {
    const match = search.step(delta);
    if (match) {
      lineRefs.current
        .get(`${match.pageNumber}:${match.indexInPage}`)
        ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }
  }

  function jumpToDuda(delta: 1 | -1): void {
    if (dudasGlobal.length === 0) return;
    const at = activeDuda === null ? -1 : dudasGlobal.indexOf(activeDuda);
    const next = dudasGlobal[(at + delta + dudasGlobal.length) % dudasGlobal.length]!;
    setActiveDuda(next);
    lineRefs.current
      .get(next)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }

  function toggleScan(pageNumber: number): void {
    setOpenScans((current) => {
      const next = new Set(current);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  }

  function startEditing(pageNumber: number): void {
    const item = pages.find((entry) => entry.page_number === pageNumber);
    setDraft((item?.ocr_lines ?? []).map((line) => line.text).join('\n'));
    setConfirmDiscard(false);
    setEditingPage(pageNumber);
  }

  function stopEditing(): void {
    setEditingPage(null);
    setConfirmDiscard(false);
  }

  function saveEditing(): void {
    if (editingPage !== null && dirty) {
      setOverrides((current) => new Map(current).set(editingPage, draft));
    }
    stopEditing();
  }

  function effectiveStatus(item: (typeof pages)[number]): { key: string; tone: string; label?: string } {
    if (overrides.has(item.page_number)) return { key: 'edited', tone: 'accent' };
    return pageStatus(item);
  }

  const dudasLabel =
    activeDuda !== null && dudasGlobal.includes(activeDuda)
      ? `Duda ${dudasGlobal.indexOf(activeDuda) + 1} de ${dudasGlobal.length}`
      : `${dudasGlobal.length} dudas`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-6 py-2.5">
          <h1 className="min-w-0 truncate font-display text-[19px] font-extrabold tracking-tight text-fg">
            {manual.title ?? manual.game_name}
          </h1>
          <span
            className={cn(
              'mono shrink-0 text-[11px] text-fg-3',
              search.query && 'hidden xl:inline',
            )}
          >
            hoja {currentPage} de {pages.length}
          </span>
          <div className="ml-auto hidden shrink-0 items-center gap-1 md:flex">
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border-strong pl-2 pr-1 focus-within:border-primary/60">
              <Search
                size={13}
                strokeWidth={STROKE}
                className="shrink-0 text-fg-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search.query}
                onChange={(event) => search.search(event.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar en el texto del manual"
                className="w-40 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {search.query ? (
                <span className="flex shrink-0 items-center">
                  <span className="mono w-12 text-right text-[11.5px] tabular-nums text-fg-2">
                    {search.totalHits === 0
                      ? 'nada'
                      : `${search.activePosition}/${search.totalHits}`}
                  </span>
                  <button
                    type="button"
                    aria-label="Coincidencia anterior"
                    disabled={search.totalHits === 0}
                    onClick={() => jumpToMatch(-1)}
                    className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronUp size={13} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    aria-label="Coincidencia siguiente"
                    disabled={search.totalHits === 0}
                    onClick={() => jumpToMatch(1)}
                    className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronDown size={13} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    aria-label="Borrar búsqueda"
                    onClick={() => search.search('')}
                    className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg"
                  >
                    <X size={13} strokeWidth={STROKE} />
                  </button>
                </span>
              ) : null}
            </div>
            <button
              type="button"
              title="Marcar las dudas de lectura"
              aria-pressed={marks}
              disabled={!hasConfidence || busy}
              onClick={toggleMarks}
              className={cn(
                'lang-lift inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium',
                marks ? 'bg-primary-100 text-primary-700' : 'text-fg-2 hover:text-fg',
                (!hasConfidence || busy) && 'opacity-40',
              )}
            >
              <Highlighter size={14} strokeWidth={STROKE} aria-hidden="true" />
              Dudas
            </button>
            <span
              className={cn(
                'flex items-center',
                (!marks || dudasGlobal.length === 0) && 'invisible',
              )}
              aria-hidden={!marks || dudasGlobal.length === 0}
            >
              <span
                className="mono w-24 text-right text-[11.5px] tabular-nums text-fg-2"
                aria-live="polite"
              >
                {dudasLabel}
              </span>
              <button
                type="button"
                aria-label="Duda anterior"
                tabIndex={marks && dudasGlobal.length > 0 ? 0 : -1}
                onClick={() => jumpToDuda(-1)}
                className="grid size-8 place-items-center rounded-md text-fg-2 hover:text-fg"
              >
                <ChevronUp size={14} strokeWidth={STROKE} />
              </button>
              <button
                type="button"
                aria-label="Duda siguiente"
                tabIndex={marks && dudasGlobal.length > 0 ? 0 : -1}
                onClick={() => jumpToDuda(1)}
                className="grid size-8 place-items-center rounded-md text-fg-2 hover:text-fg"
              >
                <ChevronDown size={14} strokeWidth={STROKE} />
              </button>
            </span>
            <div className="relative">
              <button
                type="button"
                title="Acciones del manual"
                aria-pressed={masOpen}
                onClick={() => setMasOpen((value) => !value)}
                className="grid size-8 place-items-center rounded-lg text-fg-2 hover:text-fg"
              >
                <MoreHorizontal size={15} strokeWidth={STROKE} aria-hidden="true" />
              </button>
              {masOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar el menú"
                    tabIndex={-1}
                    onClick={() => setMasOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 top-10 z-20 w-60 rounded-xl border border-border bg-card p-1.5 shadow-md">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setMasOpen(false)}
                      className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-fg hover:bg-surface disabled:opacity-45"
                    >
                      <RotateCw size={14} strokeWidth={STROKE} aria-hidden="true" />
                      Leer de nuevo todo el manual
                    </button>
                    <div className="mx-2 my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setMasOpen(false);
                        setDeleteOpen(true);
                      }}
                      className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-error hover:bg-error-bg"
                    >
                      <Trash2 size={14} strokeWidth={STROKE} aria-hidden="true" />
                      Eliminar manual…
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {busy ? (
          <div className="mn-banner-in border-t border-border bg-surface">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-6 py-1.5">
              <LoaderCircle
                size={13}
                strokeWidth={STROKE}
                className="animate-spin text-primary"
                aria-hidden="true"
              />
              <p className="text-[12px] font-medium text-fg-2">
                Leyendo el manual · {LAB_BUSY_PROGRESS.completed_pages} de{' '}
                {LAB_BUSY_PROGRESS.page_count} hojas
              </p>
            </div>
          </div>
        ) : null}
      </header>

      <nav
        aria-label="Pestañas de hojas"
        className="fixed top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-1 xl:flex"
        style={{ left: 'calc(50% + 22.5rem)' }}
      >
        {pages.map((item) => {
          const itemSt = pageStatus(item);
          const active = item.page_number === currentPage;
          return (
            <button
              key={item.page_number}
              type="button"
              title={`Hoja ${item.page_number} · ${STATUS_WORD[itemSt.key] ?? itemSt.label}`}
              onClick={() => scrollToPage(item.page_number)}
              className={cn(
                'group flex h-9 items-center gap-1.5 overflow-hidden rounded-r-lg border border-l-0 border-border py-1 pl-1.5 pr-2 shadow-xs',
                active ? 'w-44' : 'w-9 hover:w-44',
              )}
              style={{ background: 'var(--lab-paper)' }}
            >
              <span
                aria-hidden="true"
                className="h-full w-1.5 shrink-0 rounded-full"
                style={{ background: tabColor(itemSt) }}
              />
              <span
                className={cn(
                  'text-[11.5px] font-bold tabular-nums',
                  active ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2',
                )}
              >
                {item.page_number}
              </span>
              <span
                className={cn(
                  'min-w-0 truncate text-[11px]',
                  active ? 'text-fg-2' : 'text-fg-3',
                )}
              >
                {pageTitle(item)}
              </span>
            </button>
          );
        })}
      </nav>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-32 md:pb-24">
        {pages.map((item, blockIndex) => {
          const itemSt = effectiveStatus(item);
          const scanOpen = openScans.has(item.page_number);
          const isEditing = editingPage === item.page_number;
          const canEdit =
            !busy && itemSt.key !== 'failed' && itemSt.key !== 'processing';
          return (
            <section
              key={item.page_number}
              data-page-number={item.page_number}
              ref={(node) => {
                if (node) blockRefs.current.set(item.page_number, node);
                else blockRefs.current.delete(item.page_number);
              }}
              aria-label={`Hoja ${item.page_number}`}
              className="scroll-mt-16"
            >
              {blockIndex > 0 ? (
                <div className="py-5" aria-hidden="true">
                  <span className="block h-0 border-t border-dashed border-border-strong" />
                </div>
              ) : (
                <div className="pt-6" />
              )}
              <div className="flex items-baseline gap-2 pb-3">
                <span className="mono text-[11.5px] font-semibold tabular-nums text-fg-2">
                  hoja {item.page_number}
                </span>
                <span className="text-[12px] text-fg-3">
                  {STATUS_WORD[itemSt.key] ?? itemSt.label}
                </span>
                <span className="ml-auto flex items-center gap-0.5">
                  {canEdit && !isEditing ? (
                    <button
                      type="button"
                      title="Editar el texto de esta hoja"
                      onClick={() => startEditing(item.page_number)}
                      disabled={editingPage !== null}
                      className="grid size-11 place-items-center rounded-md text-fg-3 hover:text-fg disabled:opacity-40 md:size-7"
                    >
                      <Pencil size={13} strokeWidth={STROKE} />
                    </button>
                  ) : null}
                  {item.image_available && !isEditing ? (
                    <button
                      type="button"
                      onClick={() => toggleScan(item.page_number)}
                      aria-expanded={scanOpen}
                      className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-fg-2 hover:text-fg md:h-7"
                    >
                      <ImageIcon size={13} strokeWidth={STROKE} aria-hidden="true" />
                      {scanOpen ? 'Ocultar el escaneo' : 'Ver el escaneo'}
                      <motion.span
                        animate={{ rotate: scanOpen ? 180 : 0 }}
                        transition={{ duration: 0.2, ease: EASE_OUT }}
                        className="inline-flex"
                      >
                        <ChevronDown size={13} strokeWidth={STROKE} aria-hidden="true" />
                      </motion.span>
                    </button>
                  ) : null}
                </span>
              </div>

              <div className={cn(scanOpen && !isEditing && 'lg:flex lg:gap-6')}>
                <div className="min-w-0 flex-1">
                  {itemSt.key === 'failed' ? (
                    <div
                      className="flex items-center gap-4 rounded-xl border border-border px-5 py-4 shadow-xs"
                      style={{ background: 'var(--lab-paper)' }}
                    >
                      <Meeple className="size-9 shrink-0 -rotate-6 text-fg-3" />
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-fg">
                          No pudimos leer esta hoja
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="lang-lift inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[12.5px] font-semibold text-fg-inv"
                          >
                            <Upload size={13} strokeWidth={STROKE} aria-hidden="true" />
                            Sustituir la imagen
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-[12.5px] font-medium text-fg"
                          >
                            <RotateCw size={13} strokeWidth={STROKE} aria-hidden="true" />
                            Reintentar la lectura
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {itemSt.key === 'processing' ? (
                    <div
                      className="flex items-center gap-3 rounded-xl border border-border px-5 py-4 shadow-xs"
                      style={{ background: 'var(--lab-paper)' }}
                    >
                      <Meeple className="lang-bob size-9 shrink-0 text-primary" />
                      <p className="text-[13.5px] font-medium text-fg-2">
                        Aún leyendo esta hoja…
                      </p>
                    </div>
                  ) : null}

                  {isEditing ? (
                    <div>
                      <textarea
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value);
                          setConfirmDiscard(false);
                        }}
                        aria-label={`Editar el texto de la hoja ${item.page_number}`}
                        rows={Math.max(8, draft.split('\n').length + 1)}
                        className="lang-reading w-full resize-none rounded-lg border border-border-strong bg-transparent px-3.5 py-3 text-fg outline-none focus:border-primary"
                      />
                      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                        {confirmDiscard ? (
                          <>
                            <p className="text-[13px] font-medium text-fg">
                              ¿Descartar los cambios?
                            </p>
                            <button
                              type="button"
                              onClick={stopEditing}
                              className="inline-flex h-8 items-center rounded-lg bg-error px-3 text-[13px] font-semibold text-fg-inv"
                            >
                              Descartar
                            </button>
                            <button
                              type="button"
                              ref={keepEditingRef}
                              onClick={() => setConfirmDiscard(false)}
                              className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg"
                            >
                              Seguir editando
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={!dirty}
                              onClick={saveEditing}
                              className="lang-lift inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-fg-inv disabled:opacity-45"
                            >
                              <Check size={14} strokeWidth={STROKE} aria-hidden="true" />
                              Guardar cambios
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                dirty ? setConfirmDiscard(true) : stopEditing()
                              }
                              className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg"
                            >
                              Cancelar
                            </button>
                            {dirty ? (
                              <span className="text-[12px] text-fg-3">
                                Cambios sin guardar
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}

                        {itemSt.key !== 'failed' && itemSt.key !== 'processing' && !isEditing ? (
                    <div className="space-y-3.5">
                      {item.ocr_lines.map((line, index) => {
                        const tone =
                          line.confidence == null ? null : confidenceTone(line.confidence);
                        const problem =
                          marks && (tone?.tone === 'warning' || tone?.tone === 'error');
                        const pct =
                          line.confidence == null
                            ? null
                            : Math.round(line.confidence * 100);
                        const lineKey = `${item.page_number}:${index}`;
                        return (
                          <div
                            key={index}
                            ref={(node) => {
                              if (node) lineRefs.current.set(lineKey, node);
                              else lineRefs.current.delete(lineKey);
                            }}
                          >
                            <p className="lang-reading text-fg" lang="es">
                              {problem ? (
                                <span
                                  title={`Lectura con dudas · ${pct}% de confianza`}
                                  style={
                                    drawCascade
                                      ? {
                                          animationDelay: `${Math.min(index * 40, 300)}ms`,
                                        }
                                      : undefined
                                  }
                                  className={cn(
                                    'lang-hl',
                                    drawCascade && 'lang-hl-draw',
                                    tone?.tone === 'error'
                                      ? 'lang-hl-baja'
                                      : 'lang-hl-media',
                                    activeDuda === lineKey &&
                                      'outline outline-2 outline-offset-2 outline-primary/60',
                                  )}
                                >
                                  {highlightSearch(line.text, search.needle, search.active !== null && search.active.pageNumber === item.page_number && search.active.indexInPage === index)}
                                </span>
                              ) : (
                                highlightSearch(line.text, search.needle, search.active !== null && search.active.pageNumber === item.page_number && search.active.indexInPage === index)
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <AnimatePresence initial={false}>
                  {scanOpen && !isEditing ? (
                    <motion.aside
                      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      aria-label={`Escaneo de la hoja ${item.page_number}`}
                      className="mt-4 lg:mt-0 lg:w-64 lg:shrink-0"
                    >
                      <div className="lg:sticky lg:top-16">
                        <div
                          className="relative h-44 overflow-hidden rounded-sm border border-border-strong shadow-xs lg:h-auto lg:aspect-[3/4]"
                          style={{ background: '#f3ead9', rotate: '-0.4deg' }}
                        >
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 px-4 py-3.5"
                            style={{ filter: 'contrast(0.92) sepia(0.12)' }}
                          >
                            {manual.pages
                              .find((entry) => entry.page_number === item.page_number)
                              ?.ocr_lines.map((line, row) => (
                                <p
                                  key={row}
                                  className="lang-reading pb-1"
                                  style={{ fontSize: 9, lineHeight: 1.5, color: '#57493a' }}
                                >
                                  {line.text}
                                </p>
                              ))}
                          </div>
                        </div>
                        <p className="mt-1.5 text-center text-[11px] text-fg-3">
                          Original · hoja {item.page_number}
                        </p>
                      </div>
                    </motion.aside>
                  ) : null}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </main>

      <div
        data-film-ignore="dock"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 md:hidden"
      >
        <motion.div
          layout
          transition={reduce ? { duration: 0.15 } : SPRING}
          style={{ borderRadius: 20, transformOrigin: 'bottom center' }}
          className="pointer-events-auto overflow-hidden border border-border-strong bg-card shadow-lg"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {dock === 'closed' ? (
              <motion.div
                key="closed"
                data-film-ignore="dock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 px-2 py-1.5"
              >
                <DockTool label="Buscar" onClick={() => setDock('buscar')}>
                  <Search size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool
                  label="Dudas"
                  active={marks}
                  disabled={!hasConfidence || busy}
                  onClick={() => {
                    if (!marks) toggleMarks();
                    setDock('dudas');
                  }}
                >
                  <Highlighter size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool label="Hojas" onClick={() => setDock('hojas')}>
                  <Layers3 size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool label="Más" onClick={() => setDock('mas')}>
                  <MoreHorizontal size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
              </motion.div>
            ) : null}

            {dock === 'buscar' ? (
              <motion.div
                key="buscar"
                data-film-ignore="dock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 px-2.5 py-2"
              >
                <Search
                  size={15}
                  strokeWidth={STROKE}
                  className="shrink-0 text-fg-3"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  ref={dockSearchRef}
                  value={search.query}
                  onChange={(event) => search.search(event.target.value)}
                  placeholder="Buscar en el manual…"
                  aria-label="Buscar en el texto del manual"
                  className="w-40 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
                />
                <span className="mono w-10 shrink-0 text-right text-[11.5px] tabular-nums text-fg-2">
                  {search.query
                    ? search.totalHits === 0
                      ? 'nada'
                      : `${search.activePosition}/${search.totalHits}`
                    : ''}
                </span>
                <button
                  type="button"
                  aria-label="Coincidencia anterior"
                  disabled={search.totalHits === 0}
                  onClick={() => jumpToMatch(-1)}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 disabled:opacity-40"
                >
                  <ChevronUp size={16} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Coincidencia siguiente"
                  disabled={search.totalHits === 0}
                  onClick={() => jumpToMatch(1)}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 disabled:opacity-40"
                >
                  <ChevronDown size={16} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Cerrar la búsqueda"
                  onClick={() => setDock('closed')}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-3"
                >
                  <X size={16} strokeWidth={STROKE} />
                </button>
              </motion.div>
            ) : null}

            {dock === 'dudas' ? (
              <motion.div
                key="dudas"
                data-film-ignore="dock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 px-2.5 py-2"
              >
                <Highlighter
                  size={15}
                  strokeWidth={STROKE}
                  className="shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span className="text-[13px] font-medium text-fg" aria-live="polite">
                  {dudasGlobal.length === 0 ? 'Sin dudas de lectura' : dudasLabel}
                </span>
                <button
                  type="button"
                  aria-label="Duda anterior"
                  disabled={dudasGlobal.length === 0}
                  onClick={() => jumpToDuda(-1)}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 disabled:opacity-40"
                >
                  <ChevronUp size={16} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Duda siguiente"
                  disabled={dudasGlobal.length === 0}
                  onClick={() => jumpToDuda(1)}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 disabled:opacity-40"
                >
                  <ChevronDown size={16} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Apagar las dudas y cerrar"
                  onClick={() => {
                    setMarks(false);
                    setActiveDuda(null);
                    setDock('closed');
                  }}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-3"
                >
                  <X size={16} strokeWidth={STROKE} />
                </button>
              </motion.div>
            ) : null}

            {dock === 'hojas' ? (
              <motion.div
                key="hojas"
                data-film-ignore="dock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-[19rem] p-2"
              >
                <div className="flex flex-col gap-0.5">
                  {pages.map((item) => {
                    const itemSt = pageStatus(item);
                    return (
                      <button
                        key={item.page_number}
                        type="button"
                        onClick={() => {
                          scrollToPage(item.page_number);
                          setDock('closed');
                        }}
                        className={cn(
                          'flex h-11 items-center gap-2 rounded-lg px-2.5 text-left',
                          item.page_number === currentPage
                            ? 'bg-primary-100 text-primary-700'
                            : 'text-fg',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="h-6 w-1 shrink-0 rounded-full"
                          style={{ background: tabColor(itemSt) }}
                        />
                        <span className="text-[13px] font-bold tabular-nums">
                          {item.page_number}
                        </span>
                        <span className="min-w-0 truncate text-[12px] text-fg-2">
                          {pageTitle(item)}
                        </span>
                        <span className="ml-auto shrink-0 text-[10.5px] text-fg-2">
                          {STATUS_WORD[itemSt.key] ?? itemSt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setDock('closed')}
                  className="mt-1 flex h-9 w-full items-center justify-center rounded-lg text-[12.5px] font-medium text-fg-3"
                >
                  Cerrar
                </button>
              </motion.div>
            ) : null}

            {dock === 'mas' ? (
              <motion.div
                key="mas"
                data-film-ignore="dock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="w-64 p-2"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDock('closed')}
                  className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-fg disabled:opacity-45"
                >
                  <RotateCw size={15} strokeWidth={STROKE} aria-hidden="true" />
                  Leer de nuevo todo el manual
                </button>
                <div className="mx-2 my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    setDock('closed');
                    setDeleteOpen(true);
                  }}
                  className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-error"
                >
                  <Trash2 size={15} strokeWidth={STROKE} aria-hidden="true" />
                  Eliminar manual…
                </button>
                <button
                  type="button"
                  onClick={() => setDock('closed')}
                  className="mt-1 flex h-9 w-full items-center justify-center rounded-lg text-[12.5px] font-medium text-fg-3"
                >
                  Cerrar
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>

      <AnimatePresence>
        {deleteOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="libreta-delete-title"
            className="fixed inset-0 z-50 grid place-items-center bg-[#221507]/45 p-4"
          >
            <button
              type="button"
              aria-label="Cerrar sin eliminar"
              tabIndex={-1}
              onClick={() => setDeleteOpen(false)}
              className="absolute inset-0 cursor-default"
            />
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="relative w-full max-w-sm rounded-2xl border border-border bg-bg p-5 shadow-lg"
            >
              <p id="libreta-delete-title" className="text-[15px] font-semibold text-fg">
                ¿Eliminar este manual?
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
                Se borrarán sus {manual.page_count} páginas y todo el texto leído. Esta acción
                no se puede deshacer.
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
                  className="lang-lift inline-flex h-8 items-center gap-1.5 rounded-lg bg-error px-3 text-[13px] font-semibold text-fg-inv"
                >
                  <Trash2 size={14} strokeWidth={STROKE} aria-hidden="true" />
                  Eliminar manual
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
