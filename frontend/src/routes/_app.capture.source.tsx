import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CaretDownIcon,
  CaretUpIcon,
  FileTextIcon,
  ImageIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  UserIcon,
  UsersThreeIcon,
  type Icon,
} from '@phosphor-icons/react';
import { TrashIcon, CameraIcon } from '@/shared/components/action-icons';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GameTypeahead, SelectedGameChip } from '@/features/upload/GameTypeahead';
import { gameDetailKey, gameDetailQueryOptions, myGamesKey } from '@/features/games/use-games';
import { manualsKey } from '@/features/manual/use-manuals';
import { tourTarget } from '@/features/tutorial/targets';
import { api, isAbortApiError, type GameSearchItem } from '@/shared/api/client';
import type { GameDetail } from '@/shared/api/games';
import { cn } from '@/shared/lib/cn';
import { toastApiError } from '@/shared/lib/toastApiError';
import { LiveTrans } from '@/shared/components/LiveTrans';

export const Route = createFileRoute('/_app/capture/source')({
  // "gameId" opcional. Si entras desde el hub de un juego, llega preseleccionado.
  validateSearch: (search: Record<string, unknown>): { gameId?: string } => ({
    gameId: typeof search.gameId === 'string' && search.gameId ? search.gameId : undefined,
  }),
  component: NewManualScreen,
});

const MB = 1_000_000;
const MAX_IMAGE_MB = 30;
const MAX_PDF_MB = 95;
const MAX_TOTAL_MB = 95;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * MB;
const MAX_PDF_BYTES = MAX_PDF_MB * MB;
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * MB;
const MAX_PAGES = 30;
const MAX_TITLE_LENGTH = 255;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Mode = 'images' | 'pdf';
type UploadPage = Readonly<{ id: string; file: File }>;
type CreateManualVariables = Readonly<{
  game: GameSearchItem;
  title: string;
  pages: File[];
  mode: Mode;
  visibility: 'shared' | 'private';
  anonymous: boolean;
}>;

function deriveUploadMode(pages: readonly UploadPage[]): Mode | null {
  const firstPage = pages[0];
  if (!firstPage) return null;
  return firstPage.file.type === 'application/pdf' ? 'pdf' : 'images';
}

/** Reduce el detalle del hub a la forma que consume el paso 1. */
function toGameSearchItem(detail: GameDetail): GameSearchItem {
  return {
    id: detail.id,
    name: detail.name,
    bgg_id: detail.bgg_id,
    year_published: detail.year_published,
    manuals_count: detail.manuals.length,
  };
}

