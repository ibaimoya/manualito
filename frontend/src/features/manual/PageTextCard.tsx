import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, Pencil, RotateCw, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import i18n from '@/app/i18n';
import type { ManualDetailPage } from '@/shared/api/client';
import {
  confidenceLegend,
  CONFIDENCE_ROW_CLASS,
  confidenceTone,
  pageStatus,
  STATUS_FG_CLASS,
  STATUS_HELP_TONE,
} from '@/features/manual/pageStatus';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

/** Cota del backend ("MANUAL_PAGE_TEXT_MAX_LENGTH"). */
const PAGE_TEXT_MAX = 20_000;
/** Misma altura del cajón en lectura y edición: entrar/salir no mueve el layout. */
const BOX_CLASS = 'h-[clamp(360px,60vh,640px)]';
/** Marco común: el borde redondeado recorta la barra de scroll interior (queda
 *  integrada, no superpuesta) y fija la altura. Lo comparten lectura y edición. */
const TEXT_BOX = cn('overflow-hidden rounded-2xl border', BOX_CLASS);
/** Misma tipografía al leer y al editar, para que entrar en edición no la cambie. */
const TEXT_BODY = 'font-serif text-[15.5px] leading-[1.72] text-fg';
const CONFIDENCE_TRANSITION =
  'duration-[240ms] ease-[var(--m-easing)] motion-reduce:transition-none';

const COUNT_FORMATTERS = {
  en: new Intl.NumberFormat('en-US'),
  es: new Intl.NumberFormat('es-ES'),
};

function formatCount(value: number): string {
  return COUNT_FORMATTERS[i18n.language.startsWith('en') ? 'en' : 'es'].format(value);
}

function pageText(page: ManualDetailPage): string {
  return page.ocr_lines.map((line) => line.text).join('\n');
}

/** El mismo texto y sus párrafos se conservan al mostrar la confianza OCR. */
function pageLines(
  page: ManualDetailPage,
): ReadonlyArray<{ paragraphs: string[]; confidence: number | null }> {
  return page.ocr_lines
    .map((line) => ({
      paragraphs: line.text
        .split('\n')
        .map((part) => part.trim())
        .filter(Boolean),
      confidence: line.confidence,
    }))
    .filter((line) => line.paragraphs.length > 0);
}

