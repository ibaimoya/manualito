import { ChevronLeft, ChevronRight, Image, Layers, Pencil, Search, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ManualDetailPage, OcrLine } from '@/shared/api/client';
import { confidenceTone, pageStatus } from '@/features/manual/pageStatus';
import { labManual, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { cn } from '@/shared/lib/cn';

/* V-B "Lectura focal": una sola columna centrada; el chrome se repliega a una barra
   flotante compacta; la imagen original es un peek lateral colapsable. */

const STROKE = 1.75;

const STATUS_DOT: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  accent: 'bg-accent',
  error: 'bg-error',
};

function PageDots({
  pages,
  active,
  hitsByPage,
  onSelect,
}: Readonly<{
  pages: readonly ManualDetailPage[];
  active: number;
  hitsByPage: ReadonlyMap<number, number>;
  onSelect: (pageNumber: number) => void;
}>) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Páginas del manual">
      {pages.map((page) => {
        const st = pageStatus(page);
        const current = page.page_number === active;
        const hits = hitsByPage.get(page.page_number) ?? 0;
        return (
          <button
            key={page.page_number}
            type="button"
            aria-current={current ? 'page' : undefined}
            aria-label={`Página ${page.page_number} · ${st.label}${hits > 0 ? ` · ${hits} coincidencias` : ''}`}
            onClick={() => onSelect(page.page_number)}
            className={cn(
              'relative grid h-7 min-w-7 shrink-0 place-items-center rounded-md border px-1.5 text-[12px] font-semibold tabular-nums transition-[border-color,background-color] duration-150 ease-[var(--ease-mn)]',
              current
                ? 'border-primary bg-bg text-primary-700'
                : 'border-transparent text-fg-2 hover:border-border-strong',
            )}
          >
            {page.page_number}
            <span
              className={cn('absolute -bottom-0.5 size-1 rounded-full', STATUS_DOT[st.tone])}
              aria-hidden="true"
            />
            {hits > 0 ? (
              <span
                className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full bg-primary text-[9px] font-bold text-fg-inv"
                aria-hidden="true"
              >
                {hits}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function FocusLines({
  lines,
  needle,
  showConfidence,
}: Readonly<{ lines: readonly OcrLine[]; needle: string; showConfidence: boolean }>) {
  return (
    <div className="flex flex-col">
      {lines.map((line, index) => {
        const tone = line.confidence == null ? null : confidenceTone(line.confidence);
        const problem = showConfidence && (tone?.tone === 'warning' || tone?.tone === 'error');
        const last = index === lines.length - 1;
        return (
          <p
            key={index}
            className={cn(
              'font-serif text-[16px] leading-[1.75] text-fg [overflow-wrap:anywhere]',
              !last && 'pb-4',
              problem && '-mx-3 rounded-sm px-3',
              showConfidence && tone?.tone === 'warning' && 'bg-warning-bg/60',
              showConfidence && tone?.tone === 'error' && 'bg-error-bg/70',
            )}
          >
            {highlight(line.text, needle)}
            {problem ? (
              <span
                className={cn(
                  'mono ml-2 align-middle text-[12px] tabular-nums',
                  tone?.tone === 'error' ? 'font-semibold text-error' : 'font-medium text-warning',
                )}
              >
                {Math.round((line.confidence ?? 0) * 100)}%
              </span>
            ) : null}
          </p>
        );
      })}
    </div>
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

export function VariantB({
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
  const [searchOpen, setSearchOpen] = useState(Boolean(seededQuery));
  const [peekOpen, setPeekOpen] = useState(false);
  const search = usePageSearch(pages);
  const [seeded, setSeeded] = useState(false);
  if (!seeded && seededQuery) {
    setSeeded(true);
    search.search(seededQuery);
  }
  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const st = pageStatus(page);
  const hasConfidence = page.ocr_lines.some((line) => line.confidence != null);

  function go(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > pages.length) return;
    setActivePage(pageNumber);
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Barra focal: título, dots de páginas y acciones en una sola línea */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[46rem] items-center gap-3 px-5">
          <h1 className="min-w-0 truncate font-display text-[15px] font-bold text-fg">
            {manual.title ?? manual.game_name}
          </h1>
          <div className="mx-auto">
            <PageDots
              pages={pages}
              active={page.page_number}
              hitsByPage={search.hitsByPage}
              onSelect={go}
            />
          </div>
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Buscar en el manual"
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((value) => !value)}
              className={cn(
                'grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg',
                searchOpen && 'text-primary-700',
              )}
            >
              <Search size={16} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              aria-label="Colorear líneas según su confianza OCR"
              aria-pressed={showConfidence}
              disabled={!hasConfidence}
              onClick={() => setShowConfidence((value) => !value)}
              className={cn(
                'grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg disabled:opacity-40',
                showConfidence && 'text-primary-700',
              )}
            >
              <Layers size={16} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              aria-label="Editar el texto de esta página"
              className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg"
            >
              <Pencil size={16} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              aria-label="Ver la imagen original"
              aria-pressed={peekOpen}
              onClick={() => setPeekOpen((value) => !value)}
              className={cn(
                'grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg',
                peekOpen && 'text-primary-700',
              )}
            >
              <Image size={16} strokeWidth={STROKE} />
            </button>
          </span>
        </div>
        {searchOpen ? (
          <div className="border-t border-border">
            <div className="mx-auto flex h-10 max-w-[46rem] items-center gap-2 px-5">
              <input
                type="search"
                value={search.query}
                onChange={(event) => search.search(event.target.value)}
                placeholder="Buscar en el manual…"
                aria-label="Buscar en el texto del manual"
                enterKeyHint="search"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3"
              />
              {search.query ? (
                <>
                  <span className="mono text-[12px] tabular-nums text-fg-2" aria-live="polite">
                    {search.activePosition}/{search.totalHits}
                  </span>
                  <button
                    type="button"
                    aria-label="Borrar búsqueda"
                    onClick={() => search.search('')}
                    className="grid size-6 place-items-center rounded text-fg-3 hover:text-fg"
                  >
                    <X size={14} strokeWidth={STROKE} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {/* Lectura */}
      <main className="mx-auto w-full max-w-[46rem] flex-1 px-5 pb-24 pt-8">
        <div className="mb-5 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[12px] font-medium',
              st.tone === 'success' && 'text-success',
              st.tone === 'warning' && 'text-warning',
              st.tone === 'accent' && 'text-accent',
              st.tone === 'error' && 'text-error',
            )}
          >
            <st.Icon size={14} strokeWidth={STROKE} aria-hidden="true" />
            {st.label}
          </span>
          <span className="mono ml-auto text-[12px] tabular-nums text-fg-3">
            {page.page_number} / {pages.length}
          </span>
        </div>
        {page.ocr_lines.length === 0 ? (
          <p className="text-[14px] text-fg-2">
            {st.key === 'failed'
              ? 'No pudimos leer esta página. Reintenta la lectura desde el estado de la página.'
              : 'El texto aparecerá aquí en cuanto termine el reconocimiento.'}
          </p>
        ) : (
          <FocusLines
            lines={page.ocr_lines}
            needle={search.needle}
            showConfidence={showConfidence && hasConfidence}
          />
        )}
      </main>

      {/* Navegación inferior fija, discreta */}
      <footer className="pointer-events-none fixed inset-x-0 bottom-4 z-10">
        <div className="mx-auto flex max-w-[46rem] justify-center px-5">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-bg/95 px-1.5 py-1 shadow-sm backdrop-blur">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={page.page_number <= 1}
              onClick={() => go(page.page_number - 1)}
              className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg disabled:opacity-40"
            >
              <ChevronLeft size={16} strokeWidth={STROKE} />
            </button>
            <span className="mono px-1 text-[12px] font-semibold tabular-nums text-fg">
              {page.page_number} / {pages.length}
            </span>
            <button
              type="button"
              aria-label="Página siguiente"
              disabled={page.page_number >= pages.length}
              onClick={() => go(page.page_number + 1)}
              className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface hover:text-fg disabled:opacity-40"
            >
              <ChevronRight size={16} strokeWidth={STROKE} />
            </button>
          </div>
        </div>
      </footer>

      {/* Peek de imagen original */}
      {peekOpen ? (
        <aside
          aria-label="Imagen original de la página"
          className="fixed inset-y-12 right-0 z-20 w-[min(420px,90vw)] overflow-y-auto border-l border-border bg-surface shadow-lg"
        >
          <div className="flex items-baseline gap-2 px-4 pb-1 pt-3">
            <p className="text-[12.5px] font-semibold text-fg-2">Original</p>
            <p className="mono text-[11px] tabular-nums text-fg-3">página {page.page_number}</p>
            <button
              type="button"
              aria-label="Cerrar la imagen original"
              onClick={() => setPeekOpen(false)}
              className="ml-auto grid size-7 place-items-center rounded text-fg-3 hover:text-fg"
            >
              <X size={14} strokeWidth={STROKE} />
            </button>
          </div>
          <div
            className="mx-4 mb-4 mt-2 overflow-hidden rounded-lg border border-border bg-bg"
            style={{
              aspectRatio:
                page.image_width && page.image_height
                  ? `${page.image_width} / ${page.image_height}`
                  : '3 / 4',
            }}
          >
            <div className="size-full bg-gradient-to-b from-bg to-surface" />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