function NewManualScreen() {
  const { t } = useTranslation('capture');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { gameId } = Route.useSearch();
  // Juego de origen (si entras desde su hub) preseleccionado. Solo valor inicial.
  const presetDetail = useQuery({
    ...gameDetailQueryOptions(gameId ?? ''),
    enabled: Boolean(gameId),
  });
  const presetGame = presetDetail.data ? toGameSearchItem(presetDetail.data) : null;
  // "undefined" ⇒ usa el preseleccionado. Al elegir o quitar, manda tu elección.
  const [chosenGame, setChosenGame] = useState<GameSearchItem | null | undefined>(undefined);
  const game = chosenGame === undefined ? presetGame : chosenGame;
  const [pages, setPages] = useState<UploadPage[]>([]);
  // Un manual usa imágenes XOR un PDF, nunca ambos.
  const mode = deriveUploadMode(pages);
  // Compartir con la comunidad. Activado por defecto (manda visibility 'shared').
  const [share, setShare] = useState(true);
  const [showName, setShowName] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const suggestedTitle =
    game === null ? '' : t('name.suggested', { gameName: game.name }).slice(0, MAX_TITLE_LENGTH);

  const cameraInputId = useId();
  const titleInputId = useId();
  const titleHelpId = useId();
  const galleryInputId = useId();
  const pdfInputId = useId();

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const mutation = useMutation({
    mutationFn: (input: CreateManualVariables) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      if (input.mode === 'pdf') {
        return api.createManual(
          {
            title: input.title,
            gameId: input.game.id,
            pdf: input.pages[0]!,
            visibility: input.visibility,
            anonymous: input.anonymous,
          },
          signal,
        );
      }
      return api.createManual(
        {
          title: input.title,
          gameId: input.game.id,
          images: input.pages,
          visibility: input.visibility,
          anonymous: input.anonymous,
        },
        signal,
      );
    },
    onError: (err) => {
      if (isAbortApiError(err)) return;
      toastApiError(err, 'mutation-error', {
        title: <LiveTrans ns="capture" i18nKey="feedback.unexpected.title" />,
        id: 'mutation-error-unknown',
        description: <LiveTrans ns="capture" i18nKey="feedback.unexpected.description" />,
      });
    },
    onSuccess: (data, input) => {
      // Subir un manual sigue el juego en el backend. Refresca detalle y biblioteca.
      qc.invalidateQueries({ queryKey: gameDetailKey(data.game_id) }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: myGamesKey }).catch(() => undefined);
      // Y la lista de manuales. Alimenta las ruletas contextuales (portada/tarjeta),
      // que si no, no se enteran de que el nuevo manual está indexándose.
      qc.invalidateQueries({ queryKey: manualsKey }).catch(() => undefined);
      navigate({
        to: '/processing/$manualId',
        params: { manualId: data.manual_id },
        search: { name: input.game.name },
      }).catch(() => undefined);
    },
  });

  function submitManual(): void {
    if (busy) return;
    if (game === null) {
      toast.warning(<LiveTrans ns="capture" i18nKey="feedback.chooseGame.title" />, {
        description: <LiveTrans ns="capture" i18nKey="feedback.chooseGame.description" />,
      });
      return;
    }
    if (mode === null || pages.length === 0) {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.addPages.title" />, {
        description: <LiveTrans ns="capture" i18nKey="validation.addPages.description" />,
      });
      return;
    }
    mutation.mutate({
      game,
      title: titleDraft.trim() || suggestedTitle,
      pages: pages.map((page) => page.file),
      mode,
      visibility: share ? 'shared' : 'private',
      anonymous: share ? !showName : true,
    });
  }

  function addImages(incoming: File[]): void {
    if (incoming.length === 0) return;
    if (mode === 'pdf') {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.pdfAlreadyAdded.title" />, {
        description: <LiveTrans ns="capture" i18nKey="validation.pdfAlreadyAdded.description" />,
      });
      return;
    }
    const valid = incoming.filter((file) => IMAGE_TYPES.has(file.type));
    if (valid.length < incoming.length) {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.unsupportedImage.title" />, {
        description: <LiveTrans ns="capture" i18nKey="validation.unsupportedImage.description" />,
      });
    }
    if (valid.some((file) => file.size > MAX_IMAGE_BYTES)) {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.imageTooLarge.title" />, {
        description: (
          <LiveTrans
            ns="capture"
            i18nKey="validation.imageTooLarge.description"
            values={{ max: MAX_IMAGE_MB }}
          />
        ),
      });
      return;
    }
    const next = [...pages.map((page) => page.file), ...valid];
    if (next.length > MAX_PAGES) {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.tooManyPages.title" />, {
        description: (
          <LiveTrans
            ns="capture"
            i18nKey="validation.tooManyPages.description"
            values={{ max: MAX_PAGES }}
          />
        ),
      });
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.totalTooLarge.title" />, {
        description: (
          <LiveTrans
            ns="capture"
            i18nKey="validation.totalTooLarge.description"
            values={{ max: MAX_TOTAL_MB }}
          />
        ),
      });
      return;
    }
    setPages([...pages, ...valid.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function addPdf(file: File | undefined): void {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.unsupportedPdf.title" />, {
        description: <LiveTrans ns="capture" i18nKey="validation.unsupportedPdf.description" />,
      });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.warning(<LiveTrans ns="capture" i18nKey="validation.pdfTooLarge.title" />, {
        description: (
          <LiveTrans
            ns="capture"
            i18nKey="validation.pdfTooLarge.description"
            values={{ max: MAX_PDF_MB }}
          />
        ),
      });
      return;
    }
    setPages([{ id: crypto.randomUUID(), file }]);
  }

  function removePage(index: number): void {
    setPages((current) => current.filter((_, i) => i !== index));
  }

  function movePage(index: number, delta: -1 | 1): void {
    setPages((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [page] = next.splice(index, 1);
      if (!page) return current;
      next.splice(target, 0, page);
      return next;
    });
  }

  const ready = game !== null && mode !== null && pages.length > 0;
  const busy = mutation.isPending;
  const ctaLabel = ready
    ? mode === 'pdf'
      ? t('actions.processPdf')
      : t('actions.processPages', { count: pages.length })
    : t('actions.process');

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar crumb={t('title')} />

      <div className="page-frame grid flex-1 grid-cols-1 content-start gap-8 py-6 @3xl/app:grid-cols-2 @3xl/app:gap-10 lg:py-8">
        <section className="flex flex-col gap-5">
          <StepHeader n={1} title={t('steps.game')} done={game !== null} />
          <div {...tourTarget('upload-game')}>
            {game ? (
              <SelectedGameChip game={game} onChange={() => setChosenGame(null)} />
            ) : (
              <GameTypeahead onSelect={setChosenGame} focusOnMount />
            )}
          </div>
          <p className="text-sm leading-relaxed text-fg-2">{t('game.description')}</p>
          {game ? (
            <div {...tourTarget('upload-name')}>
              <label
                htmlFor={titleInputId}
                className="mb-1.5 block px-3.5 text-sm font-semibold text-fg"
              >
                {t('name.label')}
              </label>
              <Input
                id={titleInputId}
                name="title"
                className="h-12 rounded-2xl"
                value={titleDraft}
                maxLength={MAX_TITLE_LENGTH}
                placeholder={suggestedTitle}
                aria-describedby={titleHelpId}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="done"
                disabled={busy}
                onChange={(event) => setTitleDraft(event.target.value)}
              />
              <p id={titleHelpId} className="mt-1.5 px-3.5 text-xs leading-relaxed text-fg-3">
                {t('name.help')}
              </p>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <StepHeader n={2} title={t('steps.pages')} done={pages.length > 0} />
          <div
            className="grid grid-cols-1 gap-2.5 max-md:grid-cols-3 @sm/app:grid-cols-3"
            {...tourTarget('upload-sources')}
          >
            <SourceFileControl
              inputId={cameraInputId}
              icon={<CameraIcon size={19} />}
              label={t('sources.camera.label')}
              sub={t('sources.camera.description')}
              disabled={busy || game === null || mode === 'pdf'}
              input={{
                accept: 'image/jpeg,image/png,image/webp',
                ariaLabel: t('sources.camera.ariaLabel'),
                capture: 'environment',
                testId: 'picker-camera',
                onChange: (event) => {
                  addImages(Array.from(event.target.files ?? []));
                  event.target.value = '';
                },
              }}
            />
            <SourceFileControl
              inputId={galleryInputId}
              icon={<ImageIcon aria-hidden="true" size={19} />}
              label={t('sources.gallery.label')}
              sub={t('sources.gallery.description')}
              disabled={busy || game === null || mode === 'pdf'}
              input={{
                accept: 'image/jpeg,image/png,image/webp',
                ariaLabel: t('sources.gallery.ariaLabel'),
                multiple: true,
                testId: 'picker-gallery',
                onChange: (event) => {
                  addImages(Array.from(event.target.files ?? []));
                  event.target.value = '';
                },
              }}
            />
            <SourceFileControl
              inputId={pdfInputId}
              icon={<FileTextIcon aria-hidden="true" size={19} />}
              label={t('sources.pdf.label')}
              sub={t('sources.pdf.description')}
              disabled={busy || game === null || mode === 'images'}
              input={{
                accept: 'application/pdf',
                ariaLabel: t('sources.pdf.ariaLabel'),
                testId: 'picker-pdf',
                onChange: (event) => {
                  addPdf(event.target.files?.[0]);
                  event.target.value = '';
                },
              }}
            />
          </div>

          {pages.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-sm text-fg-3">
              {t('empty.pages')}
            </p>
          ) : (
            <div
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
              {...tourTarget('upload-pages')}
            >
              <PageCounter count={pages.length} mode={mode} />
              <ul className="flex flex-col gap-2">
                {pages.map(({ id, file }, index) => (
                  <PageRow
                    key={id}
                    file={file}
                    index={index}
                    total={pages.length}
                    mode={mode}
                    disabled={busy || game === null}
                    onMove={movePage}
                    onRemove={removePage}
                  />
                ))}
              </ul>
            </div>
          )}

          <div {...tourTarget('upload-share')}>
            <ShareToggle checked={share} onChange={setShare} disabled={busy || game === null} />
          </div>
          {share ? (
            <ShareOptions
              showName={showName}
              onShowNameChange={setShowName}
              disabled={busy || game === null}
            />
          ) : null}

          <Button
            block
            size="lg"
            className="hidden md:flex"
            loading={busy}
            disabled={!ready}
            onClick={submitManual}
            {...tourTarget('upload-submit')}
          >
            <SparkleIcon aria-hidden="true" size={18} />
            {ctaLabel}
          </Button>
        </section>
      </div>

      <footer className="sticky bottom-0 border-t border-border bg-bg/95 p-4 backdrop-blur md:hidden">
        <Button
          block
          size="lg"
          loading={busy}
          disabled={!ready}
          onClick={submitManual}
          {...tourTarget('upload-submit')}
        >
          <SparkleIcon aria-hidden="true" size={18} />
          {ctaLabel}
        </Button>
      </footer>
    </div>
  );
}

