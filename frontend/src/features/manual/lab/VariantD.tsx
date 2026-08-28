import {
  AlertTriangle,
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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { confidenceTone, pageStatus } from '@/features/manual/pageStatus';
import { labManual, LAB_BUSY_PROGRESS, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';
import '@fontsource-variable/literata';
import '@/features/manual/lab/lang-sheet.css';

/* V-D «El atril»: una sola hoja en escena sobre la mesa, pila de vecinas asomando,
   y un bolsillo flotante que morfa en la herramienta pulsada (spec en la bitácora N2). */

const STROKE = 1.75;
const SPRING = { type: 'spring', duration: 0.5, bounce: 0.2 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type DockMode = 'closed' | 'buscar' | 'dudas' | 'editar' | 'hojas' | 'mas';

const STATUS_WORD: Record<string, string> = {
  ok: 'Bien leída',
  low: 'Con dudas',
  edited: 'Editada',
  duplicate: 'Duplicada',
  processing: 'Aún leyendo',
  failed: 'No se pudo leer',
};

const STATUS_TONE_CLASS: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-accent',
  error: 'text-error',
};

function statusDot(st: { key: string; tone: string }): string {
  if (st.key === 'processing') return 'bg-fg-3';
  return (
    { success: 'bg-success', warning: 'bg-warning', accent: 'bg-accent', error: 'bg-error' }[
      st.tone
    ] ?? 'bg-fg-3'
  );
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
        'lang-lift flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-3',
        active ? 'bg-primary-100 text-primary-700' : 'text-fg-2 hover:text-fg',
        disabled && 'opacity-40',
      )}
    >
      {children}
      <span className="text-[10.5px] font-medium leading-none">{label}</span>
    </button>
  );
}

function TrayFrame({
  onClose,
  children,
}: Readonly<{ onClose: () => void; children: ReactNode }>) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {children}
      <button
        type="button"
        aria-label="Cerrar la herramienta"
        onClick={onClose}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 hover:text-fg"
      >
        <X size={15} strokeWidth={STROKE} />
      </button>
    </div>
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

