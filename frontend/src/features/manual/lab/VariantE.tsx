import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Highlighter,
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

/* V-E «El taller»: dos hojas sobre la mesa (texto y escaneo), el mazo de páginas con
   esquinas dobladas por estado a la izquierda y el estuche de herramientas arriba. */

const STROKE = 1.75;
const SPRING = { type: 'spring', duration: 0.5, bounce: 0.2 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const STATUS_WORD: Record<string, string> = {
  ok: 'Bien leída',
  low: 'Con dudas',
  edited: 'Editada',
  duplicate: 'Duplicada',
  processing: 'Aún leyendo',
  failed: 'No se pudo leer',
};

const DOGEAR_COLOR: Record<string, string> = {
  success: 'var(--m-success)',
  warning: 'var(--m-warning)',
  accent: 'var(--m-accent-500)',
  error: 'var(--m-error)',
};

function dogEar(st: { key: string; tone: string }): string {
  if (st.key === 'processing') return 'var(--m-text-3)';
  return DOGEAR_COLOR[st.tone] ?? 'var(--m-text-3)';
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

function EstucheButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: Readonly<{
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
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
        'lang-lift inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium',
        active ? 'bg-primary-100 text-primary-700' : 'text-fg-2 hover:text-fg',
        disabled && 'opacity-40',
      )}
    >
      {children}
      {label}
    </button>
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

export function VariantE({
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
  const [marks, setMarks] = useState(initialConfidence);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [masOpen, setMasOpen] = useState(false);
  const [activeDuda, setActiveDuda] = useState<number | null>(null);
  const [seeded, setSeeded] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  if (!seeded && seededQuery) {
    setSeeded(true);
    search.search(seededQuery);
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

  const spring = reduce ? { duration: 0.15 } : SPRING;

  function goToPage(pageNumber: number): void {
    if (editing) return;
    if (pageNumber < 1 || pageNumber > pages.length) return;
    setActivePage(pageNumber);
    setActiveDuda(null);
  }

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

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  function jumpToMatch(delta: 1 | -1): void {
    const match = search.step(delta);
    if (match) goToPage(match.pageNumber);
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
  }

  function stopEditing(): void {
    setEditing(false);
    setConfirmDiscard(false);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-6xl items-baseline gap-3 px-6 pb-3 pt-6">
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

      <div className="mx-auto w-full max-w-6xl px-6">
        <div
          data-film-ignore="estuche"
          className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card px-2.5 py-1.5 shadow-sm"
        >
          {editing ? (
            confirmDiscard ? (
              <div className="flex h-9 items-center gap-2.5 px-1">
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
              <div className="flex h-9 items-center gap-2.5 px-1">
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
                <span className="text-[12px] text-fg-3">
                  {dirty ? 'Cambios sin guardar' : 'Editando la hoja'}
                </span>
              </div>
            )
          ) : (
            <>
              <div className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-lg border border-border-strong pl-2.5 pr-1 focus-within:border-primary/60">
                <Search
                  size={14}
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
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
                />
                {search.query ? (
                  <span className="flex shrink-0 items-center">
                    <span
                      className="mono w-14 text-right text-[12px] tabular-nums text-fg-2"
                      aria-live="polite"
                    >
                      {search.totalHits === 0
                        ? 'nada'
                        : `${search.activePosition} de ${search.totalHits}`}
                    </span>
                    <button
                      type="button"
                      aria-label="Coincidencia anterior"
                      disabled={search.totalHits === 0}
                      onClick={() => jumpToMatch(-1)}
                      className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg disabled:opacity-40"
                    >
                      <ChevronUp size={14} strokeWidth={STROKE} />
                    </button>
                    <button
                      type="button"
                      aria-label="Coincidencia siguiente"
                      disabled={search.totalHits === 0}
                      onClick={() => jumpToMatch(1)}
                      className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg disabled:opacity-40"
                    >
                      <ChevronDown size={14} strokeWidth={STROKE} />
                    </button>
                    <button
                      type="button"
                      aria-label="Borrar búsqueda"
                      onClick={() => search.search('')}
                      className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg"
                    >
                      <X size={14} strokeWidth={STROKE} />
                    </button>
                  </span>
                ) : null}
              </div>
              <EstucheButton
                label="Dudas"
                active={marks}
                disabled={!hasConfidence || busy}
                onClick={() => {
                  setMarks((value) => !value);
                  setActiveDuda(null);
                }}
              >
                <motion.span
                  animate={{ rotate: marks ? -15 : 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className={cn('inline-flex', marks && 'text-warning')}
                >
                  <Highlighter size={15} strokeWidth={STROKE} aria-hidden="true" />
                </motion.span>
              </EstucheButton>
              <AnimatePresence initial={false}>
                {marks && dudas.length > 0 ? (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    className="flex items-center gap-0.5 overflow-hidden"
                  >
                    <span
                      className="mono whitespace-nowrap px-1 text-[12px] tabular-nums text-fg-2"
                      aria-live="polite"
                    >
                      {activeDuda !== null && dudas.includes(activeDuda)
                        ? `duda ${dudas.indexOf(activeDuda) + 1} de ${dudas.length}`
                        : `${dudas.length} dudas`}
                    </span>
                    <button
                      type="button"
                      aria-label="Duda anterior"
                      onClick={() => jumpToDuda(-1)}
                      className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg"
                    >
                      <ChevronUp size={14} strokeWidth={STROKE} />
                    </button>
                    <button
                      type="button"
                      aria-label="Duda siguiente"
                      onClick={() => jumpToDuda(1)}
                      className="grid size-7 place-items-center rounded-md text-fg-2 hover:text-fg"
                    >
                      <ChevronDown size={14} strokeWidth={STROKE} />
                    </button>
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <EstucheButton
                label="Editar"
                disabled={busy || st.key === 'failed' || st.key === 'processing'}
                onClick={startEditing}
              >
                <Pencil size={15} strokeWidth={STROKE} aria-hidden="true" />
              </EstucheButton>
              <div className="relative">
                <EstucheButton
                  label="Más"
                  active={masOpen}
                  onClick={() => setMasOpen((value) => !value)}
                >
                  <MoreHorizontal size={15} strokeWidth={STROKE} aria-hidden="true" />
                </EstucheButton>
                {masOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="Cerrar el menú"
                      tabIndex={-1}
                      onClick={() => setMasOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div className="absolute right-0 top-11 z-20 w-60 rounded-xl border border-border bg-card p-1.5 shadow-md">
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
            </>
          )}
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-start gap-6 px-6 pb-10 pt-5">
        <nav aria-label="Mazo de hojas" className="hidden w-36 shrink-0 flex-col md:flex">
          {pages.map((item, index) => {
            const itemSt = pageStatus(item);
            const active = item.page_number === page.page_number;
            const hits = search.hitsByPage.get(item.page_number) ?? 0;
            return (
              <motion.button
                key={item.page_number}
                type="button"
                onClick={() => goToPage(item.page_number)}
                animate={{
                  rotate: active || reduce ? 0 : index % 2 === 0 ? -0.8 : 0.8,
                  x: active ? 10 : 0,
                }}
                transition={spring}
                className={cn(
                  'lang-lift relative -mb-2 h-[72px] rounded-lg border p-2.5 text-left',
                  active
                    ? 'z-10 border-primary shadow-sm'
                    : 'border-border shadow-xs hover:z-10',
                  editing && !active && 'opacity-50',
                )}
                style={{ background: 'var(--lab-paper)' }}
                disabled={editing}
              >
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-0 size-0 rounded-tr-lg border-l-[14px] border-t-[14px] border-l-transparent"
                  style={{ borderTopColor: dogEar(itemSt) }}
                />
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-bold text-fg">{item.page_number}</span>
                  <span className="min-w-0 truncate text-[10.5px] text-fg-3">
                    {STATUS_WORD[itemSt.key] ?? itemSt.label}
                  </span>
                </span>
                <span className="mt-1 block truncate text-[10.5px] leading-snug text-fg-3">
                  {item.ocr_lines[0]?.text ?? 'Sin texto todavía'}
                </span>
                {hits > 0 ? (
                  <span className="mono absolute bottom-1.5 right-2 text-[10.5px] font-bold tabular-nums text-primary-700">
                    {hits}
                  </span>
                ) : null}
              </motion.button>
            );
          })}
        </nav>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.article
            key={page.page_number}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.995 }}
            transition={spring}
            aria-label={`Texto de la hoja ${page.page_number}`}
            className="min-w-0 flex-1 rounded-xl border border-border px-8 py-7 shadow-md"
            style={{ background: 'var(--lab-paper)' }}
          >
            <div className="flex items-baseline gap-2 pb-5">
              <span className="mono text-[11.5px] tabular-nums text-fg-3">
                hoja {page.page_number} de {pages.length}
              </span>
              <span className="ml-auto text-[12px] font-medium text-fg-3">
                {STATUS_WORD[st.key] ?? st.label}
              </span>
            </div>
            {st.key === 'failed' ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Meeple className="size-11 -rotate-6 text-fg-3" />
                <p className="text-[15px] font-semibold text-fg">No pudimos leer esta hoja</p>
                <p className="max-w-[42ch] text-[13px] leading-relaxed text-fg-2">
                  La foto salió demasiado oscura o movida. Sube una versión más nítida o vuelve
                  a intentar la lectura.
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
                  const tone = line.confidence == null ? null : confidenceTone(line.confidence);
                  const problem = marks && (tone?.tone === 'warning' || tone?.tone === 'error');
                  const pct = line.confidence == null ? null : Math.round(line.confidence * 100);
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
          </motion.article>
        </AnimatePresence>

        <aside
          aria-label="Imagen original de la hoja"
          className="sticky top-6 hidden w-72 shrink-0 lg:block"
        >
          <div
            className="relative overflow-hidden rounded-xl border border-border shadow-sm"
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
                <div className="absolute inset-x-5 top-5 space-y-2" aria-hidden="true">
                  {[92, 78, 85, 60, 88, 74, 40].map((width, row) => (
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
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center">
                <AlertTriangle
                  size={16}
                  strokeWidth={STROKE}
                  className="text-fg-3"
                  aria-hidden="true"
                />
                <p className="text-[12.5px] text-fg-2">Esta hoja no tiene escaneo guardado.</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[11.5px] text-fg-3">Original · hoja {page.page_number}</p>
        </aside>
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
            aria-labelledby="taller-delete-title"
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
              <p id="taller-delete-title" className="text-[15px] font-semibold text-fg">
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
