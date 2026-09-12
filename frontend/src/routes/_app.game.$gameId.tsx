import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CaretRightIcon,
  FileTextIcon,
  ArrowClockwiseIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ScreenTopBar } from '@/app/Topbar';
import { HelpIndicator } from '@/components/ui/help-indicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Tooltip } from '@/components/ui/tooltip';
import { ConversationsSection } from '@/features/conversations/ConversationsSection';
import { MessageComposer } from '@/features/conversations/MessageComposer';
import { ExplanationBlocks } from '@/features/games/ExplanationBlocks';
import { FollowButton } from '@/features/games/FollowButton';
import { GAME_HERO_COVER_CLASS, GameHeroCover } from '@/features/games/GameHeroCover';
import { DuplicatePagesBadge } from '@/features/manual/DuplicatePagesBadge';
import { ManualThumbnail } from '@/features/manual/ManualThumbnail';
import { useProcessingManuals } from '@/features/manual/use-manuals';
import { RatingStars } from '@/features/games/RatingStars';
import { RateGameDialog } from '@/features/games/RateGameDialog';
import { SuggestedQuestions } from '@/features/games/SuggestedQuestions';
import { gameDetailQueryOptions, gameExplanationQueryOptions } from '@/features/games/use-games';
import { ApiError } from '@/shared/api/client';
import { mapApiError } from '@/shared/api/error-mapper';
import { RecoveryContent } from '@/shared/components/recovery/RecoveryContent';
import recoveryStyles from '@/shared/components/recovery/recovery.module.css';
import { AddManualIcon, ExtractedTextIcon } from '@/shared/components/action-icons';
import { UploadedBy } from '@/shared/components/UploadedBy';
import {
  type ExplanationSectionKey,
  type GameDetail,
  type GamePoolManual,
} from '@/shared/api/games';
import { QUESTION_MAX } from '@/shared/api/conversations';
import { gameColor } from '@/shared/lib/gameColor';
import { formatShortDate } from '@/shared/lib/relativeDate';

export const Route = createFileRoute('/_app/game/$gameId')({
  component: GameHubScreen,
});

function GameHubScreen() {
  const { t } = useTranslation('game');
  const { gameId } = Route.useParams();
  const detail = useQuery(gameDetailQueryOptions(gameId));

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={detail.data?.name ?? t('navigation.game')}
        trail={[{ label: t('navigation.library'), link: linkOptions({ to: '/history' }) }]}
      />
      <SkeletonSwap
        pending={detail.isPending && !detail.isFetched}
        skeleton={<HubSkeleton />}
        className="grow"
      >
        {/* Un refetch fallido deja isError con data en cache: mejor lo cacheado. */}
        {detail.isFetched && detail.data === undefined ? (
          <HubError
            error={detail.error}
            retrying={detail.isFetching}
            onRetry={() => detail.refetch()}
          />
        ) : null}
        {detail.data ? <GameHubLoaded key={detail.data.id} game={detail.data} /> : null}
      </SkeletonSwap>
    </div>
  );
}

function GameHubLoaded({ game }: Readonly<{ game: GameDetail }>) {
  const { t } = useTranslation('game');
  const [rateOpen, setRateOpen] = useState(false);
  // Estrella pulsada en la cabecera: se precarga en el diálogo, no se guarda.
  const [presetScore, setPresetScore] = useState<number | null>(null);
  const canAsk = game.manuals.length > 0;
  const totalPages = game.manuals.reduce((sum, manual) => sum + manual.page_count, 0);

  function openRating(score?: number): void {
    setPresetScore(score ?? null);
    setRateOpen(true);
  }

  return (
    <>
      <div className="flex-1">
        <div className="page-frame page-stack">
          <GameHeader game={game} onRate={openRating} />
          <ExplanationSection gameId={game.id} hasManuals={canAsk} />
          {canAsk || game.conversations_count > 0 ? (
            <ConversationsSection gameId={game.id} canAsk={canAsk} showViewAll />
          ) : null}
          <ManualsSection game={game} />
          {game.manuals.length > 0 ? (
            <p className="flex items-center gap-2 text-xs text-fg-3">
              <FileTextIcon size={14} aria-hidden="true" />
              {t('footer.explanation', { count: game.manuals.length })} ·{' '}
              <span className="mono">{t('footer.pages', { count: totalPages })}</span>
            </p>
          ) : null}
        </div>
      </div>

      <HubComposer game={game} />

      <RateGameDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        gameId={game.id}
        gameName={game.name}
        current={game.my_rating}
        initialScore={presetScore}
      />
    </>
  );
}

