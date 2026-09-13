import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { PencilSimpleIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import i18n from '@/app/i18n';
import type { ManualDetailPage } from '@/shared/api/client';
import {
  confidenceTone,
  pageStatus,
  STATUS_FG_CLASS,
  STATUS_HELP_TONE,
  type ConfidenceTone,
  type PageStatusMeta,
} from '@/features/manual/pageStatus';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { CorrectionText, searchRanges } from './CorrectionText';

/** Límite compartido con MANUAL_PAGE_TEXT_MAX_LENGTH en el backend. */
const PAGE_TEXT_MAX = 20_000;
const TEXT_BODY =
  'font-body text-base leading-[1.75] text-fg whitespace-pre-wrap [overflow-wrap:anywhere]';
const TEXT_SCROLL =
  'mx-auto block h-full w-full max-w-[76ch] overflow-y-auto overscroll-contain py-6 pe-14 [scrollbar-gutter:stable]';
const STATUS_ROW = 'flex h-10 shrink-0 items-center gap-2 px-5 text-xs text-fg-2 sm:px-7';
const FOOTER =
  'flex h-[4.25rem] shrink-0 items-center gap-2 border-t border-border/40 px-4 sm:px-5';
const EDIT_SURFACE =
  'relative min-h-0 flex-1 overflow-hidden px-5 after:pointer-events-none after:absolute after:inset-y-6 after:start-2 after:w-0.5 after:bg-primary-700 after:opacity-0 focus-within:after:opacity-100 sm:px-7 sm:after:start-3 forced-colors:after:bg-[Highlight]';
const QUIET_ACTION =
  'rounded-[6px] font-medium underline-offset-4 transition-none! hover:bg-fg/[0.04] hover:underline focus-visible:underline pointer-coarse:min-h-11';
const CONFIDENCE_HIGHLIGHT: Record<ConfidenceTone, string> = {
  success: 'bg-success/10',
  warning: 'bg-warning/15',
  error: 'bg-error/15',
};

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

function revealActiveMatch(scroller: HTMLDivElement | null, reducedMotion: boolean): void {
  const mark = scroller?.querySelector<HTMLElement>('mark[data-active-match]');
  if (!scroller || !mark) return;
  const box = scroller.getBoundingClientRect();
  const hit = mark.getBoundingClientRect();
  if (hit.top >= box.top && hit.bottom <= box.bottom) return;
  scroller.scrollTo({
    top: scroller.scrollTop + hit.top - box.top - (scroller.clientHeight - hit.height) / 2,
    behavior: reducedMotion ? 'auto' : 'smooth',
  });
}

function ConfidenceValue({ confidence }: Readonly<{ confidence: number | null }>) {
  const { t } = useTranslation('manual');
  const meta = confidence == null ? null : confidenceTone(confidence);
  const percent = confidence == null ? null : Math.round(confidence * 100);
  const label = meta
    ? t('confidence.lineLabel', { label: meta.label, percent })
    : t('confidence.noData');
  return (
    <Tooltip content={label} touch>
      <button
        type="button"
        aria-label={label}
        data-tone={meta ? STATUS_HELP_TONE[meta.tone] : 'neutral'}
        className="help-indicator mono h-7 w-full text-[11px] tabular-nums"
      >
        {percent == null ? t('confidence.shortNoData') : `${percent}%`}
      </button>
    </Tooltip>
  );
}

type ReadingPosition = { top: number; offset: number };

function EmptyPageContent({ status }: Readonly<{ status: PageStatusMeta }>) {
  const { t } = useTranslation('manual');
  const Icon = status.Icon;
  let description = t('text.empty');
  if (status.key === 'failed') description = t('text.failedDescription');
  if (status.key === 'processing') description = status.tip;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 text-center">
      <Icon size={24} className={STATUS_FG_CLASS[status.tone]} aria-hidden="true" />
      <p className="text-sm font-semibold">
        {status.key === 'failed' ? t('text.failedTitle') : status.label}
      </p>
      <p className="max-w-sm text-sm leading-relaxed text-fg-2">{description}</p>
    </div>
  );
}

