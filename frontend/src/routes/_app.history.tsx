import { createFileRoute, Link } from '@tanstack/react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  WarningIcon,
  CheckIcon,
  EyeSlashIcon,
  CircleNotchIcon,
  FileTextIcon,
  ImageIcon,
  LockSimpleIcon,
  PlusIcon,
  ArrowsClockwiseIcon,
  ScrollIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  UsersThreeIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react';
import { TrashIcon } from '@/shared/components/action-icons';
import { Fragment, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpIndicator, type HelpTone } from '@/components/ui/help-indicator';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Meeple } from '@/shared/components/Brand';
import { RecoveryContent } from '@/shared/components/recovery/RecoveryContent';
import recoveryStyles from '@/shared/components/recovery/recovery.module.css';
import { GameCover } from '@/features/games/GameCover';
import { LibraryDiceIcon } from '@/features/games/LibraryDiceIcon';
import { GameJumpSearch } from '@/features/games/GameJumpSearch';
import { myGamesQueryOptions } from '@/features/games/use-games';
import {
  manualsQueryOptions,
  useDeleteManual,
  useManualProgress,
  useProcessingManuals,
} from '@/features/manual/use-manuals';
import { DuplicatePagesBadge } from '@/features/manual/DuplicatePagesBadge';
import { ManualThumbnail } from '@/features/manual/ManualThumbnail';
import { HelpMenuButton } from '@/features/tutorial/HelpMenu';
import { tourTarget } from '@/features/tutorial/targets';
import { useTutorialViews } from '@/features/tutorial/views';
import { Spinner } from '@/components/ui/spinner';
import { type ManualStatus, type ManualSummary } from '@/shared/api/client';
import { type MyGame, type MyGamesResponse } from '@/shared/api/games';
import { cn } from '@/shared/lib/cn';
import { gameColor } from '@/shared/lib/gameColor';
import { formatRelative, formatShortDate } from '@/shared/lib/relativeDate';

export const Route = createFileRoute('/_app/history')({
  component: HistoryScreen,
});

type View = 'games' | 'manuals';
type StatusTranslate = (
  key:
    | 'status.active'
    | 'status.failed'
    | 'status.hidden'
    | 'status.indexing'
    | 'status.pendingReview'
    | 'statusHelp.active'
    | 'statusHelp.failed'
    | 'statusHelp.hidden'
    | 'statusHelp.indexing'
    | 'statusHelp.pendingReview',
) => string;

const GAME_GRID =
  'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,208px),1fr))]';
const MANUAL_GRID =
  'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]';

function HistoryScreen() {
  const { t } = useTranslation('library');
  const [view, setView] = useState<View>('games');
  const [manualQuery, setManualQuery] = useState('');
  const games = useQuery(myGamesQueryOptions());
  const manuals = useQuery(manualsQueryOptions());
  const activeQuery = view === 'games' ? games : manuals;
  const loading = activeQuery.isPending && activeQuery.errorUpdateCount === 0;

  const gameItems = games.data?.games ?? [];
  const manualItems = manuals.data ?? [];
  useTutorialViews(
    'library',
    view,
    setView,
    {
      games: gameItems.length > 0 ? ['library-search', 'library-game-card'] : ['library-empty'],
      manuals:
        manualItems.length === 0
          ? ['library-empty']
          : filterManuals(manualItems, manualQuery).length > 0
            ? ['library-search', 'library-manual-card']
            : ['library-search'],
    },
    !games.isPending && !manuals.isPending,
  );

  return (
    <div className="page-frame page-stack">
      <div className="flex items-start justify-between gap-3">
        <h1 className="page-title">{t('title')}</h1>
        <HelpMenuButton className="-mr-2 md:hidden" />
      </div>

      <div className="flex flex-col gap-3 @2xl/app:flex-row @2xl/app:items-center @2xl/app:gap-4">
        {/* Espera al resultado de la consulta para incluir los pasos disponibles. */}
        <div
          className="grid"
          data-tour-view={view}
          {...(loading ? {} : tourTarget('library-tabs'))}
        >
          <SegmentedControl
            className="[&_[role=radio]]:min-h-9"
            value={view}
            onChange={setView}
            ariaLabel={t('tabs.ariaLabel')}
            options={[
              {
                value: 'games',
                label: t('tabs.games'),
                icon: <LibraryDiceIcon />,
                count: games.data?.games.length,
              },
              {
                value: 'manuals',
                label: t('tabs.manuals'),
                icon: <ScrollIcon aria-hidden="true" />,
                count: manuals.data?.length,
              },
            ]}
          />
        </div>
        <div className="@2xl/app:ml-auto @2xl/app:w-80">
          {view === 'games' && gameItems.length > 0 ? <GameJumpSearch games={gameItems} /> : null}
          {view === 'manuals' && manualItems.length > 0 ? (
            <ManualFilter value={manualQuery} onChange={setManualQuery} />
          ) : null}
        </div>
      </div>

      <SkeletonSwap
        key={view}
        pending={loading}
        skeleton={
          <div className={view === 'games' ? GAME_GRID : MANUAL_GRID}>
            {[0, 1, 2, 3].map((i) =>
              view === 'games' ? <GameSkeleton key={i} /> : <ManualSkeleton key={i} />,
            )}
          </div>
        }
      >
        {view === 'games' ? (
          <GamesView query={games} />
        ) : (
          <ManualsView query={manuals} filter={manualQuery} />
        )}
      </SkeletonSwap>
    </div>
  );
}