function GameHeader({
  game,
  onRate,
}: Readonly<{ game: GameDetail; onRate: (score?: number) => void }>) {
  const { t } = useTranslation('game');
  const { gameIds } = useProcessingManuals();
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 @2xl/app:gap-x-6 @2xl/app:gap-y-2">
      <GameHeroCover name={game.name} processing={gameIds.has(game.id)} />
      <div className="min-w-0 @2xl/app:self-end">
        <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          {game.year_published === null
            ? t('header.boardGame')
            : t('header.boardGameWithYear', { year: game.year_published })}
        </p>
        <h1 className="mt-1 min-w-0 break-words font-display text-2xl font-extrabold leading-tight tracking-tight text-fg @2xl/app:text-4xl">
          {game.name}
        </h1>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 @2xl/app:col-span-1 @2xl/app:self-start">
        <RatingStars value={game.my_rating?.score ?? 0} size={26} align="start" onSelect={onRate} />
        <FollowButton gameId={game.id} following={game.is_following} />
      </div>
    </header>
  );
}

function ExplanationSection({
  gameId,
  hasManuals,
}: Readonly<{ gameId: string; hasManuals: boolean }>) {
  const { t } = useTranslation('game');
  const explanation = useQuery({
    ...gameExplanationQueryOptions(gameId),
    enabled: hasManuals,
  });

  if (!hasManuals) {
    return (
      <Card className="border-dashed border-border-strong bg-surface p-6 text-center">
        <h2 className="font-display text-lg font-bold text-fg">{t('explanation.empty.title')}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg-2">
          {t('explanation.empty.description')}
        </p>
        <Button asChild className="mt-4">
          <Link to="/capture/source" search={{ gameId }}>
            <AddManualIcon size={18} />
            {t('manuals.add')}
          </Link>
        </Button>
      </Card>
    );
  }

  // Un sondeo fallido con datos en cache: mejor seguir mostrando lo que haya.
  if (explanation.isError && explanation.data === undefined) {
    const notFound = explanation.error instanceof ApiError && explanation.error.status === 404;
    return (
      <Card className="bg-surface p-5">
        <p className="text-sm leading-relaxed text-fg">
          {notFound ? t('explanation.error.notFound') : t('explanation.error.failed')}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            explanation.refetch().catch(() => undefined);
          }}
        >
          <ArrowClockwiseIcon data-icon-motion="rotate" aria-hidden="true" size={16} />
          {t('explanation.retry')}
        </Button>
      </Card>
    );
  }

  // Sin datos aún o generando: el resumen llega primero y el resto se rellena;
  // los huecos pendientes se pintan con spinner. Listo: las 4 secciones están.
  const data = explanation.data;
  const sections = data?.sections ?? {};
  if (data?.status === 'failed' && Object.keys(sections).length === 0) {
    return (
      <Card className="border-error/30 bg-error-bg p-5">
        <p className="text-sm leading-relaxed text-fg">{t('explanation.error.failed')}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            explanation.refetch().catch(() => undefined);
          }}
        >
          <ArrowClockwiseIcon data-icon-motion="rotate" aria-hidden="true" size={16} />
          {t('explanation.retry')}
        </Button>
      </Card>
    );
  }
  const live = data?.status === 'generating';
  const busy = data === undefined || live;
  const pick = (key: ExplanationSectionKey) => sections[key]?.answer ?? null;

  return (
    <section
      aria-label={busy ? t('explanation.aria.preparing') : t('explanation.aria.game')}
      aria-busy={busy || undefined}
      className="space-y-3"
    >
      <ExplanationBlocks
        summary={pick('summary')}
        content={{ setup: pick('setup'), turns: pick('turns'), victory: pick('victory') }}
      />
    </section>
  );
}

function ManualsSection({ game }: Readonly<{ game: GameDetail }>) {
  const { t } = useTranslation('game');
  return (
    <section aria-labelledby="game-manuals">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            {t('manuals.sourceLabel')}
          </span>
          <h2 id="game-manuals" className="font-display text-lg font-bold tracking-tight text-fg">
            {t('manuals.heading')}
          </h2>
        </div>
        <Button asChild variant="ghost" className="shrink-0 px-0">
          <Link to="/capture/source" search={{ gameId: game.id }}>
            <AddManualIcon size={18} />
            {t('manuals.add')}
          </Link>
        </Button>
      </div>
      {game.manuals.length === 0 ? (
        <Card className="bg-surface/60 p-4">
          <p className="text-sm text-fg-2">{t('manuals.empty', { gameName: game.name })}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {game.manuals.map((manual) => (
            <ManualCard key={manual.id} manual={manual} />
          ))}
        </div>
      )}
    </section>
  );
}

