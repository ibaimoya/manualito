import {
  ChevronDown,
  ChevronUp,
  Highlighter,
  Image as ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { confidenceTone, pageStatus } from '@/features/manual/pageStatus';
import { labManual, LAB_BUSY_PROGRESS, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';
import '@fontsource-variable/literata';
import '@/features/manual/lab/lang-sheet.css';

/* V-F «La libreta»: todo el manual en un solo scroll con separadores de perforación,
   pestañas de estado en el borde derecho y el escaneo desplegable bajo cada hoja. */

const STROKE = 1.75;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

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

function highlightSearch(text: string, needle: string): ReactNode {
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
        className="rounded-[0.3em] bg-primary-100 px-0.5 text-primary-700 ring-1 ring-primary-300/60"
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
  const pages = manual.pages;
  const search = usePageSearch(pages);
  const [marks, setMarks] = useState(initialConfidence);
  const [openScans, setOpenScans] = useState<ReadonlySet<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [masOpen, setMasOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeDuda, setActiveDuda] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const blockRefs = useRef(new Map<number, HTMLElement>());
  const lineRefs = useRef(new Map<string, HTMLElement>());
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.pageNumber ?? '1',
          );
          setCurrentPage(pageNumber);
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
      setDeleteOpen(false);
      setMasOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (deleteOpen) cancelDeleteRef.current?.focus();
  }, [deleteOpen]);

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

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-6 py-2.5">
          <h1 className="min-w-0 truncate font-display text-[19px] font-extrabold tracking-tight text-fg">
            {manual.title ?? manual.game_name}
          </h1>
          <span className="mono hidden shrink-0 text-[11px] text-fg-3 sm:inline">
            hoja {currentPage} de {pages.length}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
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
                className="w-28 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none md:w-40"
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
              onClick={() => {
                setMarks((value) => !value);
                setActiveDuda(null);
              }}
              className={cn(
                'lang-lift inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium',
                marks ? 'bg-primary-100 text-primary-700' : 'text-fg-2 hover:text-fg',
                (!hasConfidence || busy) && 'opacity-40',
              )}
            >
              <Highlighter size={14} strokeWidth={STROKE} aria-hidden="true" />
              Dudas
            </button>
            {marks && dudasGlobal.length > 0 ? (
              <span className="flex items-center">
                <button
                  type="button"
                  aria-label="Duda anterior"
                  onClick={() => jumpToDuda(-1)}
                  className="grid size-8 place-items-center rounded-md text-fg-2 hover:text-fg"
                >
                  <ChevronUp size={14} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  aria-label="Duda siguiente"
                  onClick={() => jumpToDuda(1)}
                  className="grid size-8 place-items-center rounded-md text-fg-2 hover:text-fg"
                >
                  <ChevronDown size={14} strokeWidth={STROKE} />
                </button>
              </span>
            ) : null}
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
        className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1.5 md:flex"
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
                'group flex h-9 w-14 items-center gap-1.5 rounded-l-lg border border-r-0 border-border py-1 pl-1.5 shadow-xs transition-[translate] duration-150 ease-[var(--ease-mn)]',
                active ? 'translate-x-0' : 'translate-x-7 hover:translate-x-4',
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
            </button>
          );
        })}
      </nav>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-24">
        {pages.map((item, blockIndex) => {
          const itemSt = pageStatus(item);
          const scanOpen = openScans.has(item.page_number);
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
                <div className="flex items-center gap-3 py-5" aria-hidden="true">
                  <span className="h-0 flex-1 border-t border-dashed border-border-strong" />
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
                {item.image_available ? (
                  <button
                    type="button"
                    onClick={() => toggleScan(item.page_number)}
                    aria-expanded={scanOpen}
                    className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-fg-2 hover:text-fg"
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
              </div>

              <AnimatePresence initial={false}>
                {scanOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <div
                      className="relative mb-4 h-44 overflow-hidden rounded-xl border border-border shadow-xs"
                      style={{ background: 'var(--lab-paper)' }}
                    >
                      <div className="absolute inset-x-5 top-4 space-y-2" aria-hidden="true">
                        {[92, 78, 85, 60].map((width, row) => (
                          <div
                            key={row}
                            className="h-1.5 rounded-sm bg-surface-2"
                            style={{ width: `${width}%` }}
                          />
                        ))}
                      </div>
                      <p className="mono absolute inset-x-0 bottom-2.5 text-center text-[10.5px] text-fg-3">
                        el escaneo real aparece aquí
                      </p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {itemSt.key === 'failed' ? (
                <div className="flex items-center gap-4 rounded-xl border border-border px-5 py-4 shadow-xs" style={{ background: 'var(--lab-paper)' }}>
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
                <div className="flex items-center gap-3 rounded-xl border border-border px-5 py-4 shadow-xs" style={{ background: 'var(--lab-paper)' }}>
                  <Meeple className="lang-bob size-9 shrink-0 text-primary" />
                  <p className="text-[13.5px] font-medium text-fg-2">Aún leyendo esta hoja…</p>
                </div>
              ) : null}

              {itemSt.key !== 'failed' && itemSt.key !== 'processing' ? (
                <div className="space-y-3.5 pr-10">
                  {item.ocr_lines.map((line, index) => {
                    const tone =
                      line.confidence == null ? null : confidenceTone(line.confidence);
                    const problem =
                      marks && (tone?.tone === 'warning' || tone?.tone === 'error');
                    const pct =
                      line.confidence == null ? null : Math.round(line.confidence * 100);
                    const lineKey = `${item.page_number}:${index}`;
                    return (
                      <div
                        key={index}
                        className="relative"
                        ref={(node) => {
                          if (node) lineRefs.current.set(lineKey, node);
                          else lineRefs.current.delete(lineKey);
                        }}
                      >
                        <p className="lang-reading text-fg" lang="es">
                          {problem ? (
                            <span
                              style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
                              className={cn(
                                'lang-hl lang-hl-draw',
                                tone?.tone === 'error' ? 'lang-hl-baja' : 'lang-hl-media',
                                activeDuda === lineKey &&
                                  'outline outline-2 outline-offset-2 outline-primary/60',
                              )}
                            >
                              {highlightSearch(line.text, search.needle)}
                            </span>
                          ) : (
                            highlightSearch(line.text, search.needle)
                          )}
                        </p>
                        {problem && pct != null ? (
                          <span
                            className={cn(
                              'mono absolute -right-10 top-1 text-[11px] tabular-nums',
                              tone?.tone === 'error'
                                ? 'font-semibold text-error'
                                : 'font-medium text-warning',
                            )}
                          >
                            {pct}%
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </main>

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