function EditBox({
  page,
  saving,
  busy,
  position,
  onCancel,
  onSave,
  onDirtyChange,
  onScrollPosition,
}: Readonly<{
  page: ManualDetailPage;
  saving: boolean;
  busy: boolean;
  position: RefObject<ReadingPosition>;
  onCancel: () => void;
  onSave: (text: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onScrollPosition: (top: number) => void;
}>) {
  const { t } = useTranslation('manual');
  const [original] = useState(() => pageText(page));
  const [draft, setDraft] = useState(original);
  const draftId = useId();
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const dirty = draft !== original;
  const locked = saving || busy;
  const tooLong = draft.length > PAGE_TEXT_MAX;
  const empty = draft.trim().length === 0;
  const valid = !empty && !tooLong;
  const canSave = dirty && valid && !locked;
  const message = tooLong
    ? t('text.tooLong', { max: formatCount(PAGE_TEXT_MAX) })
    : empty
      ? t('text.emptyDraft')
      : t('text.editingHint');

  useLayoutEffect(() => {
    const textarea = draftRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(position.current.offset, position.current.offset);
    textarea.scrollTop = position.current.top;
  }, [position]);

  function save(): void {
    if (canSave) onSave(draft);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col bg-bg"
      aria-busy={locked}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className={cn(STATUS_ROW, !valid && 'text-error')}>
        <PencilSimpleIcon
          data-icon-motion="tilt"
          size={16}
          className="shrink-0"
          aria-hidden="true"
        />
        <p id={`${draftId}-hint`} className="truncate">
          {message}
        </p>
      </div>
      <label htmlFor={draftId} className="sr-only">
        {t('text.editLabel', { pageNumber: page.page_number })}
      </label>
      <div className={EDIT_SURFACE}>
        <textarea
          id={draftId}
          ref={draftRef}
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            onDirtyChange(next !== original);
          }}
          onScroll={(event) => onScrollPosition(event.currentTarget.scrollTop)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              if (!event.nativeEvent.isComposing) save();
            }
          }}
          disabled={locked}
          spellCheck
          aria-invalid={!valid}
          aria-describedby={`${draftId}-hint ${draftId}-count`}
          className={cn(
            TEXT_BODY,
            TEXT_SCROLL,
            'resize-none border-0 bg-transparent outline-none disabled:opacity-60',
          )}
        />
      </div>
      <div className={cn(FOOTER, 'h-auto min-h-[4.25rem] flex-wrap py-3')}>
        <div className="mr-auto min-w-0 basis-full @sm/app:basis-auto">
          <p className="text-xs text-fg-2">{dirty ? t('text.dirtyState') : t('text.savedState')}</p>
          <p
            id={`${draftId}-count`}
            className={cn(
              'whitespace-nowrap text-[11px] tabular-nums',
              tooLong ? 'text-error' : 'text-fg-3',
            )}
          >
            {t('text.counter', {
              current: formatCount(draft.length),
              max: formatCount(PAGE_TEXT_MAX),
            })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={QUIET_ACTION}
          onClick={onCancel}
          disabled={locked}
        >
          {t('buttons.cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          className="rounded-[6px] pointer-coarse:min-h-11"
          loading={saving}
          disabled={!canSave}
        >
          {t('buttons.save')}
        </Button>
      </div>
    </form>
  );
}

/** Lectura y edición ocupan el mismo espacio del panel, incluido su pie. */
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
  onDirtyChange,
}: Readonly<{
  page: ManualDetailPage;
  pageCount: number;
  needle: string;
  activeMatch: number | null;
  editing: boolean;
  showConfidence: boolean;
  busy: boolean;
  saving: boolean;
  reprocessing: boolean;
  onCancelEdit: () => void;
  onSave: (text: string) => void;
  onReprocessPage: () => void;
  onDirtyChange: (dirty: boolean) => void;
}>) {
  const { t } = useTranslation('manual');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const status = pageStatus(page);
  const StatusIcon = status.Icon;
  const scrollRef = useRef<HTMLDivElement>(null);
  const position = useRef<ReadingPosition>({ top: 0, offset: 0 });
  const text = pageText(page);
  const matches = useMemo(() => searchRanges(text, needle), [text, needle]);
  const empty = text.trim().length === 0;
  const failed = status.key === 'failed';
  const unavailable = empty || failed;
  const useConfidence = showConfidence && page.ocr_lines.some((line) => line.confidence != null);

  useLayoutEffect(() => {
    if (!editing && scrollRef.current) scrollRef.current.scrollTop = position.current.top;
  }, [editing]);

  useEffect(() => {
    revealActiveMatch(scrollRef.current, reducedMotion);
  }, [activeMatch, needle, page.page_number, reducedMotion]);

  if (editing) {
    return (
      <EditBox
        page={page}
        saving={saving}
        busy={busy}
        position={position}
        onCancel={onCancelEdit}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
        onScrollPosition={(top) => {
          position.current.top = top;
        }}
      />
    );
  }

  let offset = 0;
  const showRecovery = failed || status.key === 'low';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className={STATUS_ROW}>
        <Tooltip content={status.tip} touch>
          <button
            type="button"
            className="inline-flex min-w-0 cursor-help items-center gap-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={status.label}
          >
            <StatusIcon
              size={14}
              aria-hidden="true"
              className={cn('shrink-0', STATUS_FG_CLASS[status.tone])}
            />
            <span className="truncate">{status.label}</span>
          </button>
        </Tooltip>
      </div>
      <article
        aria-label={t('page.articleLabel', { pageCount, pageNumber: page.page_number })}
        className="min-h-0 flex-1 overflow-hidden px-5 sm:px-7"
      >
        <div
          ref={scrollRef}
          className={cn(TEXT_BODY, TEXT_SCROLL, unavailable && 'pe-0')}
          onScroll={(event) => {
            const scroller = event.currentTarget;
            position.current.top = scroller.scrollTop;
            const top = scroller.getBoundingClientRect().top;
            const row = Array.from(
              scroller.querySelectorAll<HTMLElement>('[data-text-offset]'),
            ).find((element) => element.getBoundingClientRect().bottom > top);
            position.current.offset = Number(row?.dataset.textOffset ?? 0);
          }}
        >
          {unavailable ? (
            <EmptyPageContent status={status} />
          ) : (
            page.ocr_lines.map((line, index) => {
              const lineOffset = offset;
              const tone = line.confidence == null ? null : confidenceTone(line.confidence).tone;
              offset += line.text.length + 1;
              return (
                <div key={index} data-text-offset={lineOffset} className="relative min-h-[1lh]">
                  <p className="min-h-[1lh]">
                    {/* La tinta sigue cada tramo sin añadir espacio ni cambiar sus saltos. */}
                    <span
                      className={cn(
                        'box-decoration-clone rounded-[3px] transition-[background-color] duration-150 ease-out motion-reduce:transition-none',
                        useConfidence && tone ? CONFIDENCE_HIGHLIGHT[tone] : 'bg-transparent',
                      )}
                    >
                      <CorrectionText
                        line={line}
                        lineStart={lineOffset}
                        search={matches}
                        activeIndex={activeMatch}
                        correctionLabel={(correction) =>
                          correction.original
                            ? t('text.correctionPreviously', { original: correction.original })
                            : t('text.correctionAdded')
                        }
                      />
                    </span>
                  </p>
                  <div
                    aria-hidden={!useConfidence}
                    inert={!useConfidence}
                    className={cn(
                      'absolute -end-14 top-0 w-12 transition-opacity duration-150 motion-reduce:transition-none',
                      useConfidence ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    <ConfidenceValue confidence={line.confidence} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </article>
      <div className={FOOTER}>
        <p className="mr-auto min-w-0 truncate text-xs tabular-nums text-fg-3">
          {t('text.characterCount', {
            count: text.length,
            formattedCount: formatCount(text.length),
          })}
        </p>
        {showRecovery ? (
          <Button
            size="sm"
            variant="ghost"
            className={QUIET_ACTION}
            loading={reprocessing}
            disabled={busy || saving}
            onClick={onReprocessPage}
          >
            <ArrowClockwiseIcon data-icon-motion="rotate" size={16} aria-hidden="true" />
            {t('buttons.readAgain')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