function revealActiveMatch(scroller: HTMLDivElement | null, reducedMotion: boolean): void {
  const mark = scroller?.querySelector<HTMLElement>('mark[data-active-match]');
  if (!scroller || !mark) return;
  const box = scroller.getBoundingClientRect();
  const hit = mark.getBoundingClientRect();
  if (hit.top >= box.top && hit.bottom <= box.bottom) return;
  const delta = hit.top - box.top - (scroller.clientHeight - hit.height) / 2;
  scroller.scrollTo({
    top: scroller.scrollTop + delta,
    behavior: reducedMotion ? 'auto' : 'smooth',
  });
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
  const { t } = useTranslation('manual');
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-0.5">
      <span className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">
        {t('confidence.heading')}
      </span>
      {confidenceLegend().map((item) => (
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
  const { t } = useTranslation('manual');
  const meta = confidence == null ? null : confidenceTone(confidence);
  const pct = confidence == null ? null : Math.round(confidence * 100);
  const label = meta
    ? t('confidence.lineLabel', { label: meta.label, percent: pct })
    : t('confidence.noData');
  return (
    <Tooltip content={label} touch>
      <button
        type="button"
        aria-label={label}
        data-tone={meta ? STATUS_HELP_TONE[meta.tone] : 'neutral'}
        className="help-indicator mono w-full self-center tabular-nums"
      >
        {pct == null ? t('confidence.shortNoData') : `${pct}%`}
      </button>
    </Tooltip>
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
  const { t } = useTranslation('manual');
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
        {t('text.editLabel', { pageNumber: page.page_number })}
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
          {t('text.editCounter', {
            current: formatCount(draftLength),
            max: formatCount(PAGE_TEXT_MAX),
          })}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('buttons.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!draftValid}>
          {t('buttons.saveChanges')}
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
  const { t } = useTranslation('manual');
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
      <p className="font-display text-base font-bold text-fg">{t('text.failedTitle')}</p>
      <p className="max-w-sm text-[13.5px] leading-relaxed text-fg-2">
        {t('text.failedDescription')}
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
        {t('buttons.readAgain')}
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
  const { t } = useTranslation('manual');
  const lines = useMemo(() => pageLines(page), [page]);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const st = pageStatus(page);
  const scrollRef = useRef<HTMLDivElement>(null);
  const useConfidence = showConfidence && lines.some((line) => line.confidence != null);

  // Trae la coincidencia activa a la vista dentro del cajón (solo si está fuera).
  useEffect(() => {
    revealActiveMatch(scrollRef.current, reducedMotion);
  }, [activeMatch, needle, page.page_number, useConfidence, reducedMotion]);

  if (editing) {
    return <EditBox page={page} saving={saving} onCancel={onCancelEdit} onSave={onSave} />;
  }

  if (st.key === 'failed') {
    return <FailedBox reprocessing={reprocessing} busy={busy} onReprocessPage={onReprocessPage} />;
  }

  const counter = { value: 0 };
  const empty = lines.length === 0;

  // Contenido del cajón en una variable: evita anidar ternarios en el JSX y
  // mantiene el resaltado inline (el "counter" se comparte en un solo render).
  let body: ReactNode;
  if (empty) {
    body = (
      <p className="flex h-full items-center justify-center px-7 text-center text-sm text-fg-3">
        {t('text.empty')}
      </p>
    );
  } else {
    body = (
      <div
        ref={scrollRef}
        className={cn(
          'flex h-full flex-col overflow-y-auto px-3.5 transition-[padding-block,gap] [scrollbar-gutter:stable]',
          CONFIDENCE_TRANSITION,
          useConfidence ? 'gap-2 py-3.5' : 'gap-3.5 py-6',
        )}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget)
            revealActiveMatch(event.currentTarget, reducedMotion);
        }}
      >
        {lines.map((line, index) => {
          const meta = line.confidence == null ? null : confidenceTone(line.confidence);
          return (
            <div
              key={`${index}-${line.paragraphs[0]!.slice(0, 24)}`}
              className={cn(
                'flex shrink-0 items-start rounded-lg border-l-[3px] px-3 transition-[background-color,border-color,padding-block]',
                CONFIDENCE_TRANSITION,
                useConfidence
                  ? cn(
                      'py-2.5',
                      meta
                        ? CONFIDENCE_ROW_CLASS[meta.tone]
                        : 'border-l-border-strong bg-surface-2',
                    )
                  : 'border-l-transparent py-0',
              )}
            >
              <div className={cn('min-w-0 flex-1 space-y-3.5 [overflow-wrap:anywhere]', TEXT_BODY)}>
                {line.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{highlight(paragraph, needle, counter, activeMatch)}</p>
                ))}
              </div>
              <div
                aria-hidden={!useConfidence}
                inert={!useConfidence}
                className={cn(
                  'shrink-0 self-center overflow-hidden transition-[width,margin-inline-start,opacity]',
                  CONFIDENCE_TRANSITION,
                  useConfidence ? 'ms-3 w-[4.25rem] opacity-100' : 'ms-0 w-0 opacity-0',
                )}
              >
                <ConfidenceChip confidence={line.confidence} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {st.key === 'low' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning bg-warning-bg p-3.5">
          <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg">
            <strong className="font-semibold">{t('text.lowTitle')}</strong>{' '}
            {t('text.lowDescription')}
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={reprocessing}
            disabled={busy}
            onClick={onReprocessPage}
          >
            <RotateCw size={14} strokeWidth={2} />
            {t('buttons.readAgain')}
          </Button>
        </div>
      ) : null}
      {st.key === 'edited' ? (
        <p className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-accent">
          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
          {t('text.edited')}
        </p>
      ) : null}
      {st.key === 'duplicate' ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning bg-warning-bg p-3.5">
          <Copy
            size={16}
            strokeWidth={2.2}
            className="mt-0.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-fg">{t('text.duplicateTitle')}</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg-2">
              {t('text.duplicateDescription')}
            </p>
          </div>
        </div>
      ) : null}

      <div>
        <div
          aria-hidden={!useConfidence}
          className={cn(
            'grid transition-[grid-template-rows,opacity]',
            CONFIDENCE_TRANSITION,
            useConfidence ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pb-3">
              <ConfidenceLegend />
            </div>
          </div>
        </div>
        {/* Borde redondeado fuera (overflow-hidden) + scroll dentro: barra integrada. */}
        <article
          aria-label={t('page.articleLabel', { pageCount, pageNumber: page.page_number })}
          className={cn(TEXT_BOX, 'border-border bg-surface')}
        >
          {body}
        </article>
      </div>
    </div>
  );
}