function ManualCard({ manual }: Readonly<{ manual: GamePoolManual }>) {
  const { t } = useTranslation('game');
  const { t: libraryT } = useTranslation('library');
  const label = manual.title ?? t(manual.source_type === 'pdf' ? 'manuals.pdf' : 'manuals.photos');
  const body = (
    <>
      <ManualThumbnail color={gameColor(label)} stacked={manual.page_count > 1} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold leading-tight text-fg">{label}</p>
        <p className="mono mt-1 text-[11px] text-fg-3">
          {t('manuals.pages', { count: manual.page_count })} · {formatShortDate(manual.created_at)}
        </p>
        {manual.duplicate_page_count > 0 ? (
          <div className="mt-1.5">
            <DuplicatePagesBadge count={manual.duplicate_page_count} passive={manual.is_own} />
          </div>
        ) : null}
        {manual.is_own ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <ExtractedTextIcon size={13} />
            {t('manuals.extracted')}
          </span>
        ) : (
          <>
            <HelpIndicator icon={UsersThreeIcon} label={t('manuals.shared')} className="mt-0.5" />
            <UploadedBy authorName={manual.author_name} />
          </>
        )}
      </div>
    </>
  );

  // El manual propio se abre clicando la tarjeta entera, no un mini-enlace.
  if (manual.is_own) {
    const link = (
      <Link
        to="/manual/$manualId"
        params={{ manualId: manual.id }}
        aria-label={t('manuals.viewExtracted', { label })}
        className="manual-open icon-feedback flex items-center gap-3.5 rounded-2xl p-3.5"
      >
        {body}
        <CaretRightIcon
          data-icon-motion="forward"
          size={18}
          className="shrink-0 text-fg-3"
          aria-hidden="true"
        />
      </Link>
    );
    return (
      <Card className="manual-interaction transition-none hover:border-border-strong">
        {manual.duplicate_page_count > 0 ? (
          <Tooltip
            content={libraryT('duplicatePages.detail', { count: manual.duplicate_page_count })}
          >
            {link}
          </Tooltip>
        ) : (
          link
        )}
      </Card>
    );
  }
  return <Card className="flex items-center gap-3.5 p-3.5 opacity-90">{body}</Card>;
}

function HubComposer({ game }: Readonly<{ game: GameDetail }>) {
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [writing, setWriting] = useState(false);
  const canAsk = game.manuals.length > 0;

  function ask(q: string): void {
    const trimmed = q.trim();
    if (trimmed.length === 0 || !canAsk) return;
    navigate({
      to: '/chat/$gameId',
      params: { gameId: game.id },
      search: { q: trimmed },
    }).catch(() => undefined);
  }

  if (!canAsk) return null;

  return (
    <div
      className="sticky bottom-0 z-10 border-t border-border bg-bg/95 pt-2.5 backdrop-blur"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <div className="page-frame">
        <SuggestedQuestions onSelect={ask} suspended={writing || question.length > 0} />
        <div
          onFocus={() => setWriting(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setWriting(false);
          }}
        >
          <MessageComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => ask(question)}
            placeholder={t('composer.placeholder', { gameName: game.name })}
            maxLength={QUESTION_MAX}
          />
        </div>
      </div>
    </div>
  );
}

function ExplanationSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="h-[116px] animate-pulse rounded-2xl bg-surface-2 [@media(pointer:coarse)]:h-32" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

function HubSkeleton() {
  return (
    <div aria-hidden="true" className="page-frame page-stack">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 @2xl/app:gap-x-6 @2xl/app:gap-y-2">
        <div
          className={`shrink-0 animate-pulse rounded-3xl bg-surface-2 @2xl/app:row-span-2 ${GAME_HERO_COVER_CLASS}`}
        />
        <div className="min-w-0 space-y-2 @2xl/app:self-end">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
          <div className="h-[30px] w-3/4 animate-pulse rounded-xl bg-surface-2 @2xl/app:h-[45px]" />
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 @2xl/app:col-span-1 @2xl/app:self-start">
          <div className="-ml-[7px] h-11 w-[200px] shrink-0 animate-pulse rounded-xl bg-surface-2" />
          <div className="w-36 shrink-0">
            <div className="size-11 animate-pulse rounded-full bg-surface-2" />
          </div>
        </div>
      </div>
      <ExplanationSkeleton />
    </div>
  );
}

function HubError({
  error,
  retrying,
  onRetry,
}: Readonly<{
  error: Error | null;
  retrying: boolean;
  onRetry: () => Promise<unknown>;
}>) {
  const { t } = useTranslation('game');
  const { t: commonT } = useTranslation();
  // La consulta limpia su error al reintentar, conservamos el mensaje mientras espera.
  const [failure, setFailure] = useState(error);
  if (error && error !== failure) setFailure(error);
  const notFound = failure instanceof ApiError && failure.status === 404;
  const offline = mapApiError(failure).code === 'network';
  const kind = notFound ? 'not-found' : offline ? 'offline' : 'error';
  const copy = ({ 'not-found': 'notFound', offline: 'connection', error: 'load' } as const)[kind];
  return (
    <div className="grid min-h-[60dvh] items-center px-6 py-8">
      <RecoveryContent
        kind={kind}
        retrying={retrying}
        title={t(`error.${copy}Title`)}
        description={t(`error.${copy}Description`)}
      >
        <div className={recoveryStyles.actions}>
          {!notFound && (
            <Button
              className={recoveryStyles.primary}
              loading={retrying}
              onClick={() => void onRetry()}
            >
              <ArrowClockwiseIcon data-icon-motion="rotate" size={20} aria-hidden="true" />
              {commonT('actions.retry')}
            </Button>
          )}
          <Button
            asChild
            variant={notFound ? 'primary' : 'secondary'}
            className={notFound ? recoveryStyles.primary : recoveryStyles.secondary}
          >
            <Link to="/history">{t('error.backToHistory')}</Link>
          </Button>
        </div>
      </RecoveryContent>
    </div>
  );
}