function GamesView({ query }: Readonly<{ query: UseQueryResult<MyGamesResponse> }>) {
  if (query.data === undefined && query.errorUpdateCount > 0) {
    return (
      <LibError tab="games" onRetry={() => void query.refetch()} retrying={query.isFetching} />
    );
  }
  const games = query.data?.games ?? [];
  if (games.length === 0) return <LibEmpty tab="games" />;
  return (
    <div className={GAME_GRID}>
      {games.map((game) => (
        <GameShelfCard key={game.id} game={game} />
      ))}
    </div>
  );
}

function filterManuals(
  manuals: readonly ManualSummary[],
  filter: string,
): readonly ManualSummary[] {
  const term = filter.trim().toLowerCase();
  return term
    ? manuals.filter((manual) => (manual.title ?? manual.game_name).toLowerCase().includes(term))
    : manuals;
}

function ManualsView({
  query,
  filter,
}: Readonly<{ query: UseQueryResult<ManualSummary[]>; filter: string }>) {
  const { t } = useTranslation('library');
  const del = useDeleteManual();
  if (query.data === undefined && query.errorUpdateCount > 0) {
    return (
      <LibError tab="manuals" onRetry={() => void query.refetch()} retrying={query.isFetching} />
    );
  }
  const manuals = query.data ?? [];
  if (manuals.length === 0) return <LibEmpty tab="manuals" />;

  const shown = filterManuals(manuals, filter);
  if (shown.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-fg-2">
        {t('manualSearch.noResults', { query: filter.trim() })}
      </p>
    );
  }
  return (
    <div className={MANUAL_GRID}>
      {shown.map((manual) => (
        <ManualDocCard key={manual.id} manual={manual} onDelete={() => del.mutate(manual.id)} />
      ))}
    </div>
  );
}