function StepHeader({ n, title, done }: Readonly<{ n: number; title: string; done: boolean }>) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold text-fg-inv',
          done ? 'bg-success' : 'bg-primary',
        )}
        aria-hidden="true"
      >
        {done ? '✓' : n}
      </span>
      <h2 className="font-display text-lg font-bold tracking-tight text-fg">{title}</h2>
    </div>
  );
}

/**
 * Interruptor "compartir con la comunidad". Toda la tarjeta es el control
 * (role=switch) para una zona táctil amplia. La pastilla de la derecha es decorativa.
 */
type SwitchProps = Readonly<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}>;

function ShareToggle(props: SwitchProps) {
  const { t } = useTranslation('capture');
  return (
    <OptionSwitch
      icon={UsersThreeIcon}
      label={t('consent.label')}
      description={t('consent.description')}
      ariaLabel={t('consent.ariaLabel')}
      {...props}
    />
  );
}

// El panel sigue montado para poder invertir la transición al cerrarlo.
function ShareOptions({
  showName,
  onShowNameChange,
  disabled,
}: Readonly<{ showName: boolean; onShowNameChange: (next: boolean) => void; disabled: boolean }>) {
  const { t } = useTranslation('capture');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col" {...tourTarget('upload-share-options')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-sm font-semibold text-fg-2 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-2 hover:text-fg',
        )}
      >
        <SlidersHorizontalIcon size={18} aria-hidden="true" className="shrink-0" />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span>{t('consent.options.label')}</span>
          <span className="ml-auto whitespace-nowrap text-xs font-medium text-fg-3">
            {showName ? t('consent.options.named') : t('consent.options.anonymous')}
          </span>
        </span>
        <CaretDownIcon
          size={14}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-transform duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        {/* El margen conserva el anillo de foco dentro del recorte. */}
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div
            className={cn(
              'pb-1 pt-3 transition-opacity duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
              open ? 'opacity-100' : 'opacity-0',
            )}
          >
            <OptionSwitch
              icon={UserIcon}
              label={t('consent.author.label')}
              description={t('consent.author.description')}
              ariaLabel={t('consent.author.label')}
              checked={showName}
              onChange={onShowNameChange}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionSwitch({
  icon: Icon,
  label,
  description,
  ariaLabel,
  checked,
  onChange,
  disabled,
}: SwitchProps & Readonly<{ icon: Icon; label: string; description: string; ariaLabel: string }>) {
  const helpId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={helpId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-2xl border bg-surface p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 motion-reduce:transition-none',
        checked ? 'border-primary/40' : 'border-border',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-surface-2',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl border transition-colors motion-reduce:transition-none',
          checked
            ? 'border-primary/30 bg-primary-100 text-primary-700'
            : 'border-border bg-bg text-fg-3',
        )}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-fg">{label}</span>
        <span id={helpId} className="mt-0.5 block text-xs leading-relaxed text-fg-3">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
          checked ? 'bg-primary' : 'bg-surface-2',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 shrink-0 rounded-full bg-card shadow-sm transition-[margin-inline-start] duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
            checked ? 'ms-[22px]' : 'ms-0.5',
          )}
        />
      </span>
    </button>
  );
}