export function VariantD({
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
  const [activePage, setActivePage] = useState(initialPage);
  const [direction, setDirection] = useState(0);
  const [dock, setDock] = useState<DockMode>(initialConfidence ? 'dudas' : 'closed');
  const [marks, setMarks] = useState(initialConfidence);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeDuda, setActiveDuda] = useState<number | null>(null);
  const [seeded, setSeeded] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  if (!seeded && seededQuery) {
    setSeeded(true);
    search.search(seededQuery);
    setDock('buscar');
  }

  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const st = pageStatus(page);
  const busy = manual.status === 'indexing';
  const pageText = page.ocr_lines.map((line) => line.text).join('\n');
  const dirty = editing && draft !== pageText;
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

  const spring = reduce ? { duration: 0.15 } : SPRING;

  function goToPage(pageNumber: number, dir: number): void {
    if (editing) return;
    if (pageNumber < 1 || pageNumber > pages.length || pageNumber === activePage) return;
    setDirection(dir);
    setActivePage(pageNumber);
    setActiveDuda(null);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (event.key === 'Escape') setDock('closed');
        return;
      }
      if (event.key === 'Escape') {
        setDeleteOpen(false);
        setDock('closed');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!deleteOpen) return;
    cancelDeleteRef.current?.focus();
  }, [deleteOpen]);

  useEffect(() => {
    if (dock === 'buscar') searchInputRef.current?.focus();
  }, [dock]);

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  function openTool(mode: DockMode): void {
    setDock((current) => (current === mode ? 'closed' : mode));
    if (mode === 'dudas') setMarks((value) => (dock === 'dudas' ? value : true));
  }

  function jumpToMatch(delta: 1 | -1): void {
    const match = search.step(delta);
    if (match && match.pageNumber !== activePage) {
      goToPage(match.pageNumber, match.pageNumber > activePage ? 1 : -1);
    }
  }

  function jumpToDuda(delta: 1 | -1): void {
    if (dudas.length === 0) return;
    const at = activeDuda === null ? -1 : dudas.indexOf(activeDuda);
    setActiveDuda(dudas[(at + delta + dudas.length) % dudas.length]!);
  }

  function startEditing(): void {
    setDraft(pageText);
    setConfirmDiscard(false);
    setEditing(true);
    setDock('editar');
    setOriginalOpen(false);
  }

  function stopEditing(): void {
    setEditing(false);
    setConfirmDiscard(false);
    setDock('closed');
  }

  const prevPage = pages.find((item) => item.page_number === activePage - 1);
  const nextPage = pages.find((item) => item.page_number === activePage + 1);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-bg">
      <header className="mx-auto flex w-full max-w-[50rem] items-baseline gap-3 px-6 pb-2 pt-6">
        <h1 className="min-w-0 truncate font-display text-[26px] font-extrabold tracking-tight text-fg">
          {manual.title ?? manual.game_name}
        </h1>
        <span className="mono shrink-0 text-[11.5px] text-fg-3">
          PDF · {manual.page_count} páginas
        </span>
        {busy ? (
          <span className="mn-banner-in ml-auto inline-flex shrink-0 items-center gap-2 text-[12.5px] font-medium text-fg-2">
            <LoaderCircle
              size={14}
              strokeWidth={STROKE}
              className="animate-spin text-primary"
              aria-hidden="true"
            />
            Leyendo el manual · {LAB_BUSY_PROGRESS.completed_pages} de{' '}
            {LAB_BUSY_PROGRESS.page_count}
          </span>
        ) : null}
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 items-start justify-center px-6 pb-36 pt-4">
        <div className={cn('flex w-full justify-center gap-5', originalOpen && 'items-start')}>
          <motion.div layout transition={spring} className="relative w-full max-w-[46rem]">
            {prevPage && !editing ? (
              <button
                type="button"
                aria-label={`Hoja anterior (${prevPage.page_number})`}
                title="Hoja anterior"
                onClick={() => goToPage(activePage - 1, -1)}
                className="group absolute -left-6 top-8 z-0 h-[80%] w-11"
              >
                <span
                  className="absolute inset-y-3 left-0 w-5 rounded-l-lg border border-border shadow-xs transition-transform duration-150 ease-[var(--ease-mn)] group-hover:-translate-x-1"
                  style={{ background: 'var(--lab-paper)' }}
                  aria-hidden="true"
                />
              </button>
            ) : null}
            {nextPage && !editing ? (
              <button
                type="button"
                aria-label={`Hoja siguiente (${nextPage.page_number})`}
                title="Hoja siguiente"
                onClick={() => goToPage(activePage + 1, 1)}
                className="group absolute -right-6 top-8 z-0 h-[80%] w-11"
              >
                <span
                  className="absolute inset-y-3 right-0 w-5 rounded-r-lg border border-border shadow-xs transition-transform duration-150 ease-[var(--ease-mn)] group-hover:translate-x-1"
                  style={{ background: 'var(--lab-paper)' }}
                  aria-hidden="true"
                />
              </button>
            ) : null}
            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
              <motion.article
                key={page.page_number}
                custom={direction}
                variants={{
                  enter: (dir: number) => ({ x: reduce ? 0 : dir * 24, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (dir: number) => ({ x: reduce ? 0 : dir * -24, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: EASE_OUT }}
                aria-label={`Texto de la hoja ${page.page_number}`}
                className="relative rounded-xl border border-border px-8 py-7 shadow-md md:px-10"
                style={{ background: 'var(--lab-paper)' }}
              >
                <div className="flex items-baseline gap-2 pb-5">
                  <span className="mono text-[11.5px] tabular-nums text-fg-3">
                    hoja {page.page_number} de {pages.length}
                  </span>
                  <span
                    className={cn(
                      'ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium',
                      STATUS_TONE_CLASS[st.tone] ?? 'text-fg-3',
                    )}
                  >
                    <span className={cn('size-1.5 rounded-full', statusDot(st))} aria-hidden="true" />
                    {STATUS_WORD[st.key] ?? st.label}
                  </span>
                </div>

                {st.key === 'failed' ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Meeple className="size-11 -rotate-6 text-fg-3" />
                    <p className="text-[15px] font-semibold text-fg">No pudimos leer esta hoja</p>
                    <p className="max-w-[42ch] text-[13px] leading-relaxed text-fg-2">
                      La foto salió demasiado oscura o movida. Sube una versión más nítida o
                      vuelve a intentar la lectura.
                    </p>
                    <div className="mt-1 flex flex-wrap justify-center gap-2.5">
                      <button
                        type="button"
                        className="lang-lift inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-fg-inv"
                      >
                        <Upload size={15} strokeWidth={STROKE} aria-hidden="true" />
                        Sustituir la imagen
                      </button>
                      <button
                        type="button"
                        className="lang-lift inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3.5 text-[13.5px] font-medium text-fg"
                      >
                        <RotateCw size={15} strokeWidth={STROKE} aria-hidden="true" />
                        Reintentar la lectura
                      </button>
                    </div>
                  </div>
                ) : null}

                {st.key === 'processing' ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Meeple className="lang-bob size-11 text-primary" />
                    <p className="text-[15px] font-semibold text-fg">Aún leyendo esta hoja…</p>
                    <p className="text-[13px] text-fg-2">
                      El texto aparecerá aquí en cuanto termine la lectura.
                    </p>
                  </div>
                ) : null}

                {st.key !== 'failed' && st.key !== 'processing' && editing ? (
                  <textarea
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setConfirmDiscard(false);
                    }}
                    aria-label={`Editar el texto de la hoja ${page.page_number}`}
                    rows={Math.max(10, draft.split('\n').length + 1)}
                    className="lang-reading w-full resize-none bg-transparent text-fg outline-none"
                  />
                ) : null}

                {st.key !== 'failed' && st.key !== 'processing' && !editing ? (
                  <div className="space-y-3.5 pr-10">
                    {page.ocr_lines.map((line, index) => {
                      const tone =
                        line.confidence == null ? null : confidenceTone(line.confidence);
                      const problem =
                        marks && (tone?.tone === 'warning' || tone?.tone === 'error');
                      const pct =
                        line.confidence == null ? null : Math.round(line.confidence * 100);
                      return (
                        <div key={index} className="relative">
                          <p className="lang-reading text-fg" lang="es">
                            {problem ? (
                              <span
                                style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
                                className={cn(
                                  'lang-hl lang-hl-draw',
                                  tone?.tone === 'error' ? 'lang-hl-baja' : 'lang-hl-media',
                                  activeDuda === index &&
                                    'outline outline-2 outline-offset-2 outline-primary/60',
                                )}
                              >
                                {highlightSearch(line.text, search.needle)}
                              </span>
                            ) : (
                              highlightSearch(line.text, search.needle)
                            )}
                          </p>
                          {marks && pct != null && problem ? (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.2 }}
                              className={cn(
                                'mono absolute -right-10 top-1 text-[11px] tabular-nums',
                                tone?.tone === 'error'
                                  ? 'font-semibold text-error'
                                  : 'font-medium text-warning',
                              )}
                            >
                              {pct}%
                            </motion.span>
                          ) : null}
                          {activeMatch === index ? (
                            <span className="sr-only">coincidencia activa</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </motion.article>
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {originalOpen ? (
              <motion.aside
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 48 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 48 }}
                transition={spring}
                aria-label="Imagen original de la hoja"
                className="hidden w-full max-w-[24rem] shrink-0 md:block"
              >
                <div
                  className="relative overflow-hidden rounded-xl border border-border shadow-md"
                  style={{
                    background: 'var(--lab-paper)',
                    aspectRatio:
                      page.image_width && page.image_height
                        ? `${page.image_width} / ${page.image_height}`
                        : '3 / 4',
                  }}
                >
                  {page.image_available ? (
                    <>
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
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                      <AlertTriangle
                        size={16}
                        strokeWidth={STROKE}
                        className="text-fg-3"
                        aria-hidden="true"
                      />
                      <p className="text-[13px] text-fg-2">Esta hoja no tiene escaneo guardado.</p>
                    </div>
                  )}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>
      </main>

      <div
        data-film-ignore="dock"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
      >
        <motion.div
          layout
          data-film-ignore="dock"
          transition={spring}
          style={{ borderRadius: 20, transformOrigin: 'bottom center' }}
          className="pointer-events-auto overflow-hidden border border-border bg-card shadow-lg"
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
                <DockTool label="Buscar" onClick={() => openTool('buscar')}>
                  <Search size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool
                  label="Dudas"
                  active={marks}
                  disabled={!hasConfidence || busy}
                  onClick={() => openTool('dudas')}
                >
                  <Highlighter size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool
                  label="Original"
                  active={originalOpen}
                  onClick={() => setOriginalOpen((value) => !value)}
                >
                  <ImageIcon size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool
                  label="Editar"
                  disabled={busy || st.key === 'failed' || st.key === 'processing'}
                  onClick={startEditing}
                >
                  <Pencil size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool label="Hojas" onClick={() => openTool('hojas')}>
                  <Layers3 size={16} strokeWidth={STROKE} aria-hidden="true" />
                </DockTool>
                <DockTool label="Más" onClick={() => openTool('mas')}>
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
              >
                <TrayFrame onClose={() => setDock('closed')}>
                  <Search
                    size={15}
                    strokeWidth={STROKE}
                    className="shrink-0 text-fg-3"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    ref={searchInputRef}
                    value={search.query}
                    onChange={(event) => search.search(event.target.value)}
                    placeholder="Buscar en el manual…"
                    aria-label="Buscar en el texto del manual"
                    className="w-56 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  <span
                    className="mono w-16 shrink-0 text-right text-[12px] tabular-nums text-fg-2"
                    aria-live="polite"
                  >
                    {search.query
                      ? search.totalHits === 0
                        ? 'sin nada'
                        : `${search.activePosition} de ${search.totalHits}`
                      : ''}
                  </span>
                  <button
                    type="button"
                    aria-label="Coincidencia anterior"
                    disabled={search.totalHits === 0}
                    onClick={() => jumpToMatch(-1)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronUp size={15} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    aria-label="Coincidencia siguiente"
                    disabled={search.totalHits === 0}
                    onClick={() => jumpToMatch(1)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronDown size={15} strokeWidth={STROKE} />
                  </button>
                </TrayFrame>
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
              >
                <TrayFrame
                  onClose={() => {
                    setDock('closed');
                    setMarks(false);
                    setActiveDuda(null);
                  }}
                >
                  <Highlighter
                    size={15}
                    strokeWidth={STROKE}
                    className="shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-medium text-fg" aria-live="polite">
                    {dudas.length === 0
                      ? 'Esta hoja no tiene dudas'
                      : activeDuda !== null && dudas.includes(activeDuda)
                        ? `Duda ${dudas.indexOf(activeDuda) + 1} de ${dudas.length}`
                        : `${dudas.length} dudas en esta hoja`}
                  </span>
                  <button
                    type="button"
                    aria-label="Duda anterior"
                    disabled={dudas.length === 0}
                    onClick={() => jumpToDuda(-1)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronUp size={15} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    aria-label="Duda siguiente"
                    disabled={dudas.length === 0}
                    onClick={() => jumpToDuda(1)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-2 hover:text-fg disabled:opacity-40"
                  >
                    <ChevronDown size={15} strokeWidth={STROKE} />
                  </button>
                </TrayFrame>
              </motion.div>
            ) : null}

            {dock === 'editar' ? (
              <motion.div
                key="editar"
                data-film-ignore="dock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="px-3 py-2"
              >
                {confirmDiscard ? (
                  <div className="flex items-center gap-2.5">
                    <p className="text-[13px] font-medium text-fg">¿Descartar los cambios?</p>
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
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={!dirty}
                      onClick={stopEditing}
                      className="lang-lift inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-fg-inv disabled:opacity-45"
                    >
                      <Check size={14} strokeWidth={STROKE} aria-hidden="true" />
                      Guardar cambios
                    </button>
                    <button
                      type="button"
                      onClick={() => (dirty ? setConfirmDiscard(true) : stopEditing())}
                      className="inline-flex h-8 items-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg"
                    >
                      Cancelar
                    </button>
                    <span className="w-32 text-[12px] text-fg-3">
                      {dirty ? 'Cambios sin guardar' : 'Editando esta hoja'}
                    </span>
                  </div>
                )}
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
                className="w-72 p-2"
              >
                <div className="grid grid-cols-2 gap-1">
                  {pages.map((item) => {
                    const itemSt = pageStatus(item);
                    const hits = search.hitsByPage.get(item.page_number) ?? 0;
                    return (
                      <button
                        key={item.page_number}
                        type="button"
                        onClick={() => {
                          goToPage(
                            item.page_number,
                            item.page_number > activePage ? 1 : -1,
                          );
                          setDock('closed');
                        }}
                        className={cn(
                          'flex h-10 items-center gap-2 rounded-lg px-2.5 text-left',
                          item.page_number === activePage
                            ? 'bg-primary-100 text-primary-700'
                            : 'text-fg hover:bg-surface',
                        )}
                      >
                        <span
                          className={cn('size-1.5 shrink-0 rounded-full', statusDot(itemSt))}
                          aria-hidden="true"
                        />
                        <span className="text-[13px] font-semibold">{item.page_number}</span>
                        <span className="min-w-0 truncate text-[11.5px] text-fg-3">
                          {STATUS_WORD[itemSt.key] ?? itemSt.label}
                        </span>
                        {hits > 0 ? (
                          <span className="mono ml-auto text-[11px] font-bold tabular-nums text-primary-700">
                            {hits}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
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
                className="w-60 p-2"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDock('closed')}
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-fg hover:bg-surface disabled:opacity-45"
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
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-error hover:bg-error-bg"
                >
                  <Trash2 size={15} strokeWidth={STROKE} aria-hidden="true" />
                  Eliminar manual…
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
            aria-labelledby="atril-delete-title"
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
              <p id="atril-delete-title" className="text-[15px] font-semibold text-fg">
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
