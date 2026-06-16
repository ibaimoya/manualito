import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pencil, RotateCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ManualDetailPage } from '@/shared/api/client';
import {
  CONFIDENCE_LEGEND,
  CONFIDENCE_ROW_CLASS,
  confidenceTone,
  pageStatus,
  STATUS_FG_CLASS,
} from '@/features/manual/pageStatus';
import { cn } from '@/shared/lib/cn';

/** Cota del backend ("MANUAL_PAGE_TEXT_MAX_LENGTH"). */
const PAGE_TEXT_MAX = 20_000;
/** Misma altura del cajón en lectura y edición: entrar/salir no mueve el layout. */
const BOX_CLASS = 'h-[clamp(360px,60vh,640px)]';
/** Marco común: el borde redondeado recorta la barra de scroll interior (queda
 *  integrada, no superpuesta) y fija la altura. Lo comparten lectura y edición. */
const TEXT_BOX = cn('overflow-hidden rounded-2xl border', BOX_CLASS);
/** Misma tipografía al leer y al editar, para que entrar en edición no la cambie. */
const TEXT_BODY = 'font-serif text-[15.5px] leading-[1.72] text-fg';

function pageText(page: ManualDetailPage): string {
  return page.ocr_lines.map((line) => line.text).join('\n');
}

function pageParagraphs(page: ManualDetailPage): string[] {
  return page.ocr_lines
    .flatMap((line) => line.text.split('\n'))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Líneas OCR con su confianza, para la vista de confianza por línea. */
function pageLines(page: ManualDetailPage): ReadonlyArray<{ text: string; confidence: number | null }> {
  return page.ocr_lines
    .map((line) => ({ text: line.text.trim(), confidence: line.confidence }))
    .filter((line) => line.text.length > 0);
}

/** Resalta "needle" en "text"; "counter" lleva el índice global para marcar la activa. */
function highlight(
  text: string,
  needle: string,
  counter: { value: number },
  activeIndex: number | null,
): ReactNode {
  if (needle.length === 0) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  while (true) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) parts.push(text.slice(from, at));
    const isActive = counter.value === activeIndex;
    parts.push(
      <mark
        key={`${at}-${counter.value}`}
        data-active-match={isActive || undefined}
        className={cn(
          'rounded-[3px] px-0.5 font-semibold',
          isActive ? 'bg-primary text-fg-inv' : 'bg-primary-100 text-primary-700',
        )}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    counter.value += 1;
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/** Leyenda de umbrales de confianza, visible solo con el modo activo. */
function ConfidenceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-0.5">
      <span className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">
        Confianza OCR
      </span>
      {CONFIDENCE_LEGEND.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-2"
        >
          <span
            className={cn('size-2.5 rounded-full bg-current', STATUS_FG_CLASS[item.tone])}
            aria-hidden="true"
          />
          {item.label}
          <span className="mono text-[10.5px] text-fg-3">{item.range}</span>
        </span>
      ))}
    </div>
  );
}

/** Chip de porcentaje de confianza de una línea (o "s/d" si no hay dato). */
function ConfidenceChip({ confidence }: Readonly<{ confidence: number | null }>) {
  const meta = confidence == null ? null : confidenceTone(confidence);
  const pct = confidence == null ? null : Math.round(confidence * 100);
  return (
    <span
      title={`Confianza OCR: ${meta?.label ?? 'sin dato'}`}
      aria-label={
        meta ? `Confianza OCR de esta línea: ${meta.label}, ${pct} por ciento` : 'Confianza OCR: sin dato'
      }
      className={cn(
        'mono inline-flex h-[22px] shrink-0 items-center gap-1.5 self-center rounded-full border border-current bg-card px-2 text-[11px] font-bold tabular-nums',
        meta ? STATUS_FG_CLASS[meta.tone] : 'text-fg-3',
      )}
    >
      <span className="size-[7px] rounded-full bg-current" aria-hidden="true" />
      {pct == null ? 's/d' : `${pct}%`}
    </span>
  );
}

/** Modo edición: se monta solo al editar, con el borrador en useState perezoso. */
function EditBox({
  page,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  page: ManualDetailPage;
  saving: boolean;
  onCancel: () => void;
  onSave: (text: string) => void;
}>) {
  const [draft, setDraft] = useState(() => pageText(page));
  const draftId = useId();
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // Foco al entrar en edición (autoFocus lo veta jsx-a11y).
  useEffect(() => {
    draftRef.current?.focus();
  }, []);

  const draftLength = draft.length;
  const draftValid = draft.trim().length > 0 && draftLength <= PAGE_TEXT_MAX;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (draftValid) onSave(draft);
      }}
    >
      <label htmlFor={draftId} className="sr-only">
        Texto de la página {page.page_number}
      </label>
      <div
        className={cn(TEXT_BOX, 'border-primary bg-bg')}
        style={{ boxShadow: 'var(--m-shadow-ring-primary)' }}
      >
        <textarea
          id={draftId}
          ref={draftRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={saving}
          spellCheck
          className={cn(
            'h-full w-full resize-none bg-transparent px-7 py-6 outline-none disabled:opacity-60',
            TEXT_BODY,
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            'mono mr-auto text-[11px]',
            draftLength > PAGE_TEXT_MAX ? 'font-bold text-error' : 'text-fg-3',
          )}
          aria-live="polite"
        >
          Al guardar, esta página pasará a «Editada a mano» · {draftLength.toLocaleString('es')} /{' '}
          {PAGE_TEXT_MAX.toLocaleString('es')}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!draftValid}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