function PageCounter({ count, mode }: Readonly<{ count: number; mode: Mode | null }>) {
  const { t } = useTranslation('capture');
  if (mode === 'pdf') {
    return <p className="text-sm font-semibold text-fg">{t('pages.pdfReady')}</p>;
  }
  const over = count > MAX_PAGES;
  return (
    <div className="flex items-center gap-3">
      <span className={cn('text-sm font-semibold', over ? 'text-error' : 'text-fg')}>
        {t('pages.counter', { count, max: MAX_PAGES })}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn('h-full rounded-full', over ? 'bg-error' : 'bg-primary')}
          style={{ width: `${Math.min(100, (count / MAX_PAGES) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function PageRow({
  file,
  index,
  total,
  mode,
  disabled,
  onMove,
  onRemove,
}: Readonly<{
  file: File;
  index: number;
  total: number;
  mode: Mode | null;
  disabled: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
}>) {
  const { t } = useTranslation('capture');
  const attachPreview = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return;
      const previewUrl = URL.createObjectURL(file);
      image.src = previewUrl;
      return () => URL.revokeObjectURL(previewUrl);
    },
    [file],
  );

  const isPdf = mode === 'pdf';
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-2.5 @sm/app:flex-nowrap">
      {file.type.startsWith('image/') ? (
        <img
          ref={attachPreview}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className="grid size-12 shrink-0 place-items-center rounded-lg bg-error-bg text-error"
          aria-hidden="true"
        >
          <FileTextIcon size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">
          {isPdf ? t('sources.pdf.label') : t('pages.label', { page: index + 1 })}
        </p>
        <p className="truncate text-sm font-semibold text-fg">{file.name}</p>
        <p className="mono text-xs text-fg-3">{(file.size / MB).toFixed(2)} MB</p>
      </div>
      <div className="ml-auto flex w-full shrink-0 justify-end gap-1 @sm/app:w-auto">
        {isPdf ? null : (
          <>
            <IconButton
              label={t('actions.moveUp', { page: index + 1 })}
              disabled={disabled || index === 0}
              onClick={() => onMove(index, -1)}
              icon={<CaretUpIcon data-icon-motion="up" aria-hidden="true" size={17} />}
            />
            <IconButton
              label={t('actions.moveDown', { page: index + 1 })}
              disabled={disabled || index === total - 1}
              onClick={() => onMove(index, 1)}
              icon={<CaretDownIcon data-icon-motion="down" aria-hidden="true" size={17} />}
            />
          </>
        )}
        <IconButton
          danger
          label={isPdf ? t('actions.removePdf') : t('actions.removePage', { page: index + 1 })}
          disabled={disabled}
          onClick={() => onRemove(index)}
          icon={<TrashIcon size={17} />}
        />
      </div>
    </li>
  );
}

function SourceFileControl({
  inputId,
  icon,
  label,
  sub,
  disabled,
  input,
}: Readonly<{
  inputId: string;
  icon: ReactNode;
  label: string;
  sub: string;
  disabled: boolean;
  input: {
    accept: string;
    ariaLabel: string;
    capture?: 'environment';
    multiple?: boolean;
    testId: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  };
}>) {
  return (
    <div className="relative">
      <input
        id={inputId}
        type="file"
        accept={input.accept}
        capture={input.capture}
        multiple={input.multiple}
        className="peer sr-only"
        data-testid={input.testId}
        disabled={disabled}
        onChange={input.onChange}
        aria-label={input.ariaLabel}
      />
      <label
        htmlFor={inputId}
        aria-disabled={disabled || undefined}
        className={cn(
          'icon-feedback flex min-h-[88px] max-md:h-full flex-col items-start gap-2 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-surface-2',
        )}
      >
        <span
          className="grid size-9 place-items-center rounded-xl border border-border bg-bg text-primary-700"
          data-feedback-icon="upload"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-fg">{label}</span>
          <span className="mt-0.5 block text-xs text-fg-3">{sub}</span>
        </span>
      </label>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  icon,
  danger = false,
}: Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  danger?: boolean;
}>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-9', danger && 'text-fg-3 hover:text-error')}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