function GameShelfCard({ game }: Readonly<{ game: MyGame }>) {
  const { t } = useTranslation('library');
  const { gameIds, processingByGame } = useProcessingManuals();
  const processing = gameIds.has(game.id);
  const progress = useManualProgress(processingByGame.get(game.id));
  return (
    <Link
      to="/game/$gameId"
      params={{ gameId: game.id }}
      aria-label={t(processing ? 'aria.openGameProcessing' : 'aria.openGame', { game: game.name })}
      {...tourTarget('library-game-card')}
      className={cn(
        'game-shelf-card flex flex-col overflow-hidden rounded-[18px] border border-border bg-card text-left shadow-xs',
        'hover:border-border-strong',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
      )}
    >
      <div className="flex justify-center px-5 pt-5">
        <div className="shelf-cover">
          <GameCover name={game.name} size={132} radius={16} processing={processing} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-[18px] pb-[18px] pt-4">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-[19px] font-extrabold tracking-[-0.02em] text-fg">
            {game.name}
          </span>
          {game.year_published === null ? null : (
            <span className="mono shrink-0 text-[11px] text-fg-3">{game.year_published}</span>
          )}
        </div>
        {processing ? (
          <div className="mt-1 flex flex-col gap-[7px]">
            <div className="flex items-center gap-2">
              <Spinner size={14} className="text-primary" />
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-fg" aria-live="polite">
                {t('gameCard.processing')}
              </span>
              <span className="mono text-[11px] font-bold tabular-nums text-primary-700">
                {progress?.pct ?? 0}%
              </span>
            </div>
            <ProgressBar pct={progress?.pct ?? 0} />
            <span className="mono text-[10.5px] tracking-[0.06em] text-fg-3 uppercase">
              {progress
                ? t('gameCard.progress.page', { page: progress.page, total: progress.total })
                : t('gameCard.progress.available')}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[13px] text-fg-2">
              <span className="inline-flex items-center gap-[5px]">
                <ScrollIcon size={13} className="text-fg-3" aria-hidden="true" />
                {t('gameCard.manuals', { count: game.manuals_count })}
              </span>
              <Dot />
              <span className="inline-flex items-center gap-[5px]">
                <SparkleIcon size={13} className="text-fg-3" aria-hidden="true" />
                {t('gameCard.chats', { count: game.conversations_count })}
              </span>
            </div>
            <div className="mono mt-1.5 text-[10.5px] uppercase tracking-[0.08em] text-fg-3">
              {t('gameCard.activity', { relative: formatRelative(game.last_activity_at) })}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

function ManualDocCard({
  manual,
  onDelete,
}: Readonly<{ manual: ManualSummary; onDelete: () => void }>) {
  const { t } = useTranslation('library');
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const indexing = manual.status === 'indexing';
  const progress = useManualProgress(indexing ? manual.id : undefined);
  const isPdf = manual.source_type === 'pdf';
  const name = manual.title ?? manual.game_name;

  const meta: ReactElement[] = [
    <span key="format" className="inline-flex items-center gap-1 uppercase">
      {isPdf ? (
        <FileTextIcon size={12} aria-hidden="true" />
      ) : (
        <ImageIcon size={12} aria-hidden="true" />
      )}
      {isPdf ? t('manualCard.format.pdf') : t('manualCard.format.photos')}
    </span>,
    <span key="pages">{t('manualCard.pageCount', { count: manual.page_count })}</span>,
    ...(manual.status === 'active'
      ? [<span key="chunks">{t('manualCard.chunks', { count: manual.chunks_indexed })}</span>]
      : []),
    <span key="date">{formatDate(manual.created_at)}</span>,
    ...(manual.language
      ? [
          <span key="lang" className="uppercase">
            {manual.language}
          </span>,
        ]
      : []),
  ];

  return (
    <DialogPrimitive.Root open={confirming} onOpenChange={setConfirming}>
      <div
        className={cn(
          'manual-interaction relative flex gap-3.5 rounded-2xl border border-border bg-card p-3.5 shadow-xs',
          'hover:border-border-strong',
        )}
        {...tourTarget('library-manual-card')}
      >
        <ManualThumbnail
          color={gameColor(name)}
          stacked={manual.page_count > 1}
          processing={indexing}
          className="h-[66px] w-[52px] self-start"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <ManualIndicators manual={manual} />
          <Link
            to={indexing ? '/processing/$manualId' : '/manual/$manualId'}
            params={{ manualId: manual.id }}
            search={indexing ? { name } : undefined}
            aria-label={t('aria.openManual', { manual: name })}
            className="manual-open mt-[7px] truncate font-display text-[15.5px] font-bold text-fg outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:shadow-[var(--m-shadow-ring-primary)]"
          >
            {name}
          </Link>
          <div className="mt-px text-xs text-fg-3">
            {t('manualCard.manualOf', { game: manual.game_name })}
          </div>
          {manual.duplicate_page_count > 0 ? (
            <div className="mt-2">
              <DuplicatePagesBadge count={manual.duplicate_page_count} openHint />
            </div>
          ) : null}
          {indexing ? (
            <div className="mt-auto pt-[10px]">
              <div className="mb-[5px] flex items-center justify-between">
                <span
                  className="mono text-[10.5px] font-semibold tracking-[0.04em] text-fg-2 uppercase"
                  aria-live="polite"
                >
                  {t('manualCard.progress.page', {
                    page: progress?.page ?? 1,
                    total: manual.page_count,
                  })}
                </span>
                <span className="mono text-[10.5px] font-bold tabular-nums text-primary-700">
                  {progress?.pct ?? 0}%
                </span>
              </div>
              <ProgressBar pct={progress?.pct ?? 0} />
            </div>
          ) : (
            <div className="mono mt-auto flex flex-wrap items-center gap-2 pt-[9px] text-[10.5px] tracking-[0.04em] text-fg-3">
              {meta.map((node, i) => (
                <Fragment key={node.key}>
                  {i > 0 ? <Dot /> : null}
                  {node}
                </Fragment>
              ))}
            </div>
          )}
        </div>

        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={t('aria.deleteManual', { manual: name })}
            className="icon-feedback relative z-10 grid size-11 shrink-0 self-start place-items-center rounded-lg text-fg-3 transition-colors hover:text-error"
          >
            <TrashIcon size={17} className="relative -top-1.5 [@media(pointer:coarse)]:top-0" />
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Content
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          className="feedback-fade absolute inset-0 z-20 flex flex-col justify-center gap-3 rounded-2xl border border-error bg-error-bg p-3 outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {t('aria.confirmDeletion')}
          </DialogPrimitive.Title>
          <div className="flex items-center gap-3">
            <WarningIcon size={20} className="shrink-0 text-error" aria-hidden="true" />
            <DialogPrimitive.Description asChild>
              <span className="min-w-0 flex-1 text-[13.5px] font-medium text-fg">
                {t('manualCard.deleteConfirm', { game: manual.game_name })}
              </span>
            </DialogPrimitive.Description>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              ref={cancelRef}
              size="sm"
              className="h-11"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button size="sm" className="h-11" variant="destructive" onClick={onDelete}>
              {t('actions.delete')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Root>
  );
}

function ManualIndicators({ manual }: Readonly<{ manual: ManualSummary }>) {
  const { t } = useTranslation('library');
  const st = manualStatusView(manual.status, t);
  const indexing = manual.status === 'indexing';

  return (
    <div className="relative top-1 -ml-[7px] -mt-1 flex flex-wrap items-center gap-0.5">
      <HelpIndicator
        tone={st.tone}
        icon={st.icon}
        label={st.help}
        iconClassName={indexing ? 'animate-spin' : undefined}
      >
        {indexing || manual.status === 'failed' ? st.label : null}
      </HelpIndicator>
      <HelpIndicator
        icon={manual.visibility === 'shared' ? UsersThreeIcon : LockSimpleIcon}
        label={
          manual.visibility === 'shared'
            ? t('manualCard.visibility.sharedHelp')
            : t('manualCard.visibility.privateHelp')
        }
      />
    </div>
  );
}

function ManualFilter({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (next: string) => void }>) {
  const { t } = useTranslation('library');
  return (
    <div
      className="search-feedback flex h-11 w-full items-center gap-2.5 rounded-2xl border border-border-strong bg-bg px-3.5 transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20"
      {...tourTarget('library-search')}
    >
      <MagnifyingGlassIcon
        data-icon-motion="search"
        size={20}
        className="shrink-0 text-fg-3"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('manualSearch.placeholder')}
        aria-label={t('manualSearch.inputAriaLabel')}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('manualSearch.clear')}
          className="icon-feedback grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:text-fg-2"
        >
          <XIcon size={14} className="search-clear-icon" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function LibEmpty({ tab }: Readonly<{ tab: View }>) {
  const { t } = useTranslation('library');
  const copy =
    tab === 'games'
      ? { hint: t('empty.games.hint'), title: t('empty.games.title') }
      : { hint: t('empty.manuals.hint'), title: t('empty.manuals.title') };
  return (
    <div
      className="mt-2 flex flex-col items-center gap-1.5 rounded-[20px] border-[1.5px] border-dashed border-border-strong bg-surface px-6 py-[52px] text-center"
      {...tourTarget('library-empty')}
    >
      <div className="mb-2 flex items-end gap-1.5">
        <span className="rotate-[-12deg] opacity-30">
          <Meeple size={28} color="var(--m-text-3)" />
        </span>
        <span className="grid size-14 place-items-center rounded-[15px] bg-primary text-fg-inv shadow-md">
          <Meeple size={30} color="#FFF8F0" />
        </span>
        <span className="rotate-[12deg] opacity-30">
          <Meeple size={28} color="var(--m-text-3)" />
        </span>
      </div>
      <h2 className="font-display text-[19px] font-bold text-fg">{copy.title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-fg-2">{copy.hint}</p>
      {/* Juegos se nutre de seguir (Explorar). Subir manual va solo en Manuales. */}
      {tab === 'games' ? (
        <Button asChild size="lg" className="mt-3.5">
          <Link to="/explore">
            <MagnifyingGlassIcon data-icon-motion="search" aria-hidden="true" size={20} />
            {t('actions.exploreGames')}
          </Link>
        </Button>
      ) : (
        <Button asChild size="lg" className="mt-3.5">
          <Link to="/capture/source">
            <PlusIcon data-icon-motion="plus" aria-hidden="true" size={18} />
            {t('actions.uploadManual')}
          </Link>
        </Button>
      )}
    </div>
  );
}

function LibError({
  tab,
  onRetry,
  retrying,
}: Readonly<{ tab: View; onRetry: () => void; retrying: boolean }>) {
  const { t } = useTranslation('library');
  const { t: shellT } = useTranslation('shell');
  return (
    <RecoveryContent
      headingLevel={2}
      title={t('error.title')}
      description={t(tab === 'games' ? 'error.description.games' : 'error.description.manuals')}
      retrying={retrying}
    >
      <div className={recoveryStyles.actions}>
        <Button className={recoveryStyles.primary} loading={retrying} onClick={onRetry}>
          <ArrowsClockwiseIcon data-icon-motion="rotate" size={18} aria-hidden="true" />
          {shellT('recovery.retry')}
        </Button>
      </div>
    </RecoveryContent>
  );
}

function GameSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card px-[18px] pb-[18px] pt-5">
      <div className="mx-auto size-[132px] animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-[19px] w-3/5 animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="h-2.5 w-2/5 animate-pulse rounded bg-surface-2" />
    </div>
  );
}

function ManualSkeleton() {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-border bg-card p-3.5">
      <div className="h-[66px] w-[52px] shrink-0 animate-pulse rounded-[9px] bg-surface-2" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex gap-1.5">
          <div className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
        </div>
        <div className="h-[15px] w-1/2 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-border-strong">
      ·
    </span>
  );
}

/** Barra de progreso de indexado, relleno degradado. Decorativa. El progreso
 *  real lo anuncia el texto "LEYENDO PÁGINA X DE Y · %" (con aria-live) al lado,
 *  así que la barra es solo visual y no duplica el rol progressbar. */
function ProgressBar({ pct }: Readonly<{ pct: number }>) {
  return (
    <div aria-hidden="true" className="h-[5px] overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-500 transition-[width] duration-[120ms] ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function manualStatusView(
  status: ManualStatus,
  t: StatusTranslate,
): { tone: HelpTone; label: string; help: string; icon: Icon } {
  switch (status) {
    case 'active':
      return {
        tone: 'success',
        label: t('status.active'),
        help: t('statusHelp.active'),
        icon: CheckIcon,
      };
    case 'indexing':
      return {
        tone: 'neutral',
        label: t('status.indexing'),
        help: t('statusHelp.indexing'),
        icon: CircleNotchIcon,
      };
    case 'failed':
      return {
        tone: 'danger',
        label: t('status.failed'),
        help: t('statusHelp.failed'),
        icon: WarningIcon,
      };
    case 'pending_review':
      // OCR dudoso en alguna página (fallo o baja confianza). No es moderación,
      // avisa de que conviene repasar el texto. Ámbar + triángulo = "algo pasa".
      return {
        tone: 'warning',
        label: t('status.pendingReview'),
        help: t('statusHelp.pendingReview'),
        icon: WarningIcon,
      };
    default:
      return {
        tone: 'neutral',
        label: t('status.hidden'),
        help: t('statusHelp.hidden'),
        icon: EyeSlashIcon,
      };
  }
}

function formatDate(iso: string): string {
  return formatShortDate(iso);
}