/** Cajón de error cuando la página no se pudo leer. */
function FailedBox({
  reprocessing,
  busy,
  onReprocessPage,
}: Readonly<{ reprocessing: boolean; busy: boolean; onReprocessPage: () => void }>) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border-border bg-surface px-7 text-center',
        TEXT_BOX,
      )}
    >
      <span className="grid size-[52px] place-items-center rounded-2xl bg-error-bg text-error">
        <Upload size={24} strokeWidth={1.75} aria-hidden="true" className="rotate-180" />
      </span>
      <p className="font-display text-base font-bold text-fg">No pudimos leer esta página</p>
      <p className="max-w-sm text-[13.5px] leading-relaxed text-fg-2">
        La foto salió demasiado oscura o movida. Reintenta la lectura o sube de nuevo el manual
        con una versión más nítida.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-1"
        loading={reprocessing}
        disabled={busy}
        onClick={onReprocessPage}
      >
        <RotateCw size={14} strokeWidth={2} />
        Reintentar lectura
      </Button>
    </div>
  );
}

/** Cuerpo de una página: aviso de estado + cajón de texto (lectura, confianza o edición). */
export function PageTextCard({
  page,
  pageCount,
  needle,
  activeMatch,
  editing,
  showConfidence,
  busy,
  saving,
  reprocessing,
  onCancelEdit,
  onSave,
  onReprocessPage,
}: Readonly<{
  page: ManualDetailPage;
  pageCount: number;
  needle: string;
  /** Índice (dentro de la página) de la coincidencia activa, si cae aquí. */
  activeMatch: number | null;
  editing: boolean;
  /** Colorea cada línea según su confianza OCR. */
  showConfidence: boolean;
  /** El manual está reprocesándose: edición deshabilitada. */
  busy: boolean;
  saving: boolean;
  reprocessing: boolean;
  onCancelEdit: () => void;
  onSave: (text: string) => void;
  onReprocessPage: () => void;
}>) {
  const paragraphs = useMemo(() => pageParagraphs(page), [page]);
  const lines = useMemo(() => pageLines(page), [page]);
  const st = pageStatus(page);
  const scrollRef = useRef<HTMLDivElement>(null);
  const useConfidence = showConfidence && lines.some((line) => line.confidence != null);

  // Trae la coincidencia activa a la vista dentro del cajón (solo si está fuera).
  useEffect(() => {
    const scroller = scrollRef.current;
    const mark = scroller?.querySelector<HTMLElement>('mark[data-active-match]');
    if (!scroller || !mark) return;
    const box = scroller.getBoundingClientRect();
    const hit = mark.getBoundingClientRect();
    if (hit.top >= box.top && hit.bottom <= box.bottom) return;
    const delta = hit.top - box.top - (scroller.clientHeight - hit.height) / 2;
    const reduced = globalThis.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: reduced ? 'auto' : 'smooth' });
  }, [activeMatch, needle, page.page_number, useConfidence]);

  if (editing) {
    return <EditBox page={page} saving={saving} onCancel={onCancelEdit} onSave={onSave} />;
  }

  if (st.key === 'failed') {
    return <FailedBox reprocessing={reprocessing} busy={busy} onReprocessPage={onReprocessPage} />;
  }

  const counter = { value: 0 };
  const empty = paragraphs.length === 0;

  // Contenido del cajón en una variable: evita anidar ternarios en el JSX y
  // mantiene el resaltado inline (el "counter" se comparte en un solo render).
  let body: ReactNode;
  if (empty) {
    body = (
      <p className="flex h-full items-center justify-center px-7 text-center text-sm text-fg-3">
        No hay texto legible en esta página. Escríbelo a mano con «Editar texto» o reléela.
      </p>
    );
  } else if (useConfidence) {
    body = (
      <div ref={scrollRef} className="flex h-full flex-col gap-2 overflow-y-auto p-3.5">
        {lines.map((line, index) => {
          const meta = line.confidence == null ? null : confidenceTone(line.confidence);
          return (
            <div
              key={`${index}-${line.text.slice(0, 24)}`}
              className={cn(
                'flex items-start gap-3 rounded-lg border-l-[3px] px-3 py-2.5',
                meta ? CONFIDENCE_ROW_CLASS[meta.tone] : 'border-l-border-strong bg-surface-2',
              )}
            >
              <p className="min-w-0 flex-1 font-serif text-[15px] leading-[1.6] text-fg [overflow-wrap:anywhere]">
                {highlight(line.text, needle, counter, activeMatch)}
              </p>
              <ConfidenceChip confidence={line.confidence} />
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div ref={scrollRef} className="h-full overflow-y-auto px-7 py-6">
        <div className="flex flex-col gap-3.5">
          {paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`} className={cn(TEXT_BODY, '[overflow-wrap:anywhere]')}>
              {highlight(paragraph, needle, counter, activeMatch)}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {st.key === 'low' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning bg-warning-bg p-3.5">
          <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg">
            <strong className="font-semibold">El OCR no está seguro de esta página.</strong> La foto
            salió algo borrosa: puede haber palabras mal leídas. Reléela o corrígela a mano.
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={reprocessing}
            disabled={busy}
            onClick={onReprocessPage}
          >
            <RotateCw size={14} strokeWidth={2} />
            Releer esta página
          </Button>
        </div>
      ) : null}
      {st.key === 'edited' ? (
        <p className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-accent">
          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
          Corregiste esta página a mano · el texto ya no procede del OCR.
        </p>
      ) : null}

      {useConfidence ? <ConfidenceLegend /> : null}

      {/* Borde redondeado fuera (overflow-hidden) + scroll dentro: barra integrada. */}
      <article aria-label={`Página ${page.page_number} de ${pageCount}`} className={cn(TEXT_BOX, 'border-border bg-surface')}>
        {body}
      </article>
    </div>
  );
}
